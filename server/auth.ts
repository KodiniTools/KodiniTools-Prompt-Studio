import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

export interface AuthOptions {
  user: string
  password: string
  /** Fehlversuche pro IP, bevor gesperrt wird. */
  maxFailures?: number
  windowMs?: number
  now?: () => number
}

interface FailureEntry {
  count: number
  resetAt: number
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/** Vergleich ohne Laufzeitunterschied, auch bei ungleicher Länge. */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b))
}

function parseBasic(header: string | undefined): { user: string; password: string } | null {
  if (!header || !header.startsWith('Basic ')) return null
  let decoded: string
  try {
    decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8')
  } catch {
    return null
  }
  const sep = decoded.indexOf(':')
  if (sep < 0) return null
  return { user: decoded.slice(0, sep), password: decoded.slice(sep + 1) }
}

/**
 * Basic Auth für die ganze App. Liegt bewusst im Server und nicht in Nginx:
 * Der Schutz reist mit dem Code und kann durch eine Nginx-Änderung nicht verloren gehen.
 */
export function basicAuth(options: AuthOptions): RequestHandler {
  const maxFailures = options.maxFailures ?? 10
  const windowMs = options.windowMs ?? 15 * 60 * 1000
  const now = options.now ?? Date.now
  const failures = new Map<string, FailureEntry>()

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? 'unknown'
    const t = now()
    const entry = failures.get(ip)
    if (entry && entry.resetAt <= t) failures.delete(ip)

    const blocked = failures.get(ip)
    if (blocked && blocked.count >= maxFailures) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((blocked.resetAt - t) / 1000))))
      res.status(429).json({ error: 'Zu viele Fehlversuche. Bitte später erneut versuchen.' })
      return
    }

    const creds = parseBasic(req.headers.authorization)
    // Beide Vergleiche immer ausführen, damit die Antwortzeit nichts verrät.
    const userOk = safeEqual(creds?.user ?? '', options.user)
    const passOk = safeEqual(creds?.password ?? '', options.password)

    if (creds && userOk && passOk) {
      failures.delete(ip)
      next()
      return
    }

    if (creds) {
      const current = failures.get(ip)
      if (current) current.count += 1
      else failures.set(ip, { count: 1, resetAt: t + windowMs })
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Prompt-Studio", charset="UTF-8"')
    res.status(401).json({ error: 'Anmeldung erforderlich.' })
  }
}
