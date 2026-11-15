/**
 * Gemeinsame Datenverträge für Client und Server.
 * Der Server validiert jede Eingabe mit diesen Schemas; der Client nutzt nur die Typen.
 */
import { z } from 'zod'
import { HISTORY_LIMIT, MAX_VARIANTS, SCHEMA_VERSION } from './defaults'

export { emptyStore, HISTORY_LIMIT, KEYWORD_COUNT, MAX_VARIANTS, SCHEMA_VERSION } from './defaults'

const id = z.string().min(1).max(64)
const longText = z.string().max(20_000)

export const sectionSchema = z.object({
  tag: z.string().max(60),
  text: z.string().max(8_000),
})

export const fieldValueSchema = z.union([
  longText,
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(500)).max(100),
  z.array(sectionSchema).max(40),
])

export const valuesSchema = z.record(z.string().max(60), fieldValueSchema)

export const stockKeywordSchema = z.object({
  keyword: z.string().min(1).max(80),
  weight: z.number().int().min(1).max(10),
})

export const stockMetaSchema = z.object({
  title: z.string().min(1).max(300),
  keywords: z.array(stockKeywordSchema).max(60),
})

export const presetSchema = z.object({
  id,
  categoryId: id,
  name: z.string().min(1).max(80),
  values: valuesSchema,
  createdAt: z.number().int().nonnegative(),
})

export const blockSchema = z.object({
  id,
  /** Kategorie-ID oder "*" für alle Kategorien. */
  categoryId: id,
  label: z.string().min(1).max(60),
  text: z.string().min(1).max(4_000),
})

export const savedPromptSchema = z.object({
  id,
  categoryId: id,
  title: z.string().max(200),
  outputs: z.record(z.string().max(40), longText),
  values: valuesSchema,
  source: z.enum(['instant', 'batch', 'turbo']),
  stock: stockMetaSchema.optional(),
  createdAt: z.number().int().nonnegative(),
})

export const settingsSchema = z.object({
  variantCount: z.number().int().min(1).max(MAX_VARIANTS),
  lastCategoryId: z.string().max(64).optional(),
})

export const storeSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** Zähler gegen überschriebene Änderungen bei mehreren Geräten. */
  rev: z.number().int().nonnegative(),
  presets: z.array(presetSchema).max(500),
  blocks: z.array(blockSchema).max(1_000),
  favorites: z.array(savedPromptSchema).max(2_000),
  history: z.array(savedPromptSchema).max(HISTORY_LIMIT),
  settings: settingsSchema,
})

/* ---------- KI-Turbo ---------- */

export const outputSpecSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,30}$/),
  label: z.string().min(1).max(60),
  limit: z.number().int().positive().max(100_000).optional(),
})

export const generateRequestSchema = z.object({
  categoryId: id,
  system: z.string().min(1).max(8_000),
  brief: z.string().min(1).max(30_000),
  outputs: z.array(outputSpecSchema).min(1).max(8),
  variantCount: z.number().int().min(1).max(MAX_VARIANTS),
  stockSeller: z.boolean(),
})

/** Form, die Claude liefern muss (vor der Normalisierung). */
export const modelResponseSchema = z.object({
  variants: z
    .array(
      z.object({
        label: z.string().max(120),
        outputs: z.array(z.object({ key: z.string().max(40), text: longText })).max(16),
      }),
    )
    .max(20),
  stock: stockMetaSchema.optional(),
})

export const generateResponseSchema = z.object({
  variants: z.array(z.object({ label: z.string(), outputs: z.record(z.string(), z.string()) })),
  stock: stockMetaSchema.optional(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  warnings: z.array(z.string()),
  model: z.string(),
})

export type Section = z.infer<typeof sectionSchema>
export type FieldValue = z.infer<typeof fieldValueSchema>
export type Values = z.infer<typeof valuesSchema>
export type StockKeyword = z.infer<typeof stockKeywordSchema>
export type StockMeta = z.infer<typeof stockMetaSchema>
export type Preset = z.infer<typeof presetSchema>
export type Block = z.infer<typeof blockSchema>
export type SavedPrompt = z.infer<typeof savedPromptSchema>
export type Settings = z.infer<typeof settingsSchema>
export type StoreDoc = z.infer<typeof storeSchema>
export type OutputSpec = z.infer<typeof outputSpecSchema>
export type GenerateRequest = z.infer<typeof generateRequestSchema>
export type ModelResponse = z.infer<typeof modelResponseSchema>
export type GenerateResponse = z.infer<typeof generateResponseSchema>
