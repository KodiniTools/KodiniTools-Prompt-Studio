import type { FieldValue, Section, Values } from '../shared/schema'

export type { FieldValue, Section, Values }

interface BaseField {
  /** Eindeutig innerhalb der Kategorie; Schlüssel in `Values`. */
  id: string
  label: string
  hint?: string
  /** Halbe Breite im Formular (zwei Felder nebeneinander). */
  half?: boolean
}

export interface TextField extends BaseField {
  type: 'text' | 'textarea'
  placeholder?: string
  default?: string
  rows?: number
}

/** Freitext mit Vorschlagsliste: Auswahl oder eigener Wert. */
export interface ComboField extends BaseField {
  type: 'combo'
  options: readonly string[]
  placeholder?: string
  default?: string
}

/** Mehrfachauswahl; eigene Werte lassen sich ergänzen. */
export interface ChipsField extends BaseField {
  type: 'chips'
  options: readonly string[]
  default?: readonly string[]
}

export interface SliderField extends BaseField {
  type: 'slider'
  min: number
  max: number
  step: number
  default: number
  unit?: string
  /** Optionaler Text je Wert, z. B. für Intensitätsstufen. */
  format?: (value: number) => string
}

export interface ToggleField extends BaseField {
  type: 'toggle'
  default: boolean
}

/** Liste aus Abschnitten mit Tag und Text (Suno-Lyrics). */
export interface SectionsField extends BaseField {
  type: 'sections'
  tags: readonly string[]
  default: readonly Section[]
}

export type FieldDef =
  TextField | ComboField | ChipsField | SliderField | ToggleField | SectionsField

export interface OutputDef {
  /** Schlüssel in der Ausgabe von `build()`; nur a–z, Ziffern, Unterstrich. */
  key: string
  label: string
  /** Zeichenlimit, fest oder abhängig von den Formularwerten. */
  limit?: number | ((values: Values) => number | undefined)
  /** Wird mit Alt+C kopiert und als Titel in Verlauf/Favoriten genutzt. */
  primary?: boolean
}

export type Outputs = Record<string, string>

export interface Variant {
  label: string
  outputs: Outputs
}

export interface CategoryDef {
  id: string
  label: string
  /** Kurzbeschreibung unter dem Kategorienamen. */
  description: string
  /** Reihenfolge in der Kategorieleiste. */
  order: number
  fields: readonly FieldDef[]
  outputs: readonly OutputDef[]
  /** Deterministischer Sofort-Modus. Muss rein sein: gleiche Werte, gleiche Ausgabe. */
  build: (values: Values) => Outputs
  /** Optionaler deterministischer Batch (mehrere Varianten aus einer Grundidee). */
  batch?: (values: Values) => Variant[]
  /** Schaltet die Option „Titel + 25 Keywords“ im Turbo-Modus frei. */
  stockSeller?: boolean
  ai: {
    /** Rollen- und Fachanweisung für Claude (englisch). */
    system: string
  }
}
