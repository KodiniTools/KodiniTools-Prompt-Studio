import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyStore, HISTORY_LIMIT } from '../../shared/defaults'
import type { GenerateResponse, SavedPrompt, StoreDoc } from '../../shared/schema'
import { useLibraryStore } from '../../src/stores/library'
import { useStudioStore } from '../../src/stores/studio'

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown }

function mockFetch(handler: Handler) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const { status = 200, body } = handler(url, init)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function entry(text: string): SavedPrompt {
  return {
    id: 'x',
    categoryId: 'universal',
    title: text,
    outputs: { prompt: text },
    values: {},
    source: 'instant',
    createdAt: 1,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('library', () => {
  it('schreibt nie, bevor geladen wurde', async () => {
    const fetchMock = mockFetch(() => ({ body: emptyStore() }))
    const library = useLibraryStore()
    library.savePreset('universal', 'A', {})
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('speichert verzögert, bündelt Änderungen und übernimmt die Revision', async () => {
    const puts: StoreDoc[] = []
    mockFetch((_url, init) => {
      if (init?.method === 'PUT') {
        const doc = JSON.parse(String(init.body)) as StoreDoc
        puts.push(doc)
        return { body: { ...doc, rev: doc.rev + 1 } }
      }
      return { body: emptyStore() }
    })
    const library = useLibraryStore()
    await library.load()
    library.savePreset('universal', 'A', { idea: 'x' })
    library.savePreset('universal', 'B', { idea: 'y' })
    library.savePreset('universal', 'A', { idea: 'z' }) // gleicher Name: überschreibt
    await vi.advanceTimersByTimeAsync(600)
    expect(puts).toHaveLength(1)
    expect(puts[0]?.presets.map((p) => p.name).sort()).toEqual(['A', 'B'])
    expect(library.doc.rev).toBe(1)
    expect(library.state).toBe('saved')
  })

  it('übernimmt bei Konflikt (409) den Serverstand und meldet es', async () => {
    const serverDoc: StoreDoc = { ...emptyStore(), rev: 7 }
    mockFetch((_url, init) =>
      init?.method === 'PUT'
        ? { status: 409, body: { error: 'Konflikt', current: serverDoc } }
        : { body: emptyStore() },
    )
    const library = useLibraryStore()
    await library.load()
    library.addBlock('*', 'Licht', 'soft light')
    await vi.advanceTimersByTimeAsync(600)
    expect(library.doc.rev).toBe(7)
    expect(library.doc.blocks).toHaveLength(0)
    expect(library.state).toBe('error')
    expect(library.message).toContain('anderen Gerät')
  })

  it('behält ungespeicherte Änderungen bei einem Serverfehler und versucht es erneut', async () => {
    let fail = true
    const fetchMock = mockFetch((_url, init) => {
      if (init?.method !== 'PUT') return { body: emptyStore() }
      if (fail) return { status: 500, body: { error: 'kaputt' } }
      const doc = JSON.parse(String(init.body)) as StoreDoc
      return { body: { ...doc, rev: doc.rev + 1 } }
    })
    const library = useLibraryStore()
    await library.load()
    library.addBlock('*', 'A', 'a')
    await vi.advanceTimersByTimeAsync(600)
    expect(library.state).toBe('error')
    fail = false
    library.addBlock('*', 'B', 'b')
    await vi.advanceTimersByTimeAsync(600)
    expect(library.state).toBe('saved')
    const lastPut = fetchMock.mock.calls.at(-1)?.[1]
    expect((JSON.parse(String(lastPut?.body)) as StoreDoc).blocks).toHaveLength(2)
  })

  it('Verlauf: kein Doppel hintereinander, begrenzt auf das Limit', async () => {
    mockFetch(() => ({ body: emptyStore() }))
    const library = useLibraryStore()
    await library.load()
    library.pushHistory(entry('a'))
    library.pushHistory(entry('a'))
    expect(library.doc.history).toHaveLength(1)
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) library.pushHistory(entry(`p${i}`))
    expect(library.doc.history).toHaveLength(HISTORY_LIMIT)
    expect(library.doc.history[0]?.outputs.prompt).toBe(`p${HISTORY_LIMIT + 19}`)
  })

  it('Favorit umschalten erkennt gleiche Ausgaben', async () => {
    mockFetch(() => ({ body: emptyStore() }))
    const library = useLibraryStore()
    await library.load()
    expect(library.toggleFavorite(entry('a'))).toBe(true)
    expect(library.findFavorite(entry('a'))).toBeDefined()
    expect(library.toggleFavorite(entry('a'))).toBe(false)
    expect(library.doc.favorites).toHaveLength(0)
  })
})

describe('studio', () => {
  it('leitet den Sofort-Prompt aus den Werten ab und zeigt Batch-Reiter', () => {
    mockFetch(() => ({ body: emptyStore() }))
    const studio = useStudioStore()
    studio.selectCategory('stock-photo')
    expect(studio.tabs.map((t) => t.key)).toEqual(['instant'])
    studio.setValue('subject', 'a red bicycle')
    expect(studio.outputs.prompt).toContain('a red bicycle')
    studio.setValue('batch', true)
    expect(studio.tabs).toHaveLength(6)
    studio.selectVariant('batch:2')
    expect(studio.outputs.prompt).not.toBe(studio.instant.prompt)
    studio.setValue('batch', false) // Auswahl fällt auf „Sofort“ zurück
    expect(studio.activeKey).toBe('instant')
  })

  it('fügt Bausteine nur in ein fokussiertes Textfeld ein', () => {
    mockFetch(() => ({ body: emptyStore() }))
    const studio = useStudioStore()
    studio.selectCategory('stock-photo')
    expect(studio.insertBlock('dusty air')).toBe(false)
    studio.setValue('details', 'shallow depth of field')
    studio.focusedField = 'details'
    expect(studio.insertBlock('dusty air')).toBe(true)
    expect(studio.values.details).toBe('shallow depth of field, dusty air')
    studio.focusedField = 'batch' // Toggle: kein Textfeld
    expect(studio.insertBlock('x')).toBe(false)
  })

  it('Turbo: sendet Auftrag, übernimmt Varianten und schreibt in den Verlauf', async () => {
    const result: GenerateResponse = {
      variants: [
        { label: 'ruhig', outputs: { prompt: 'T-eins', negative: 'n' } },
        { label: 'dramatisch', outputs: { prompt: 'T-zwei', negative: 'n' } },
      ],
      stock: { title: 'Red bicycle', keywords: [{ keyword: 'bicycle', weight: 10 }] },
      usage: { inputTokens: 100, outputTokens: 200 },
      warnings: [],
      model: 'claude-sonnet-5-5',
    }
    let sent: Record<string, unknown> | undefined
    mockFetch((url, init) => {
      if (url === 'api/ai/generate') {
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>
        return { body: result }
      }
      if (init?.method === 'PUT')
        return { body: { ...(JSON.parse(String(init.body)) as StoreDoc), rev: 1 } }
      return { body: emptyStore() }
    })
    const library = useLibraryStore()
    await library.load()
    const studio = useStudioStore()
    studio.selectCategory('stock-photo')
    studio.setValue('subject', 'a red bicycle')
    studio.stockSeller = true
    await studio.runTurbo()

    expect(sent).toMatchObject({ categoryId: 'stock-photo', variantCount: 3, stockSeller: true })
    expect((sent?.outputs as Array<{ key: string }>).map((o) => o.key)).toEqual([
      'prompt',
      'negative',
    ])
    expect(studio.activeKey).toBe('turbo:0')
    expect(studio.outputs.prompt).toBe('T-eins')
    expect(studio.stock?.title).toBe('Red bicycle')
    expect(library.doc.history[0]?.source).toBe('turbo')
    expect(studio.busy).toBe(false)
  })

  it('Turbo: zeigt Serverfehler und startet nicht ohne Inhalt', async () => {
    const fetchMock = mockFetch((url) =>
      url === 'api/ai/generate'
        ? { status: 502, body: { error: 'Anthropic meldet einen Fehler (500).' } }
        : { body: emptyStore() },
    )
    const studio = useStudioStore()
    studio.selectCategory('universal')
    await studio.runTurbo()
    expect(studio.error).toContain('Erst')
    expect(fetchMock).not.toHaveBeenCalled()

    studio.setValue('idea', 'etwas')
    await studio.runTurbo()
    expect(studio.error).toBe('Anthropic meldet einen Fehler (500).')
    expect(studio.busy).toBe(false)
  })

  it('stellt gespeicherte Turbo-Ergebnisse als eigene Variante wieder her', () => {
    mockFetch(() => ({ body: emptyStore() }))
    const studio = useStudioStore()
    studio.restore({
      id: '1',
      categoryId: 'universal',
      title: 't',
      outputs: { prompt: 'gespeicherter Text' },
      values: { idea: 'Idee' },
      source: 'turbo',
      createdAt: 1,
    })
    expect(studio.categoryId).toBe('universal')
    expect(studio.values.idea).toBe('Idee')
    expect(studio.outputs.prompt).toBe('gespeicherter Text')
  })
})
