import {
  KEYWORD_COUNT,
  modelResponseSchema,
  type GenerateRequest,
  type GenerateResponse,
  type ModelResponse,
  type StockMeta,
} from '../shared/schema'

/** Der Teil des Anthropic-Clients, den dieses Modul braucht (erleichtert Tests). */
export interface MessagesClient {
  messages: {
    create(
      body: {
        model: string
        max_tokens: number
        system: string
        messages: Array<{ role: 'user' | 'assistant'; content: string }>
        output_config: { format: { type: 'json_schema'; schema: Record<string, unknown> } }
      },
      options?: { signal?: AbortSignal; timeout?: number },
    ): Promise<{
      content: Array<{ type: string; text?: string }>
      stop_reason: string | null
      usage: { input_tokens: number; output_tokens: number }
    }>
  }
}

export interface AiOptions {
  model: string
  maxTokens: number
  timeoutMs: number
  signal?: AbortSignal
}

/** Fehler mit HTTP-Status, den die Route direkt an den Client weitergibt. */
export class AiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'AiError'
  }
}

/**
 * JSON-Schema für output_config.format.
 * Bewusst ohne Längen- und Anzahl-Constraints: Die API erzwingt sie nicht,
 * deshalb prüft `normalize` Anzahl und Vollständigkeit selbst.
 */
export function buildJsonSchema(req: GenerateRequest): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    variants: {
      type: 'array',
      description: `Exactly ${req.variantCount} variant(s).`,
      items: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description: 'Short label naming what makes this variant distinct.',
          },
          outputs: {
            type: 'array',
            description: 'One entry per output key, each key exactly once.',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', enum: req.outputs.map((o) => o.key) },
                text: { type: 'string' },
              },
              required: ['key', 'text'],
              additionalProperties: false,
            },
          },
        },
        required: ['label', 'outputs'],
        additionalProperties: false,
      },
    },
  }
  const required = ['variants']

  if (req.stockSeller) {
    properties.stock = {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Commercial English stock title, at most 70 characters.',
        },
        keywords: {
          type: 'array',
          description: `Exactly ${KEYWORD_COUNT} English keywords, most important first.`,
          items: {
            type: 'object',
            properties: {
              keyword: { type: 'string' },
              weight: { type: 'integer', description: 'Relevance from 1 (low) to 10 (high).' },
            },
            required: ['keyword', 'weight'],
            additionalProperties: false,
          },
        },
      },
      required: ['title', 'keywords'],
      additionalProperties: false,
    }
    required.push('stock')
  }

  return { type: 'object', properties, required, additionalProperties: false }
}

export function buildSystemPrompt(req: GenerateRequest): string {
  const outputLines = req.outputs.map(
    (o) => `- "${o.key}" (${o.label})${o.limit ? `: at most ${o.limit} characters` : ''}`,
  )
  const rules = [
    `Return exactly ${req.variantCount} variant(s).`,
    'Every variant contains each of these output keys exactly once:',
    ...outputLines,
    'Variants must differ meaningfully from each other, not only in word order.',
    'Write only the final text for each output. No commentary, no markdown fences.',
    'If an output does not apply, return an empty string for it.',
  ]
  if (req.stockSeller) {
    rules.push(
      `Also return "stock": a commercial English title (at most 70 characters, no brand names) and exactly ${KEYWORD_COUNT} English keywords.`,
      'Keywords: single words or short phrases, lowercase, no duplicates, ordered from most to least important, each with a weight from 1 to 10.',
    )
  }
  return `${req.system.trim()}\n\n# Output rules\n${rules.join('\n')}`
}

interface Normalized {
  variants: GenerateResponse['variants']
  stock?: StockMeta
  problems: string[]
  warnings: string[]
}

