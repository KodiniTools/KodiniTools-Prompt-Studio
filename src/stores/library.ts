import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { emptyStore, HISTORY_LIMIT } from '../../shared/defaults'
import type { Block, Preset, SavedPrompt, Settings, StoreDoc, Values } from '../../shared/schema'
import { api, ApiError } from '../lib/api'
import { newId } from '../lib/text'

export type SaveState = 'idle' | 'loading' | 'dirty' | 'saving' | 'saved' | 'error'

const SAVE_DELAY_MS = 500

function sameOutputs(a: SavedPrompt, b: SavedPrompt): boolean {
  return a.categoryId === b.categoryId && JSON.stringify(a.outputs) === JSON.stringify(b.outputs)
}

/**
 * Dauerhafte Daten: Presets, Bausteine, Favoriten, Verlauf, Einstellungen.
 * Einzige Quelle der Wahrheit ist die JSON-Datei auf dem Server.
 */
export const useLibraryStore = defineStore('library', () => {
  const doc = ref<StoreDoc>(emptyStore())
  const loaded = ref(false)
  const state = ref<SaveState>('idle')
  const message = ref('')

  let timer: ReturnType<typeof setTimeout> | undefined
  let saving = false
  let dirty = false

  const favoriteIds = computed(() => new Set(doc.value.favorites.map((f) => f.id)))

  async function load(): Promise<void> {
    state.value = 'loading'
    try {
      doc.value = await api<StoreDoc>('api/store')
      loaded.value = true
      state.value = 'idle'
      message.value = ''
    } catch (err) {
      state.value = 'error'
      message.value = `Laden fehlgeschlagen: ${(err as Error).message}`
    }
  }

  function touch(): void {
    if (!loaded.value) return // nie einen leeren Stand über echte Daten schreiben
    dirty = true
    state.value = 'dirty'
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), SAVE_DELAY_MS)
  }

  async function flush(keepalive = false): Promise<void> {
    clearTimeout(timer)
    if (!dirty || !loaded.value) return
    if (saving) return // der laufende Durchgang stösst danach einen neuen an
    saving = true
    dirty = false
    state.value = 'saving'
    try {
      const saved = await api<StoreDoc>('api/store', { method: 'PUT', body: doc.value, keepalive })
      // Nur die Revision übernehmen: Während der Anfrage kann weiter editiert worden sein.
      doc.value.rev = saved.rev
      state.value = dirty ? 'dirty' : 'saved'
      message.value = ''
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const current = (err.body as { current?: StoreDoc } | undefined)?.current
        if (current) doc.value = current
        state.value = 'error'
        message.value =
          'Die Daten wurden auf einem anderen Gerät geändert und neu geladen. Die letzte Änderung hier ging verloren.'
      } else {
        dirty = true
        state.value = 'error'
        message.value = `Speichern fehlgeschlagen: ${(err as Error).message}`
      }
    } finally {
      saving = false
      if (dirty && state.value !== 'error') void flush()
    }
  }

  /* ---------- Presets ---------- */

  function savePreset(categoryId: string, name: string, values: Values): Preset | undefined {
    const trimmed = name.trim().slice(0, 80)
    if (trimmed === '') return undefined
    const copy = JSON.parse(JSON.stringify(values)) as Values
    const existing = doc.value.presets.find(
      (p) => p.categoryId === categoryId && p.name === trimmed,
    )
    if (existing) {
      existing.values = copy
      existing.createdAt = Date.now()
      touch()
      return existing
    }
    const preset: Preset = {
      id: newId(),
      categoryId,
      name: trimmed,
      values: copy,
      createdAt: Date.now(),
    }
    doc.value.presets.unshift(preset)
    touch()
    return preset
  }

  function deletePreset(id: string): void {
    doc.value.presets = doc.value.presets.filter((p) => p.id !== id)
    touch()
  }

  /* ---------- Bausteine ---------- */

  function addBlock(categoryId: string, label: string, text: string): Block | undefined {
    const l = label.trim().slice(0, 60)
    const t = text.trim().slice(0, 4000)
    if (l === '' || t === '') return undefined
    const block: Block = { id: newId(), categoryId, label: l, text: t }
    doc.value.blocks.push(block)
    touch()
    return block
  }

  function deleteBlock(id: string): void {
    doc.value.blocks = doc.value.blocks.filter((b) => b.id !== id)
    touch()
  }

  /* ---------- Favoriten & Verlauf ---------- */

  function findFavorite(entry: SavedPrompt): SavedPrompt | undefined {
    return doc.value.favorites.find((f) => sameOutputs(f, entry))
  }

  /** Schaltet den Favoriten-Status um; gibt den neuen Zustand zurück. */
  function toggleFavorite(entry: SavedPrompt): boolean {
    const existing = findFavorite(entry)
    if (existing) {
      doc.value.favorites = doc.value.favorites.filter((f) => f.id !== existing.id)
      touch()
      return false
    }
    doc.value.favorites.unshift({ ...entry, id: newId(), createdAt: Date.now() })
    touch()
    return true
  }

  function removeFavorite(id: string): void {
    doc.value.favorites = doc.value.favorites.filter((f) => f.id !== id)
    touch()
  }

  function pushHistory(entry: SavedPrompt): void {
    const latest = doc.value.history[0]
    if (latest && sameOutputs(latest, entry)) return // kein Doppel bei wiederholtem Kopieren
    doc.value.history.unshift({ ...entry, id: newId(), createdAt: Date.now() })
    if (doc.value.history.length > HISTORY_LIMIT) doc.value.history.length = HISTORY_LIMIT
    touch()
  }

  function clearHistory(): void {
    doc.value.history = []
    touch()
  }

  function updateSettings(patch: Partial<Settings>): void {
    doc.value.settings = { ...doc.value.settings, ...patch }
    touch()
  }

  /* ---------- Import ---------- */

  async function importJson(text: string): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('Die Datei enthält kein gültiges JSON.')
    }
    clearTimeout(timer)
    dirty = false
    doc.value = await api<StoreDoc>('api/store/import', { method: 'POST', body: parsed })
    loaded.value = true
    state.value = 'saved'
    message.value = ''
  }

  return {
    doc,
    loaded,
    state,
    message,
    favoriteIds,
    load,
    flush,
    savePreset,
    deletePreset,
    addBlock,
    deleteBlock,
    findFavorite,
    toggleFavorite,
    removeFavorite,
    pushHistory,
    clearHistory,
    updateSettings,
    importJson,
  }
})
