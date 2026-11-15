import type { CategoryDef, FieldDef, OutputDef, Outputs, Section, Values } from '../types'

/* ---------- Typsichere Zugriffe auf Formularwerte ---------- */

export function str(values: Values, id: string): string {
  const v = values[id]
  return typeof v === 'string' ? v.trim() : ''
}

export function num(values: Values, id: string, fallback = 0): number {
  const v = values[id]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function bool(values: Values, id: string): boolean {
  return values[id] === true
}

export function list(values: Values, id: string): string[] {
  const v = values[id]
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter(Boolean)
}

export function sections(values: Values, id: string): Section[] {
  const v = values[id]
  if (!Array.isArray(v)) return []
  return v.filter((x): x is Section => typeof x === 'object' && x !== null && 'tag' in x)
}

/* ---------- Textbausteine ---------- */

/** Verbindet nicht-leere Teile mit Komma und entfernt doppelte Satzzeichen. */
export function commaJoin(parts: Array<string | undefined | false>): string {
  return parts
    .map((p) => (typeof p === 'string' ? p.trim().replace(/[,;\s]+$/, '') : ''))
    .filter((p) => p !== '')
    .join(', ')
}

/** Zerlegt mehrzeiligen Text in bereinigte Zeilen ohne Aufzählungszeichen. */
export function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((l) => l !== '')
}

/** Satz mit Punkt abschliessen, falls kein Satzzeichen am Ende steht. */
export function sentence(text: string): string {
  const t = text.trim()
  if (t === '') return ''
  return /[.!?]$/.test(t) ? t : `${t}.`
}

/* ---------- Kategorie-Hilfen ---------- */

export function defaultValue(field: FieldDef): Values[string] {
  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'combo':
      return field.default ?? ''
    case 'chips':
      return [...(field.default ?? [])]
    case 'slider':
      return field.default
    case 'toggle':
      return field.default
    case 'sections':
      return field.default.map((s) => ({ ...s }))
  }
}

export function defaultValues(category: CategoryDef): Values {
  const values: Values = {}
  for (const field of category.fields) values[field.id] = defaultValue(field)
  return values
}

/** Ergänzt fehlende Felder (z. B. nach einer Erweiterung der Kategorie) mit Defaults. */
export function withDefaults(category: CategoryDef, values: Values | undefined): Values {
  return { ...defaultValues(category), ...(values ?? {}) }
}

export function resolveLimit(output: OutputDef, values: Values): number | undefined {
  return typeof output.limit === 'function' ? output.limit(values) : output.limit
}

function describe(field: FieldDef, values: Values): string {
  switch (field.type) {
    case 'chips':
      return list(values, field.id).join(', ')
    case 'slider': {
      const n = num(values, field.id, field.default)
      return field.format
        ? `${n} (${field.format(n)})`
        : `${n}${field.unit ? ` ${field.unit}` : ''}`
    }
    case 'toggle':
      return bool(values, field.id) ? 'ja' : ''
    case 'sections':
      return sections(values, field.id)
        .map((s) => s.tag)
        .join(' ')
    default:
      return str(values, field.id)
  }
}

/**
 * Baut die Nutzernachricht für den Turbo-Modus:
 * gesetzte Parameter plus der deterministische Entwurf als Ausgangspunkt.
 */
export function makeBrief(category: CategoryDef, values: Values, draft: Outputs): string {
  const params = category.fields
    .map((f) => ({ label: f.label, value: describe(f, values) }))
    .filter((p) => p.value !== '')
    .map((p) => `- ${p.label}: ${p.value}`)

  const drafts = category.outputs
    .map((o) => ({ o, text: (draft[o.key] ?? '').trim() }))
    .filter((d) => d.text !== '')
    .map((d) => `## ${d.o.label} (key: ${d.o.key})\n${d.text}`)

  return [
    `Category: ${category.label}`,
    '',
    '# Parameters set by the user',
    params.length > 0 ? params.join('\n') : '(none)',
    '',
    '# Deterministic draft to improve on',
    drafts.length > 0 ? drafts.join('\n\n') : '(empty)',
    '',
    'Refine this into production-quality results. Keep every parameter the user set; fill gaps with expert choices.',
  ].join('\n')
}
