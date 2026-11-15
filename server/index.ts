import dotenv from 'dotenv'
import { promises as fs } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import type { MessagesClient } from './ai'
import { createApp } from './app'
import { loadConfig } from './config'
import { FileStore } from './store'

async function main(): Promise<void> {
  // override: Die .env ist massgeblich. Ein in der Shell oder von PM2 vererbter
  // Wert (z. B. ein fremder ANTHROPIC_API_KEY) darf sie nicht überstimmen.
  dotenv.config({ override: true, quiet: true })
  const config = loadConfig()
  await fs.mkdir(config.dataDir, { recursive: true, mode: 0o700 })

  const store = new FileStore(config.dataDir)
  await store.read() // früh scheitern, falls die Datei beschädigt ist

  const anthropic = config.anthropicApiKey
    ? (new Anthropic({
        apiKey: config.anthropicApiKey,
        maxRetries: 1,
      }) as unknown as MessagesClient)
    : undefined

  const app = createApp({ config, store, anthropic })
  const server = app.listen(config.port, config.host, () => {
    console.log(`[prompt-studio] http://${config.host}:${config.port}`)
    console.log(
      `[prompt-studio] Passwortschutz: ${config.authDisabled ? 'AUS (nur Entwicklung)' : 'an'}`,
    )
    console.log(`[prompt-studio] Turbo: ${anthropic ? config.model : 'aus (kein API-Key)'}`)
  })

  const shutdown = (): void => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err: unknown) => {
  console.error(`[prompt-studio] Start abgebrochen: ${(err as Error).message}`)
  process.exit(1)
})
