/** Konstanten und Startwerte ohne Laufzeit-Abhängigkeiten (auch im Browser-Bundle). */
import type { StoreDoc } from './schema'

export const SCHEMA_VERSION = 1
export const HISTORY_LIMIT = 500
export const KEYWORD_COUNT = 25
export const MAX_VARIANTS = 5

export function emptyStore(): StoreDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    rev: 0,
    presets: [],
    blocks: [],
    favorites: [],
    history: [],
    settings: { variantCount: 3 },
  }
}
