import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import type { GenerateRequest, GenerateResponse, SavedPrompt, StockMeta } from '../../shared/schema'
import { categories, getCategory } from '../categories'
import { bool, defaultValues, makeBrief, resolveLimit, withDefaults } from '../categories/helpers'
import { api } from '../lib/api'
import { newId } from '../lib/text'
import type { CategoryDef, FieldValue, Outputs, Values, Variant } from '../types'
import { useLibraryStore } from './library'

const DRAFT_KEY = 'prompt-studio.draft.v1'

interface Draft {
  categoryId: string
  values: Record<string, Values>
}

export interface VariantTab {
  key: string
  label: string
  title: string
  source: SavedPrompt['source']
}

function readDraft(): Draft | undefined {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Draft
    if (typeof parsed?.categoryId !== 'string' || typeof parsed?.values !== 'object')
      return undefined
    return parsed
  } catch {
    return undefined // gesperrter oder defekter Speicher: mit Defaults starten
  }
}

function writeDraft(draft: Draft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* Entwurf ist nur Komfort; dauerhafte Daten liegen auf dem Server */
  }
}

/**
 * Arbeitszustand des Studios: aktive Kategorie, Formularwerte, Varianten, Turbo.
 * Der Sofort-Prompt ist rein abgeleitet (computed) – es gibt keinen zweiten Speicherort.
 */
