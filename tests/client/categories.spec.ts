import { describe, expect, it } from 'vitest'
import { categories, getCategory, validateCategory } from '../../src/categories'
import { defaultValues, makeBrief, resolveLimit } from '../../src/categories/helpers'
import type { CategoryDef, Values } from '../../src/types'

function cat(id: string): CategoryDef {
  const c = getCategory(id)
  if (!c) throw new Error(`Kategorie ${id} fehlt`)
  return c
}

function values(id: string, patch: Values = {}): Values {
  return { ...defaultValues(cat(id)), ...patch }
}

describe('Registry', () => {
  it('lädt die fünf Start-Kategorien in fester Reihenfolge', () => {
    expect(categories.map((c) => c.id)).toEqual([
      'stock-photo',
      'video-motion',
      'suno-music',
      'coding-xml',
      'universal',
    ])
  })

  it('jede Kategorie ist gültig, rein und liefert alle Ausgabe-Keys', () => {
    for (const c of categories) {
      expect(() => validateCategory(c)).not.toThrow()
      const v = defaultValues(c)
      const first = c.build(v)
      expect(c.build(v)).toEqual(first)
      for (const o of c.outputs) expect(typeof first[o.key]).toBe('string')
      expect(c.ai.system.length).toBeGreaterThan(50)
    }
  })

  it('lehnt doppelte Feld-IDs und ungültige Ausgabe-Keys ab', () => {
    const base = cat('universal')
    expect(() => validateCategory({ ...base, fields: [...base.fields, base.fields[0]!] })).toThrow(
      /doppelt/,
    )
    expect(() => validateCategory({ ...base, outputs: [{ key: 'Bad Key', label: 'x' }] })).toThrow(
      /Ausgabe-Key/,
    )
  })
})

describe('Stock & KI-Foto', () => {
  const c = cat('stock-photo')

  it('bleibt leer ohne Motiv', () => {
    expect(c.build(values('stock-photo', { subject: '' })).prompt).toBe('')
  })

  it('baut Prompt mit Motiv, Copy Space, Seitenverhältnis und Stock-Zusätzen', () => {
    const out = c.build(
      values('stock-photo', {
        subject: 'carpenter sanding an oak table',
        copySpace: 'links',
        aspect: '16:9',
      }),
    )
    expect(out.prompt).toMatch(/^carpenter sanding an oak table, photorealistic photograph/)
    expect(out.prompt).toContain('generous empty copy space on the left')
    expect(out.prompt).toMatch(/Aspect ratio 16:9\.$/)
    expect(out.prompt).not.toMatch(/,\s*,|\.\./)
    expect(out.negative).toContain('logos')
  })

  it('lässt Stock-Zusätze weg, wenn der Schalter aus ist', () => {
    const out = c.build(values('stock-photo', { subject: 'a cat', stockSafe: false }))
    expect(out.prompt).not.toContain('commercial stock photography')
    expect(out.negative).not.toContain('logos')
  })

  it('Batch liefert 5 unterschiedliche Varianten, die erste entspricht dem Sofort-Prompt', () => {
    const v = values('stock-photo', { subject: 'a cat on a sofa', lighting: 'eigenes Licht' })
    const batch = c.batch?.(v) ?? []
    expect(batch).toHaveLength(5)
    expect(new Set(batch.map((b) => b.outputs.prompt)).size).toBe(5)
    expect(batch[0]?.outputs).toEqual(c.build(v))
    expect(c.batch?.(values('stock-photo', { subject: '' }))).toEqual([])
  })
})

describe('Video & Motion', () => {
  const c = cat('video-motion')

  it('beschreibt Start- und End-Frame als durchgehenden Übergang', () => {
    const out = c.build(
      values('video-motion', {
        subject: 'a fisherman on a boat',
        action: 'pulls in a net',
        camera: 'dolly in',
        intensity: 4,
        startFrame: 'wide view of the lake',
        endFrame: 'close-up of his hands',
      }),
    )
    expect(out.prompt).toContain('Camera: dolly in, dynamic motion.')
    expect(out.prompt).toContain('Starts on: wide view of the lake.')
    expect(out.prompt).toContain('Ends on: close-up of his hands.')
    expect(out.prompt).toContain('smooth transition')
  })

  it('kommt ohne Frames aus', () => {
    const out = c.build(values('video-motion', { subject: 'a fox', action: 'runs through snow' }))
    expect(out.prompt).toMatch(/^a fox, runs through snow\./)
    expect(out.prompt).not.toContain('Starts on')
  })
})

