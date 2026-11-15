import path from 'node:path'

export interface AppConfig {
  host: string
  port: number
  dataDir: string
  distDir: string
  anthropicApiKey: string
  model: string
  aiMaxTokens: number
  aiTimeoutMs: number
  authUser: string
  authPassword: string
  authDisabled: boolean
}

export const MIN_PASSWORD_LENGTH = 12

function int(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} muss eine positive ganze Zahl sein.`)
  return n
}

/**
 * Liest die Konfiguration aus der Umgebung.
 * Ohne Passwort startet der Server nicht – ausser AUTH_DISABLED=true ist ausdrücklich gesetzt.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): AppConfig {
  const authDisabled = env.AUTH_DISABLED === 'true'
  const authPassword = env.AUTH_PASSWORD ?? ''
  const authUser = (env.AUTH_USER ?? 'kodini').trim()

  if (!authDisabled) {
    if (authPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `AUTH_PASSWORD fehlt oder ist kürzer als ${MIN_PASSWORD_LENGTH} Zeichen. ` +
          'Setze es in der .env (oder AUTH_DISABLED=true nur für lokale Entwicklung).',
      )
    }
    if (authUser === '' || authUser.includes(':')) {
      throw new Error('AUTH_USER darf nicht leer sein und keinen Doppelpunkt enthalten.')
    }
  }

  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port: int(env.PORT, 3022, 'PORT'),
    dataDir: path.resolve(cwd, env.DATA_DIR?.trim() || './data'),
    distDir: path.resolve(cwd, 'dist'),
    anthropicApiKey: (env.ANTHROPIC_API_KEY ?? '').trim(),
    model: env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5',
    aiMaxTokens: int(env.AI_MAX_TOKENS, 8000, 'AI_MAX_TOKENS'),
    aiTimeoutMs: int(env.AI_TIMEOUT_MS, 120_000, 'AI_TIMEOUT_MS'),
    authUser,
    authPassword,
    authDisabled,
  }
}