export const useStudioStore = defineStore('studio', () => {
  const library = useLibraryStore()
  const first = categories[0]
  if (!first) throw new Error('Keine Kategorie gefunden (src/categories ist leer).')

  const draft = readDraft()
  const categoryId = ref(draft && getCategory(draft.categoryId) ? draft.categoryId : first.id)
  const valuesByCategory = reactive<Record<string, Values>>({})
  for (const c of categories) valuesByCategory[c.id] = withDefaults(c, draft?.values[c.id])

  const turboByCategory = reactive<Record<string, GenerateResponse | undefined>>({})
  const selectedByCategory = reactive<Record<string, string>>({})
  const stockSeller = ref(false)
  const busy = ref(false)
  const error = ref('')
  const aiConfigured = ref(false)
  const model = ref('')
  const focusedField = ref<string | null>(null)
  let controller: AbortController | undefined

  const category = computed<CategoryDef>(() => getCategory(categoryId.value) ?? first)
  const values = computed<Values>(
    () => valuesByCategory[category.value.id] ?? defaultValues(category.value),
  )

  const instant = computed<Outputs>(() => category.value.build(values.value))
  const batchVariants = computed<Variant[]>(() =>
    category.value.batch && bool(values.value, 'batch') ? category.value.batch(values.value) : [],
  )
  const turbo = computed(() => turboByCategory[category.value.id])

  const tabs = computed<VariantTab[]>(() => {
    const out: VariantTab[] = [
      { key: 'instant', label: 'Sofort', title: 'Deterministischer Prompt', source: 'instant' },
    ]
    batchVariants.value.forEach((v, i) =>
      out.push({ key: `batch:${i}`, label: `B${i + 1}`, title: v.label, source: 'batch' }),
    )
    turbo.value?.variants.forEach((v, i) =>
      out.push({ key: `turbo:${i}`, label: `T${i + 1}`, title: v.label, source: 'turbo' }),
    )
    return out
  })

  const activeKey = computed(() => {
    const wanted = selectedByCategory[category.value.id] ?? 'instant'
    return tabs.value.some((t) => t.key === wanted) ? wanted : 'instant'
  })
  const activeTab = computed<VariantTab>(
    () => tabs.value.find((t) => t.key === activeKey.value) ?? (tabs.value[0] as VariantTab),
  )

  const outputs = computed<Outputs>(() => {
    const [kind, index] = activeKey.value.split(':')
    const i = Number(index)
    if (kind === 'batch') return batchVariants.value[i]?.outputs ?? instant.value
    if (kind === 'turbo') return turbo.value?.variants[i]?.outputs ?? instant.value
    return instant.value
  })

  /** Titel und Keywords gehören zum Turbo-Ergebnis als Ganzem. */
  const stock = computed<StockMeta | undefined>(() => turbo.value?.stock)

  const outputSpecs = computed(() =>
    category.value.outputs.map((o) => ({
      key: o.key,
      label: o.label,
      primary: o.primary === true,
      limit: resolveLimit(o, values.value),
    })),
  )

  const primaryText = computed(() => {
    const spec = outputSpecs.value.find((o) => o.primary) ?? outputSpecs.value[0]
    return spec ? (outputs.value[spec.key] ?? '') : ''
  })

  /** Massgeblich ist die Hauptausgabe: Ein gefüllter Negative Prompt allein zählt nicht. */
  const hasContent = computed(() => primaryText.value.trim() !== '')

  /* ---------- Formular ---------- */

  function selectCategory(id: string): void {
    if (!getCategory(id)) return
    categoryId.value = id
    error.value = ''
    focusedField.value = null
  }

  function setValue(fieldId: string, value: FieldValue): void {
    const current = valuesByCategory[category.value.id]
    if (current) current[fieldId] = value
  }

  function applyValues(next: Values): void {
    valuesByCategory[category.value.id] = withDefaults(
      category.value,
      JSON.parse(JSON.stringify(next)) as Values,
    )
    selectedByCategory[category.value.id] = 'instant'
  }

  function resetCategory(): void {
    valuesByCategory[category.value.id] = defaultValues(category.value)
    turboByCategory[category.value.id] = undefined
    selectedByCategory[category.value.id] = 'instant'
    error.value = ''
  }

  function selectVariant(key: string): void {
    selectedByCategory[category.value.id] = key
  }

  /**
   * Fügt einen Baustein in das zuletzt fokussierte Textfeld ein.
   * Gibt false zurück, wenn kein passendes Feld aktiv ist.
   */
  function insertBlock(text: string): boolean {
    const field = category.value.fields.find((f) => f.id === focusedField.value)
    if (!field || (field.type !== 'text' && field.type !== 'textarea' && field.type !== 'combo'))
      return false
    const current = values.value[field.id]
    const base = typeof current === 'string' ? current.trimEnd() : ''
    const separator =
      base === '' ? '' : field.type === 'textarea' && base.includes('\n') ? '\n' : ', '
    setValue(field.id, `${base}${separator}${text}`)
    return true
  }

  /* ---------- Verlauf / Favoriten ---------- */

  function snapshot(): SavedPrompt {
    return {
      id: newId(),
      categoryId: category.value.id,
      title: (primaryText.value.split('\n')[0] ?? '').slice(0, 120),
      outputs: { ...outputs.value },
      values: JSON.parse(JSON.stringify(values.value)) as Values,
      source: activeTab.value.source,
      stock: activeTab.value.source === 'turbo' ? stock.value : undefined,
      createdAt: Date.now(),
    }
  }

  function restore(entry: SavedPrompt): void {
    const target = getCategory(entry.categoryId)
    if (!target) return
    categoryId.value = target.id
    valuesByCategory[target.id] = withDefaults(
      target,
      JSON.parse(JSON.stringify(entry.values)) as Values,
    )
    if (entry.source === 'instant') {
      selectedByCategory[target.id] = 'instant'
      return
    }
    // Batch- und Turbo-Ergebnisse lassen sich nicht aus den Werten neu ableiten:
    // die gespeicherte Ausgabe wird deshalb als eigene Variante gezeigt.
    turboByCategory[target.id] = {
      variants: [{ label: 'Gespeichert', outputs: { ...entry.outputs } }],
      stock: entry.stock,
      usage: { inputTokens: 0, outputTokens: 0 },
      warnings: [],
      model: '',
    }
    selectedByCategory[target.id] = 'turbo:0'
  }

  /* ---------- Turbo ---------- */

  async function loadStatus(): Promise<void> {
    try {
      const status = await api<{ aiConfigured: boolean; model: string }>('api/status')
      aiConfigured.value = status.aiConfigured
      model.value = status.model
    } catch {
      aiConfigured.value = false
    }
  }

  async function runTurbo(): Promise<void> {
    if (busy.value) return
    const cat = category.value
    if (!hasInstantContent()) {
      error.value = 'Erst ein Motiv oder eine Idee eingeben.'
      return
    }
    const request: GenerateRequest = {
      categoryId: cat.id,
      system: cat.ai.system,
      brief: makeBrief(cat, values.value, instant.value),
      outputs: outputSpecs.value.map((o) => ({ key: o.key, label: o.label, limit: o.limit })),
      variantCount: library.doc.settings.variantCount,
      stockSeller: cat.stockSeller === true && stockSeller.value,
    }

    busy.value = true
    error.value = ''
    controller = new AbortController()
    try {
      const result = await api<GenerateResponse>('api/ai/generate', {
        method: 'POST',
        body: request,
        timeoutMs: 180_000,
        signal: controller.signal,
      })
      turboByCategory[cat.id] = result
      selectedByCategory[cat.id] = 'turbo:0'
      if (categoryId.value === cat.id) library.pushHistory(snapshot())
    } catch (err) {
      error.value = (err as Error).message
    } finally {
      busy.value = false
      controller = undefined
    }
  }

  function hasInstantContent(): boolean {
    const spec = outputSpecs.value.find((o) => o.primary) ?? outputSpecs.value[0]
    return spec !== undefined && (instant.value[spec.key] ?? '').trim() !== ''
  }

  function cancelTurbo(): void {
    controller?.abort()
  }

  watch(
    [categoryId, valuesByCategory],
    () => writeDraft({ categoryId: categoryId.value, values: { ...valuesByCategory } }),
    { deep: true },
  )

  return {
    categoryId,
    category,
    values,
    instant,
    batchVariants,
    turbo,
    tabs,
    activeKey,
    activeTab,
    outputs,
    outputSpecs,
    primaryText,
    hasContent,
    stock,
    stockSeller,
    busy,
    error,
    aiConfigured,
    model,
    focusedField,
    selectCategory,
    setValue,
    applyValues,
    resetCategory,
    selectVariant,
    insertBlock,
    snapshot,
    restore,
    loadStatus,
    runTurbo,
    cancelTurbo,
  }
})