describe('Musik & Songwriting', () => {
  const c = cat('suno-music')

  it('trennt Style-Prompt und Lyrics mit Metatags', () => {
    const out = c.build(
      values('suno-music', {
        genres: ['Hard Rock', 'Balkan Sevdah'],
        bpm: 96,
        title: 'Rijeka',
        structure: [
          { tag: '[Intro]', text: '' },
          { tag: '[Verse 1]', text: 'Line one\nLine two' },
          { tag: '[Guitar Solo]', text: '' },
        ],
      }),
    )
    expect(out.style).toMatch(/^Hard Rock \/ Balkan Sevdah, 96 BPM/)
    expect(out.style).not.toContain('Rijeka')
    expect(out.lyrics).toBe('[Intro]\n\n[Verse 1]\nLine one\nLine two\n\n[Guitar Solo]')
    expect(out.title).toBe('Rijeka')
  })

  it('Instrumental: keine Gesangsangabe, nur Tags', () => {
    const out = c.build(
      values('suno-music', {
        language: 'Instrumental',
        structure: [{ tag: '[Intro]', text: 'la la' }],
      }),
    )
    expect(out.style).toContain('instrumental')
    expect(out.style).not.toContain('vocals')
    expect(out.lyrics).toBe('[Intro]')
  })

  it('Style-Limit folgt der Auswahl 200/1000', () => {
    const style = c.outputs.find((o) => o.key === 'style')!
    expect(resolveLimit(style, values('suno-music'))).toBe(1000)
    expect(resolveLimit(style, values('suno-music', { styleLimit: '200' }))).toBe(200)
    expect(resolveLimit(style, values('suno-music', { styleLimit: 'abc' }))).toBe(1000)
  })
})

describe('Coding & Architektur', () => {
  const c = cat('coding-xml')

  it('erzeugt XML-Blöcke und nummeriert Anforderungen', () => {
    const out = c.build(
      values('coding-xml', {
        taskType: 'Bugfix',
        goal: 'Upload bricht bei 2 GB ab.',
        requirements: '- Limit prüfen\n2) Fehlermeldung zeigen',
        acceptance: 'Upload mit 2 GB läuft durch',
      }),
    )
    expect(out.prompt).toContain('<auftrag typ="Bugfix">\nUpload bricht bei 2 GB ab.\n</auftrag>')
    expect(out.prompt).toContain(
      '<anforderungen>\n1. Limit prüfen\n2. Fehlermeldung zeigen\n</anforderungen>',
    )
    expect(out.prompt).toContain('<tech_stack>')
    expect(out.prompt).toContain(
      '<akzeptanzkriterien>\n- Upload mit 2 GB läuft durch\n</akzeptanzkriterien>',
    )
  })

  it('lässt leere Blöcke weg und bleibt ohne Ziel leer', () => {
    expect(c.build(values('coding-xml')).prompt).toBe('')
    const out = c.build(values('coding-xml', { goal: 'X', constraints: [], stack: [] }))
    expect(out.prompt).not.toContain('<constraints>')
    expect(out.prompt).not.toContain('<kontext>')
  })
})

describe('Universal & Meta', () => {
  const c = cat('universal')

  it('gliedert die Idee und wechselt die Überschriften mit der Sprache', () => {
    const de = c.build(values('universal', { idea: 'Newsletter schreiben', role: 'Texter' }))
    expect(de.prompt).toContain('# Rolle\nDu bist Texter.')
    expect(de.prompt).toContain('# Aufgabe\nNewsletter schreiben')
    const en = c.build(values('universal', { idea: 'Write a newsletter', language: 'English' }))
    expect(en.prompt).toContain('# Task\nWrite a newsletter')
    expect(en.prompt).not.toContain('# Rolle')
  })
})

describe('makeBrief', () => {
  it('enthält gesetzte Parameter und den Entwurf, aber keine leeren Felder', () => {
    const c = cat('stock-photo')
    const v = values('stock-photo', { subject: 'a red bicycle', palette: '' })
    const brief = makeBrief(c, v, c.build(v))
    expect(brief).toContain('- Hauptmotiv: a red bicycle')
    expect(brief).toContain('(key: prompt)')
    expect(brief).not.toContain('- Farbpalette:')
  })
})
