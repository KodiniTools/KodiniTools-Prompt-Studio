import type { CategoryDef } from '../types'
import { lines, list, str } from './helpers'

function block(tag: string, body: string, attrs = ''): string {
  const content = body.trim()
  if (content === '') return ''
  return `<${tag}${attrs}>\n${content}\n</${tag}>`
}

function numbered(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n')
}

function bullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n')
}

const category: CategoryDef = {
  id: 'coding-xml',
  label: 'Coding & Architektur',
  description: 'XML-strukturierte Aufträge für Claude Code',
  order: 40,
  fields: [
    {
      id: 'taskType',
      type: 'combo',
      label: 'Aufgabe',
      half: true,
      default: 'Neues Feature',
      options: [
        'Neues Feature',
        'Refactoring',
        'Bugfix',
        'Architektur-Plan',
        'Code-Review',
        'Tests ergänzen',
        'Migration',
      ],
    },
    {
      id: 'project',
      type: 'text',
      label: 'Projekt / Repo',
      half: true,
      placeholder: 'z. B. KodiniTools/Video-Cutter',
    },
    {
      id: 'goal',
      type: 'textarea',
      label: 'Ziel',
      rows: 3,
      placeholder: 'Was soll am Ende funktionieren? Ein bis drei Sätze.',
    },
    {
      id: 'context',
      type: 'textarea',
      label: 'Kontext',
      rows: 4,
      placeholder: 'Ist-Zustand, betroffene Dateien, Fehlermeldungen, bisherige Versuche.',
    },
    {
      id: 'stack',
      type: 'chips',
      label: 'Tech-Stack',
      default: [
        'Vue 3 (Composition API, <script setup>)',
        'TypeScript strict',
        'Pinia',
        'Vite',
        'Vitest',
      ],
      options: [
        'Vue 3 (Composition API, <script setup>)',
        'TypeScript strict',
        'Pinia',
        'Vue Router',
        'Vite',
        'Vitest',
        'Tailwind CSS',
        'Node.js / Express',
        'Java 21',
        'Spring Boot',
        'Nginx',
        'PM2',
        'FFmpeg',
      ],
    },
    {
      id: 'requirements',
      type: 'textarea',
      label: 'Anforderungen',
      rows: 5,
      placeholder: 'Eine Anforderung pro Zeile.',
    },
    {
      id: 'constraints',
      type: 'chips',
      label: 'Constraints',
      default: [
        'Starte im Plan-Modus und warte auf meine Freigabe, bevor du Code schreibst',
        'Keine Regressionen in anderen Modulen',
      ],
      options: [
        'Starte im Plan-Modus und warte auf meine Freigabe, bevor du Code schreibst',
        'Arbeite im PR-Workflow: eigener Branch, ein PR pro Thema',
        'Keine Regressionen in anderen Modulen',
        'Kleinster wirksamer Eingriff',
        'Bestehende Tests ausführen und mindestens einen neuen ergänzen',
        'Liefere vollständige Dateien, keine Ausschnitte',
        'Keine neuen Abhängigkeiten ohne Rückfrage',
        'Öffentliche Schnittstellen bleiben unverändert',
        'Keine manuellen Edits auf dem Server – nur sed oder vollständige Dateien',
      ],
    },
    {
      id: 'outputFormat',
      type: 'combo',
      label: 'Output-Format',
      default: 'Assumptions → Plan → Code (mit Dateipfaden) → How to run → Tests → Risiken',
      options: [
        'Assumptions → Plan → Code (mit Dateipfaden) → How to run → Tests → Risiken',
        'Nur Plan mit Architektur-Skizze und offenen Fragen',
        'Unified Diff pro Datei',
        'Review-Bericht: Befunde nach Schweregrad, je mit Datei und Zeile',
      ],
    },
    {
      id: 'acceptance',
      type: 'textarea',
      label: 'Akzeptanzkriterien',
      rows: 3,
      placeholder: 'Woran erkenne ich, dass es fertig ist? Eine Zeile pro Kriterium.',
    },
  ],
  outputs: [{ key: 'prompt', label: 'Auftrag (XML)', primary: true }],
  build: (values) => {
    const goal = str(values, 'goal')
    if (goal === '' && str(values, 'requirements') === '') return { prompt: '' }

    const taskType = str(values, 'taskType')
    const project = str(values, 'project')
    const stack = list(values, 'stack')

    const context = [
      project && `Projekt: ${project}`,
      str(values, 'context'),
      stack.length > 0 && block('tech_stack', bullets(stack)),
    ]
      .filter(Boolean)
      .join('\n\n')

    const parts = [
      block('auftrag', goal, taskType ? ` typ="${taskType}"` : ''),
      block('kontext', context),
      block('anforderungen', numbered(lines(str(values, 'requirements')))),
      block('constraints', bullets(list(values, 'constraints'))),
      block('ausgabeformat', str(values, 'outputFormat')),
      block('akzeptanzkriterien', bullets(lines(str(values, 'acceptance')))),
    ]
    return { prompt: parts.filter(Boolean).join('\n\n') }
  },
  ai: {
    system: [
      'You write task briefs for an AI coding agent (Claude Code) on behalf of a solo developer.',
      'Output a single brief structured with XML tags: <auftrag>, <kontext>, <anforderungen>, <constraints>, <ausgabeformat>, <akzeptanzkriterien>. Keep the tag names exactly as given.',
      'Write the content in German. Make every requirement specific and testable; split vague wishes into concrete numbered items.',
      'Surface missing information as explicit assumptions or open questions inside <kontext> instead of inventing facts about the codebase.',
      'Keep all constraints the user selected. Do not write code; write the brief.',
    ].join('\n'),
  },
}

export default category
