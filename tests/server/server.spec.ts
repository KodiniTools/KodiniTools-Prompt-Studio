import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyStore, KEYWORD_COUNT, type GenerateRequest, type StoreDoc } from '../../shared/schema'
import { AiError, buildJsonSchema, generate, type MessagesClient } from '../../server/ai'
import { createApp } from '../../server/app'
import { loadConfig, type AppConfig } from '../../server/config'
import { ConflictError, CorruptStoreError, FileStore } from '../../server/store'

const PASSWORD = 'ein-langes-passwort'
const AUTH = `Basic ${Buffer.from(`kodini:${PASSWORD}`).toString('base64')}`

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ps-'))
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

function config(patch: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig({ AUTH_PASSWORD: PASSWORD, DATA_DIR: dir }, dir),
    ...patch,
  }
}

function keywords(n: number) {
  return Array.from({ length: n }, (_, i) => ({ keyword: `Keyword ${i}`, weight: (i % 10) + 1 }))
}

function reply(json: unknown, stop_reason = 'end_turn') {
  return {
    content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }],
    stop_reason,
    usage: { input_tokens: 10, output_tokens: 20 },
  }
}

function client(...replies: Array<ReturnType<typeof reply>>) {
  const create = vi.fn()
  for (const r of replies) create.mockResolvedValueOnce(r)
  return { client: { messages: { create } } as unknown as MessagesClient, create }
}

const baseRequest: GenerateRequest = {
  categoryId: 'stock-photo',
  system: 'You are a prompt engineer.',
  brief: 'a red bicycle',
  outputs: [
    { key: 'prompt', label: 'Prompt', limit: 20 },
    { key: 'negative', label: 'Negative Prompt' },
  ],
  variantCount: 2,
  stockSeller: false,
}

const aiOptions = { model: 'claude-sonnet-5-5', maxTokens: 1000, timeoutMs: 1000 }

function variant(label: string, prompt = 'short') {
  return {
    label,
    outputs: [
      { key: 'prompt', text: prompt },
      { key: 'negative', text: 'blurry' },
    ],
  }
}

describe('config', () => {
  it('startet nicht ohne ausreichend langes Passwort', () => {
    expect(() => loadConfig({}, dir)).toThrow(/AUTH_PASSWORD/)
    expect(() => loadConfig({ AUTH_PASSWORD: 'kurz' }, dir)).toThrow(/AUTH_PASSWORD/)
    expect(() => loadConfig({ AUTH_PASSWORD: PASSWORD, AUTH_USER: 'a:b' }, dir)).toThrow(
      /AUTH_USER/,
    )
  })

  it('erlaubt den Start ohne Passwort nur mit ausdrücklichem AUTH_DISABLED', () => {
    expect(loadConfig({ AUTH_DISABLED: 'true' }, dir).authDisabled).toBe(true)
    expect(() => loadConfig({ AUTH_DISABLED: '1' }, dir)).toThrow()
  })

  it('setzt Defaults und prüft Zahlen', () => {
    const c = loadConfig({ AUTH_PASSWORD: PASSWORD }, dir)
    expect(c).toMatchObject({ host: '127.0.0.1', port: 3022, model: 'claude-sonnet-5-5' })
    expect(() => loadConfig({ AUTH_PASSWORD: PASSWORD, PORT: 'abc' }, dir)).toThrow(/PORT/)
  })
})