/** Bringt die Modellantwort in die Zielform und sammelt Abweichungen. */
export function normalize(raw: ModelResponse, req: GenerateRequest): Normalized {
  const problems: string[] = []
  const warnings: string[] = []
  const keys = req.outputs.map((o) => o.key)

  const variants: GenerateResponse['variants'] = []
  for (const [i, v] of raw.variants.slice(0, req.variantCount).entries()) {
    const outputs: Record<string, string> = {}
    for (const o of v.outputs) {
      if (keys.includes(o.key) && outputs[o.key] === undefined) outputs[o.key] = o.text.trim()
    }
    const missing = keys.filter((k) => outputs[k] === undefined)
    if (missing.length > 0) {
      problems.push(`Variant ${i + 1} is missing output key(s): ${missing.join(', ')}.`)
      continue
    }
    for (const spec of req.outputs) {
      const length = outputs[spec.key]?.length ?? 0
      if (spec.limit && length > spec.limit) {
        warnings.push(`Variante ${i + 1}, ${spec.label}: ${length} Zeichen, Limit ${spec.limit}.`)
      }
    }
    variants.push({ label: v.label.trim() || `Variante ${i + 1}`, outputs })
  }
  if (raw.variants.length < req.variantCount) {
    problems.push(`Expected ${req.variantCount} variants, got ${raw.variants.length}.`)
  }

  let stock: StockMeta | undefined
  if (req.stockSeller) {
    if (!raw.stock) {
      problems.push('The "stock" object is missing.')
    } else {
      const seen = new Set<string>()
      const keywords = raw.stock.keywords
        .map((k) => ({ keyword: k.keyword.trim().toLowerCase(), weight: k.weight }))
        .filter((k) => {
          if (k.keyword === '' || seen.has(k.keyword)) return false
          seen.add(k.keyword)
          return true
        })
        .sort((a, b) => b.weight - a.weight)
        .slice(0, KEYWORD_COUNT)
      if (keywords.length < KEYWORD_COUNT) {
        problems.push(`Expected exactly ${KEYWORD_COUNT} unique keywords, got ${keywords.length}.`)
      }
      stock = { title: raw.stock.title.trim(), keywords }
    }
  }

  return { variants, stock, problems, warnings }
}

function parseModelJson(text: string): ModelResponse | string {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return 'The response was not valid JSON.'
  }
  const parsed = modelResponseSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return `The response did not match the schema: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim()
  }
  return parsed.data
}

/**
 * Ruft Claude mit strukturiertem Output auf.
 * Bei unvollständiger Antwort folgt genau ein Korrekturversuch.
 */
export async function generate(
  client: MessagesClient,
  req: GenerateRequest,
  options: AiOptions,
): Promise<GenerateResponse> {
  const system = buildSystemPrompt(req)
  const schema = buildJsonSchema(req)
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: req.brief },
  ]
  const usage = { inputTokens: 0, outputTokens: 0 }
  let best: Normalized | undefined

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create(
      {
        model: options.model,
        max_tokens: options.maxTokens,
        system,
        messages,
        output_config: { format: { type: 'json_schema', schema } },
      },
      { signal: options.signal, timeout: options.timeoutMs },
    )
    usage.inputTokens += response.usage.input_tokens
    usage.outputTokens += response.usage.output_tokens

    if (response.stop_reason === 'refusal') {
      throw new AiError(422, 'Claude hat diese Anfrage abgelehnt. Formuliere die Idee anders.')
    }
    if (response.stop_reason === 'max_tokens') {
      throw new AiError(
        422,
        `Die Antwort wurde bei ${options.maxTokens} Tokens abgeschnitten. Weniger Varianten wählen oder AI_MAX_TOKENS erhöhen.`,
      )
    }

    const text = response.content.find((b) => b.type === 'text')?.text ?? ''
    const parsed = parseModelJson(text)
    let problems: string[]
    if (typeof parsed === 'string') {
      problems = [parsed]
    } else {
      const normalized = normalize(parsed, req)
      if (!best || normalized.variants.length >= best.variants.length) best = normalized
      problems = normalized.problems
    }
    if (problems.length === 0) break

    messages.push(
      { role: 'assistant', content: text || '{}' },
      {
        role: 'user',
        content: `Your answer had these problems:\n- ${problems.join('\n- ')}\nReturn the complete corrected JSON.`,
      },
    )
  }

  if (!best || best.variants.length === 0) {
    throw new AiError(
      502,
      'Claude hat keine verwertbare Antwort geliefert. Bitte erneut versuchen.',
    )
  }

  const warnings = [...best.warnings]
  if (best.variants.length < req.variantCount) {
    warnings.push(`Nur ${best.variants.length} von ${req.variantCount} Varianten erhalten.`)
  }
  if (req.stockSeller && (!best.stock || best.stock.keywords.length < KEYWORD_COUNT)) {
    warnings.push(`Nur ${best.stock?.keywords.length ?? 0} von ${KEYWORD_COUNT} Keywords erhalten.`)
  }

  return {
    variants: best.variants,
    stock: best.stock,
    usage,
    warnings,
    model: options.model,
  }
}
