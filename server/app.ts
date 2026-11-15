import { existsSync } from 'node:fs'
import path from 'node:path'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { generateRequestSchema, storeSchema } from '../shared/schema'
import { AiError, generate, type MessagesClient } from './ai'
import { basicAuth } from './auth'
import type { AppConfig } from './config'
import { ConflictError, CorruptStoreError, type FileStore } from './store'

export interface AppDeps {
  config: AppConfig
  store: FileStore
  /** Fehlt der Client (kein API-Key), antwortet der Turbo-Endpunkt mit 503. */
  anthropic?: MessagesClient
}

const MAX_CONCURRENT_AI = 2

function firstIssue(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  const issue = error.issues[0]
  if (!issue) return 'Ungültige Eingabe.'
  const where = issue.path.map(String).join('.')
  return where ? `${where}: ${issue.message}` : issue.message
}

export function createApp({ config, store, anthropic }: AppDeps): Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1) // hinter Nginx: req.ip = echte Client-Adresse

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  // Einziger Pfad ohne Anmeldung; verrät nichts ausser "läuft".
  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  if (!config.authDisabled) {
    app.use(basicAuth({ user: config.authUser, password: config.authPassword }))
  }

  app.use(express.json({ limit: '4mb' }))

  app.get('/api/status', (_req, res) => {
    res.json({ aiConfigured: anthropic !== undefined, model: config.model })
  })

  app.get('/api/store', async (_req, res) => {
    res.json(await store.read())
  })

  app.put('/api/store', async (req, res) => {
    const parsed = storeSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    res.json(await store.write(parsed.data))
  })

  app.post('/api/store/import', async (req, res) => {
    const parsed = storeSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: `Import abgelehnt – ${firstIssue(parsed.error)}` })
      return
    }
    res.json(await store.replace(parsed.data))
  })

  app.get('/api/store/export', async (_req, res) => {
    const stamp = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Disposition', `attachment; filename="prompt-studio-${stamp}.json"`)
    res.json(await store.read())
  })

  let running = 0
  app.post('/api/ai/generate', async (req, res) => {
    if (!anthropic) {
      res.status(503).json({ error: 'Turbo ist aus: ANTHROPIC_API_KEY fehlt in der .env.' })
      return
    }
    const parsed = generateRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    if (running >= MAX_CONCURRENT_AI) {
      res.status(429).json({ error: 'Es laufen bereits zwei Turbo-Anfragen.' })
      return
    }

    // Bricht der Client ab, wird auch der Aufruf bei Anthropic beendet.
    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })

    running++
    try {
      const result = await generate(anthropic, parsed.data, {
        model: config.model,
        maxTokens: config.aiMaxTokens,
        timeoutMs: config.aiTimeoutMs,
        signal: controller.signal,
      })
      res.json(result)
    } finally {
      running--
    }
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Nicht gefunden.' })
  })

  // Gebautes Frontend ausliefern (im Dev übernimmt Vite).
  const indexFile = path.join(config.distDir, 'index.html')
  if (existsSync(indexFile)) {
    app.use(express.static(config.distDir, { index: false, maxAge: 0 }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next()
      res.sendFile(indexFile)
    })
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Nicht gefunden.' })
  })

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return
    if (err instanceof ConflictError) {
      res.status(409).json({ error: err.message, current: err.current })
      return
    }
    if (err instanceof CorruptStoreError) {
      res.status(500).json({ error: err.message })
      return
    }
    if (err instanceof AiError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    const e = err as { status?: number; type?: string; name?: string; message?: string }
    if (e?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Die Daten sind zu gross.' })
      return
    }
    if (e?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Ungültiges JSON.' })
      return
    }
    if (e?.name === 'APIUserAbortError') {
      res.status(499).json({ error: 'Abgebrochen.' })
      return
    }
    if (e?.name === 'APIConnectionTimeoutError') {
      res.status(504).json({ error: 'Zeitüberschreitung bei Anthropic.' })
      return
    }
    // Fehler der Anthropic-API: Status weiterreichen, Details nur ins Log.
    if (typeof e?.status === 'number' && e.status >= 400 && e.status < 600) {
      console.error('[ai]', e.status, e.message)
      const text =
        e.status === 401
          ? 'Der ANTHROPIC_API_KEY ist ungültig.'
          : e.status === 429
            ? 'Anthropic meldet ein Ratenlimit. Kurz warten und erneut versuchen.'
            : e.status === 404
              ? 'Das Modell wurde nicht gefunden. ANTHROPIC_MODEL in der .env prüfen.'
              : `Anthropic meldet einen Fehler (${e.status}).`
      res.status(502).json({ error: text })
      return
    }
    console.error('[server]', err)
    res.status(500).json({ error: 'Interner Fehler.' })
  })

  return app
}