describe('FileStore', () => {
  it('liefert einen leeren Stand, speichert atomar und zählt die Revision hoch', async () => {
    const store = new FileStore(dir)
    expect(await store.read()).toEqual(emptyStore())
    const saved = await store.write({ ...emptyStore(), settings: { variantCount: 5 } })
    expect(saved.rev).toBe(1)
    expect((await store.read()).settings.variantCount).toBe(5)
    expect((await fs.readdir(dir)).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('lehnt veraltete Revisionen ab', async () => {
    const store = new FileStore(dir)
    await store.write(emptyStore())
    await expect(store.write(emptyStore())).rejects.toBeInstanceOf(ConflictError)
  })

  it('überschreibt eine beschädigte Datei nicht', async () => {
    await fs.writeFile(path.join(dir, 'store.json'), '{ kaputt')
    const store = new FileStore(dir)
    await expect(store.read()).rejects.toBeInstanceOf(CorruptStoreError)
    await expect(store.write(emptyStore())).rejects.toBeInstanceOf(CorruptStoreError)
    expect(await fs.readFile(path.join(dir, 'store.json'), 'utf8')).toBe('{ kaputt')
  })

  it('legt höchstens ein Backup pro Intervall an und behält nur die neuesten', async () => {
    let now = 1_000_000
    const store = new FileStore(dir, { maxBackups: 2, backupIntervalMs: 1000, now: () => now })
    let doc = await store.write(emptyStore()) // erste Datei: nichts zu sichern
    doc = await store.write(doc) // Backup 1
    doc = await store.write(doc) // im Intervall: kein Backup
    const backups = () => fs.readdir(path.join(dir, 'backups'))
    expect(await backups()).toHaveLength(1)
    for (let i = 0; i < 3; i++) {
      now += 2000
      doc = await store.write(doc)
    }
    expect(await backups()).toHaveLength(2)
  })

  it('Import ersetzt den Stand und sichert den alten immer', async () => {
    const store = new FileStore(dir)
    await store.write({
      ...emptyStore(),
      blocks: [{ id: 'a', categoryId: '*', label: 'L', text: 'T' }],
    })
    const replaced = await store.replace({ ...emptyStore(), rev: 99 })
    expect(replaced.rev).toBe(2)
    expect(replaced.blocks).toEqual([])
    const [backup] = await fs.readdir(path.join(dir, 'backups'))
    const old = JSON.parse(
      await fs.readFile(path.join(dir, 'backups', backup!), 'utf8'),
    ) as StoreDoc
    expect(old.blocks).toHaveLength(1)
  })

  it('führt gleichzeitige Schreibzugriffe nacheinander aus', async () => {
    const store = new FileStore(dir)
    const results = await Promise.allSettled([store.write(emptyStore()), store.write(emptyStore())])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
  })
})

describe('generate', () => {
  it('baut ein Schema mit additionalProperties:false und Stock nur auf Wunsch', () => {
    const plain = buildJsonSchema(baseRequest) as {
      properties: Record<string, unknown>
      additionalProperties: boolean
    }
    expect(plain.additionalProperties).toBe(false)
    expect(plain.properties.stock).toBeUndefined()
    const stock = buildJsonSchema({ ...baseRequest, stockSeller: true }) as { required: string[] }
    expect(stock.required).toContain('stock')
    expect(JSON.stringify(plain)).not.toMatch(/minItems|maxItems|maxLength/)
  })

  it('sendet output_config und normalisiert die Antwort', async () => {
    const { client: c, create } = client(
      reply({ variants: [variant('A'), variant('B', 'x'.repeat(30))] }),
    )
    const result = await generate(c, baseRequest, aiOptions)
    const body = create.mock.calls[0]?.[0] as {
      model: string
      output_config: { format: { type: string } }
      system: string
    }
    expect(body.model).toBe('claude-sonnet-5-5')
    expect(body.output_config.format.type).toBe('json_schema')
    expect(body.system).toContain('exactly 2 variant')
    expect(result.variants).toEqual([
      { label: 'A', outputs: { prompt: 'short', negative: 'blurry' } },
      { label: 'B', outputs: { prompt: 'x'.repeat(30), negative: 'blurry' } },
    ])
    expect(result.warnings).toEqual(['Variante 2, Prompt: 30 Zeichen, Limit 20.'])
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 })
  })

  it('fordert bei unvollständiger Antwort genau einmal eine Korrektur an', async () => {
    const { client: c, create } = client(
      reply({ variants: [variant('A')] }),
      reply({ variants: [variant('A'), variant('B')] }),
    )
    const result = await generate(c, baseRequest, aiOptions)
    expect(create).toHaveBeenCalledTimes(2)
    const second = create.mock.calls[1]?.[0] as {
      messages: Array<{ role: string; content: string }>
    }
    expect(second.messages.at(-1)?.content).toContain('Expected 2 variants, got 1')
    expect(result.variants).toHaveLength(2)
    expect(result.warnings).toEqual([])
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 40 })
  })

  it('liefert nach zwei Versuchen das Beste mit Warnung statt eines Fehlers', async () => {
    const { client: c, create } = client(reply({ variants: [variant('A')] }), reply('kein json'))
    const result = await generate(c, baseRequest, aiOptions)
    expect(create).toHaveBeenCalledTimes(2)
    expect(result.variants).toHaveLength(1)
    expect(result.warnings).toContain('Nur 1 von 2 Varianten erhalten.')
  })

  it('Stock: entfernt Doppelte, sortiert nach Gewicht, kürzt auf 25', async () => {
    const list = [...keywords(30), { keyword: 'KEYWORD 0', weight: 3 }]
    const { client: c } = client(
      reply({
        variants: [variant('A'), variant('B')],
        stock: { title: ' Red bicycle ', keywords: list },
      }),
    )
    const result = await generate(c, { ...baseRequest, stockSeller: true }, aiOptions)
    expect(result.stock?.title).toBe('Red bicycle')
    expect(result.stock?.keywords).toHaveLength(KEYWORD_COUNT)
    const weights = result.stock?.keywords.map((k) => k.weight) ?? []
    expect(weights).toEqual([...weights].sort((a, b) => b - a))
    expect(result.stock?.keywords.every((k) => k.keyword === k.keyword.toLowerCase())).toBe(true)
  })

  it('Stock: zu wenige Keywords lösen eine Korrektur aus', async () => {
    const { client: c, create } = client(
      reply({
        variants: [variant('A'), variant('B')],
        stock: { title: 'T', keywords: keywords(10) },
      }),
      reply({
        variants: [variant('A'), variant('B')],
        stock: { title: 'T', keywords: keywords(25) },
      }),
    )
    const result = await generate(c, { ...baseRequest, stockSeller: true }, aiOptions)
    expect(create).toHaveBeenCalledTimes(2)
    expect(result.stock?.keywords).toHaveLength(25)
  })

  it('meldet Ablehnung, abgeschnittene und unbrauchbare Antworten klar', async () => {
    await expect(
      generate(client(reply({}, 'refusal')).client, baseRequest, aiOptions),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      generate(client(reply('{"var', 'max_tokens')).client, baseRequest, aiOptions),
    ).rejects.toThrow(/abgeschnitten/)
    await expect(
      generate(client(reply('x'), reply('y')).client, baseRequest, aiOptions),
    ).rejects.toBeInstanceOf(AiError)
  })
})

