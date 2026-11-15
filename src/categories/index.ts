/**
 * Kategorie-Registry.
 *
 * Neue Kategorie ergänzen: eine Datei `src/categories/<name>.ts` anlegen, die eine
 * `CategoryDef` als Default exportiert. Sie wird automatisch geladen.
 */
import type { CategoryDef } from '../types'

const modules = import.meta.glob<{ default: CategoryDef }>(
  ['./*.ts', '!./index.ts', '!./helpers.ts'],
  {
    eager: true,
  },
)

const OUTPUT_KEY = /^[a-z][a-zA-Z0-9_]{0,30}$/

/** Prüft eine Kategorie auf Konfigurationsfehler; wirft mit klarer Meldung. */
export function validateCategory(category: CategoryDef): void {
  const where = `Kategorie "${category.id}"`
  if (!/^[a-z][a-z0-9-]*$/.test(category.id)) throw new Error(`${where}: ungültige id.`)
  if (category.outputs.length === 0) throw new Error(`${where}: keine Ausgaben definiert.`)

  const fieldIds = new Set<string>()
  for (const field of category.fields) {
    if (fieldIds.has(field.id)) throw new Error(`${where}: Feld-ID "${field.id}" doppelt.`)
    fieldIds.add(field.id)
  }
  const outputKeys = new Set<string>()
  for (const output of category.outputs) {
    if (!OUTPUT_KEY.test(output.key))
      throw new Error(`${where}: ungültiger Ausgabe-Key "${output.key}".`)
    if (outputKeys.has(output.key))
      throw new Error(`${where}: Ausgabe-Key "${output.key}" doppelt.`)
    outputKeys.add(output.key)
  }
}

function load(): CategoryDef[] {
  const found = Object.values(modules).map((m) => m.default)
  const ids = new Set<string>()
  for (const category of found) {
    validateCategory(category)
    if (ids.has(category.id)) throw new Error(`Kategorie-ID "${category.id}" doppelt.`)
    ids.add(category.id)
  }
  return found.sort((a, b) => a.order - b.order)
}

export const categories: readonly CategoryDef[] = load()

export function getCategory(id: string): CategoryDef | undefined {
  return categories.find((c) => c.id === id)
}
