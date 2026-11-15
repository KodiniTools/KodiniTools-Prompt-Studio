import type { CategoryDef } from '../types'
import { lines, str } from './helpers'

function section(title: string, body: string): string {
  const content = body.trim()
  return content === '' ? '' : `# ${title}\n${content}`
}

const category: CategoryDef = {
  id: 'universal',
  label: 'Universal & Meta',
  description: 'Rohe Idee → strukturierter Prompt für jedes Modell',
  order: 50,
  fields: [
    {
      id: 'idea',
      type: 'textarea',
      label: 'Rohe Idee',
      rows: 5,
      placeholder: 'Stichworte genügen. Was soll das Modell tun?',
    },
    {
      id: 'target',
      type: 'combo',
      label: 'Zielmodell',
      half: true,
      default: 'Claude',
      options: [
        'Claude',
        'ChatGPT',
        'Gemini',
        'beliebiges Sprachmodell',
        'Bildmodell',
        'Videomodell',
      ],
    },
    {
      id: 'language',
      type: 'combo',
      label: 'Sprache des Prompts',
      half: true,
      default: 'Deutsch',
      options: ['Deutsch', 'English', 'Hrvatski'],
    },
    {
      id: 'role',
      type: 'text',
      label: 'Rolle',
      placeholder: 'z. B. erfahrener Lektor für Sachbücher',
    },
    {
      id: 'audience',
      type: 'text',
      label: 'Zielgruppe / Verwendung',
      placeholder: 'Für wen ist das Ergebnis, und wofür?',
    },
    {
      id: 'context',
      type: 'textarea',
      label: 'Kontext & Material',
      rows: 3,
      placeholder: 'Hintergrund, vorhandene Texte, Daten, Beispiele.',
    },
    {
      id: 'requirements',
      type: 'textarea',
      label: 'Anforderungen',
      rows: 3,
      placeholder: 'Eine Anforderung pro Zeile.',
    },
    {
      id: 'format',
      type: 'combo',
      label: 'Ausgabeformat',
      half: true,
      default: '',
      placeholder: 'frei',
      options: [
        'Fliesstext ohne Aufzählungen',
        'Gegliedert mit Überschriften',
        'Tabelle',
        'Nummerierte Schritt-für-Schritt-Anleitung',
        'JSON',
        'Markdown-Dokument',
        'Kurze Antwort, maximal fünf Sätze',
      ],
    },
    {
      id: 'tone',
      type: 'combo',
      label: 'Ton',
      half: true,
      default: '',
      placeholder: 'frei',
      options: [
        'sachlich und präzise',
        'locker und direkt',
        'formell',
        'motivierend',
        'kritisch-prüfend',
      ],
    },
    {
      id: 'avoid',
      type: 'textarea',
      label: 'Vermeiden',
      rows: 2,
      placeholder: 'Was soll ausdrücklich nicht passieren?',
    },
  ],
  outputs: [{ key: 'prompt', label: 'Prompt', primary: true }],
  build: (values) => {
    const idea = str(values, 'idea')
    if (idea === '') return { prompt: '' }

    const english = str(values, 'language') === 'English'
    const t = english
      ? {
          role: 'Role',
          task: 'Task',
          audience: 'Audience',
          context: 'Context',
          req: 'Requirements',
          format: 'Output format',
          tone: 'Tone',
          avoid: 'Avoid',
          youAre: 'You are',
          ask: 'If essential information is missing, ask before you start.',
        }
      : {
          role: 'Rolle',
          task: 'Aufgabe',
          audience: 'Zielgruppe',
          context: 'Kontext',
          req: 'Anforderungen',
          format: 'Ausgabeformat',
          tone: 'Ton',
          avoid: 'Vermeiden',
          youAre: 'Du bist',
          ask: 'Fehlt eine wesentliche Information, frag nach, bevor du beginnst.',
        }

    const role = str(values, 'role')
    const requirements = lines(str(values, 'requirements'))
    const avoid = lines(str(values, 'avoid'))

    const parts = [
      section(t.role, role ? `${t.youAre} ${role}.` : ''),
      section(t.task, idea),
      section(t.audience, str(values, 'audience')),
      section(t.context, str(values, 'context')),
      section(t.req, requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')),
      section(t.format, str(values, 'format')),
      section(t.tone, str(values, 'tone')),
      section(t.avoid, avoid.map((a) => `- ${a}`).join('\n')),
      t.ask,
    ]
    return { prompt: parts.filter(Boolean).join('\n\n') }
  },
  ai: {
    system: [
      'You are an expert prompt engineer. Turn a rough idea into a clear, complete prompt for the target model named in the parameters.',
      'A strong prompt states the role, the task, relevant context, concrete requirements, the output format and what to avoid. Explain the purpose behind requirements where it helps the model make good decisions.',
      'Prefer specific instructions over generic ones; remove filler. Use structure (headings or XML tags) only where it helps the target model.',
      'For image or video models, write a descriptive visual prompt instead of an instruction list.',
      'Write the prompt in the language named in the parameters. Do not answer the task itself; write the prompt.',
    ].join('\n'),
  },
}

export default category