describe('HTTP', () => {
  function app(patch: Partial<AppConfig> = {}, anthropic?: MessagesClient) {
    return createApp({ config: config(patch), store: new FileStore(dir), anthropic })
  }

  it('schützt alles ausser /health mit Basic Auth', async () => {
    const a = app()
    expect((await request(a).get('/health')).status).toBe(200)
    for (const p of ['/', '/api/store', '/api/status', '/api/store/export', '/irgendwas']) {
      const res = await request(a).get(p)
      expect(res.status, p).toBe(401)
      expect(res.headers['www-authenticate']).toContain('Basic')
    }
    expect((await request(a).post('/api/ai/generate').send(baseRequest)).status).toBe(401)
    expect((await request(a).put('/api/store').send(emptyStore())).status).toBe(401)
    const wrong = `Basic ${Buffer.from('kodini:falsch').toString('base64')}`
    expect((await request(a).get('/api/store').set('Authorization', wrong)).status).toBe(401)
    expect((await request(a).get('/api/store').set('Authorization', AUTH)).status).toBe(200)
  })

  it('sperrt nach zehn Fehlversuchen', async () => {
    const a = app()
    const wrong = `Basic ${Buffer.from('kodini:falsch').toString('base64')}`
    for (let i = 0; i < 10; i++) await request(a).get('/api/store').set('Authorization', wrong)
    const res = await request(a).get('/api/store').set('Authorization', AUTH)
    expect(res.status).toBe(429)
    expect(res.headers['retry-after']).toBeDefined()
  })

  it('Store: lesen, schreiben, Konflikt, ungültige Daten, Import, Export', async () => {
    const a = app()
    const get = () => request(a).get('/api/store').set('Authorization', AUTH)
    const put = (doc: unknown) =>
      request(a)
        .put('/api/store')
        .set('Authorization', AUTH)
        .send(doc as object)

    expect((await get()).body).toEqual(emptyStore())
    const saved = await put({ ...emptyStore(), settings: { variantCount: 1 } })
    expect(saved.body.rev).toBe(1)

    const conflict = await put(emptyStore())
    expect(conflict.status).toBe(409)
    expect(conflict.body.current.rev).toBe(1)

    const invalid = await put({ ...emptyStore(), rev: 1, presets: 'nein' })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error).toContain('presets')

    const imported = await request(a)
      .post('/api/store/import')
      .set('Authorization', AUTH)
      .send({ ...emptyStore(), settings: { variantCount: 5 } })
    expect(imported.body).toMatchObject({ rev: 2, settings: { variantCount: 5 } })

    const exported = await request(a).get('/api/store/export').set('Authorization', AUTH)
    expect(exported.headers['content-disposition']).toMatch(/attachment; filename="prompt-studio-/)
    expect(exported.body.rev).toBe(2)
  })

  it('Turbo: 503 ohne Key, 400 bei ungültiger Anfrage, Ergebnis mit Client', async () => {
    const without = await request(app())
      .post('/api/ai/generate')
      .set('Authorization', AUTH)
      .send(baseRequest)
    expect(without.status).toBe(503)

    const { client: c } = client(reply({ variants: [variant('A'), variant('B')] }))
    const a = app({}, c)
    const bad = await request(a)
      .post('/api/ai/generate')
      .set('Authorization', AUTH)
      .send({ ...baseRequest, variantCount: 9 })
    expect(bad.status).toBe(400)
    const ok = await request(a)
      .post('/api/ai/generate')
      .set('Authorization', AUTH)
      .send(baseRequest)
    expect(ok.status).toBe(200)
    expect(ok.body.variants).toHaveLength(2)
    expect((await request(a).get('/api/status').set('Authorization', AUTH)).body).toEqual({
      aiConfigured: true,
      model: 'claude-sonnet-5-5',
    })
  })

  it('Turbo: übersetzt Anthropic-Fehler, ohne Details nach aussen zu geben', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('invalid x-api-key sk-ant-geheim'), { status: 401 }),
      )
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await request(app({}, { messages: { create } } as unknown as MessagesClient))
      .post('/api/ai/generate')
      .set('Authorization', AUTH)
      .send(baseRequest)
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('Der ANTHROPIC_API_KEY ist ungültig.')
    expect(JSON.stringify(res.body)).not.toContain('sk-ant')
  })

  it('liefert das gebaute Frontend nur mit Anmeldung und ohne Auth im Entwicklungsmodus', async () => {
    const dist = path.join(dir, 'dist')
    await fs.mkdir(dist)
    await fs.writeFile(path.join(dist, 'index.html'), '<!doctype html><title>PS</title>')
    const a = app({ distDir: dist })
    expect((await request(a).get('/')).status).toBe(401)
    expect((await request(a).get('/').set('Authorization', AUTH)).text).toContain(
      '<title>PS</title>',
    )
    expect((await request(a).get('/api/gibtsnicht').set('Authorization', AUTH)).status).toBe(404)

    const open = app({ distDir: dist, authDisabled: true })
    expect((await request(open).get('/api/store')).status).toBe(200)
  })
})
