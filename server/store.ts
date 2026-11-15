import { promises as fs } from 'node:fs'
import path from 'node:path'
import { emptyStore, storeSchema, type StoreDoc } from '../shared/schema'

export class ConflictError extends Error {
  constructor(public readonly current: StoreDoc) {
    super('Der Datenstand wurde inzwischen an anderer Stelle geändert.')
    this.name = 'ConflictError'
  }
}

export class CorruptStoreError extends Error {
  constructor(file: string, detail: string) {
    super(`Die Datei ${file} ist beschädigt und wurde nicht überschrieben: ${detail}`)
    this.name = 'CorruptStoreError'
  }
}

export interface FileStoreOptions {
  /** Höchstens so viele Backups bleiben erhalten. */
  maxBackups?: number
  /** Mindestabstand zwischen zwei automatischen Backups. */
  backupIntervalMs?: number
  now?: () => number
}

/**
 * Persistenz in einer JSON-Datei.
 * - Schreiben ist atomar (temporäre Datei, dann Umbenennen).
 * - Vor dem Überschreiben entsteht höchstens einmal pro Intervall ein Backup.
 * - Schreibzugriffe laufen nacheinander.
 */
export class FileStore {
  private readonly file: string
  private readonly backupDir: string
  private readonly maxBackups: number
  private readonly backupIntervalMs: number
  private readonly now: () => number
  private queue: Promise<unknown> = Promise.resolve()

  constructor(dataDir: string, options: FileStoreOptions = {}) {
    this.file = path.join(dataDir, 'store.json')
    this.backupDir = path.join(dataDir, 'backups')
    this.maxBackups = options.maxBackups ?? 10
    this.backupIntervalMs = options.backupIntervalMs ?? 60 * 60 * 1000
    this.now = options.now ?? Date.now
  }

  async read(): Promise<StoreDoc> {
    let raw: string
    try {
      raw = await fs.readFile(this.file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore()
      throw err
    }
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch (err) {
      throw new CorruptStoreError(this.file, (err as Error).message)
    }
    const parsed = storeSchema.safeParse(json)
    if (!parsed.success) {
      throw new CorruptStoreError(this.file, parsed.error.issues[0]?.message ?? 'ungültig')
    }
    return parsed.data
  }

  /** Speichert, wenn `doc.rev` dem gespeicherten Stand entspricht. */
  write(doc: StoreDoc): Promise<StoreDoc> {
    return this.enqueue(async () => {
      const current = await this.read()
      if (doc.rev !== current.rev) throw new ConflictError(current)
      return this.persist({ ...doc, rev: current.rev + 1 }, false)
    })
  }

  /** Ersetzt den Stand vollständig (Import). Erzwingt vorher ein Backup. */
  replace(doc: StoreDoc): Promise<StoreDoc> {
    return this.enqueue(async () => {
      let rev = 0
      try {
        rev = (await this.read()).rev
      } catch (err) {
        // Ein beschädigter Stand darf durch einen Import ersetzt werden; das Backup sichert ihn.
        if (!(err instanceof CorruptStoreError)) throw err
      }
      return this.persist({ ...doc, rev: rev + 1 }, true)
    })
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => undefined)
    return run
  }

  private async persist(doc: StoreDoc, forceBackup: boolean): Promise<StoreDoc> {
    await fs.mkdir(this.backupDir, { recursive: true })
    await this.backup(forceBackup)
    const tmp = `${this.file}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(doc, null, 2), { encoding: 'utf8', mode: 0o600 })
    await fs.rename(tmp, this.file)
    return doc
  }

  private async backup(force: boolean): Promise<void> {
    try {
      await fs.access(this.file)
    } catch {
      return // noch nichts zu sichern
    }
    const names = (await fs.readdir(this.backupDir))
      .filter((n) => /^store-\d+\.json$/.test(n))
      .sort()
    const latest = names.at(-1)
    const latestTime = latest ? Number(latest.slice(6, -5)) : 0
    const t = this.now()
    if (!force && t - latestTime < this.backupIntervalMs) return

    const name = `store-${String(t).padStart(15, '0')}.json`
    await fs.copyFile(this.file, path.join(this.backupDir, name))
    const all = [...names, name].sort()
    for (const old of all.slice(0, Math.max(0, all.length - this.maxBackups))) {
      await fs.rm(path.join(this.backupDir, old), { force: true })
    }
  }
}
