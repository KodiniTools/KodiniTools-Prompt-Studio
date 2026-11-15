import type { CategoryDef, Outputs, Values, Variant } from '../types'
import { bool, commaJoin, sentence, str } from './helpers'

const LIGHTING = [
  'soft natural window light',
  'golden hour backlight',
  'bright overcast daylight',
  'studio softbox lighting',
  'dramatic side light with deep shadows',
  'blue hour ambient light',
  'high-key lighting',
  'low-key moody lighting',
] as const

const CAMERA = [
  'full-frame camera, 50mm lens, f/1.8',
  'full-frame camera, 35mm lens, f/2.8',
  'full-frame camera, 85mm lens, f/1.4',
  'full-frame camera, 24mm wide-angle lens, f/8',
  '100mm macro lens, f/4',
  'medium format camera, 80mm lens, f/4',
  'aerial drone camera',
] as const

const COMPOSITION = [
  'rule of thirds',
  'centered symmetrical composition',
  'close-up',
  'wide establishing shot',
  'top-down flat lay',
  'over-the-shoulder view',
  'low angle',
  'eye-level medium shot',
] as const

const COPY_SPACE: Record<string, string> = {
  links: 'generous empty copy space on the left',
  rechts: 'generous empty copy space on the right',
  oben: 'generous empty copy space at the top',
  unten: 'generous empty copy space at the bottom',
  mittig: 'clean empty copy space in the center',
}

const STOCK_NEGATIVE = 'logos, brand names, trademarks, text, watermark, signature'

function buildWith(
  values: Values,
  override: Partial<Record<'lighting' | 'camera' | 'composition', string>>,
): Outputs {
  const copy = COPY_SPACE[str(values, 'copySpace')]
  const aspect = str(values, 'aspect')
  const stockSafe = bool(values, 'stockSafe')

  const body = commaJoin([
    str(values, 'subject'),
    str(values, 'style'),
    override.composition ?? str(values, 'composition'),
    copy,
    override.lighting ?? str(values, 'lighting'),
    str(values, 'palette') && `${str(values, 'palette')} color palette`,
    (override.camera ?? str(values, 'camera')) &&
      `shot on ${override.camera ?? str(values, 'camera')}`,
    str(values, 'details'),
    stockSafe && 'authentic commercial stock photography, sharp focus, high detail',
  ])

  // Ohne Motiv kein Prompt: Stil- und Kamera-Defaults allein ergeben kein Bild.
  const prompt =
    str(values, 'subject') === ''
      ? ''
      : `${sentence(body)}${aspect ? ` Aspect ratio ${aspect}.` : ''}`
  const negative = commaJoin([str(values, 'negative'), stockSafe && STOCK_NEGATIVE])
  return { prompt, negative }
}

/** Wählt ab der aktuellen Auswahl fortlaufend Optionen, damit der Batch reproduzierbar ist. */
function rotate(options: readonly string[], current: string, offset: number): string {
  if (offset === 0) return current // eigener Wert bleibt in der ersten Variante erhalten
  const start = Math.max(0, options.indexOf(current))
  return options[(start + offset) % options.length] ?? current
}

function batch(values: Values): Variant[] {
  if (str(values, 'subject') === '') return []
  const out: Variant[] = []
  for (let i = 0; i < 5; i++) {
    // Unterschiedliche Schrittweiten, damit sich die drei Achsen nicht parallel bewegen.
    const lighting = rotate(LIGHTING, str(values, 'lighting'), i)
    const camera = rotate(CAMERA, str(values, 'camera'), i * 2)
    const composition = rotate(COMPOSITION, str(values, 'composition'), i * 3)
    out.push({
      label: i === 0 ? 'Original' : `${composition} · ${lighting}`,
      outputs: buildWith(values, { lighting, camera, composition }),
    })
  }
  return out
}

const category: CategoryDef = {
  id: 'stock-photo',
  label: 'Stock & KI-Foto',
  description: 'Adobe Stock, Gemini, Flux, Ideogram, Leonardo',
  order: 10,
  stockSeller: true,
  fields: [
    {
      id: 'subject',
      type: 'textarea',
      label: 'Hauptmotiv',
      rows: 3,
      placeholder: 'z. B. senior carpenter sanding an oak table in a sunlit workshop',
      hint: 'Englisch liefert bei allen Bildmodellen die besten Ergebnisse.',
    },
    {
      id: 'style',
      type: 'combo',
      label: 'Stil / Medium',
      half: true,
      default: 'photorealistic photograph',
      options: [
        'photorealistic photograph',
        'editorial photography',
        'lifestyle photography',
        'product photography',
        'documentary photography',
        'cinematic still',
        '3D render',
        'flat vector illustration',
        'watercolor illustration',
        'isometric illustration',
      ],
    },
    {
      id: 'camera',
      type: 'combo',
      label: 'Kamera / Objektiv',
      half: true,
      default: CAMERA[0],
      options: CAMERA,
    },
    {
      id: 'lighting',
      type: 'combo',
      label: 'Lichtstimmung',
      half: true,
      default: LIGHTING[0],
      options: LIGHTING,
    },
    {
      id: 'composition',
      type: 'combo',
      label: 'Komposition',
      half: true,
      default: COMPOSITION[0],
      options: COMPOSITION,
    },
    {
      id: 'copySpace',
      type: 'combo',
      label: 'Copy Space',
      half: true,
      default: '',
      placeholder: 'keiner',
      options: Object.keys(COPY_SPACE),
      hint: 'Freifläche für Text – bei Stock-Käufern gefragt.',
    },
    {
      id: 'aspect',
      type: 'combo',
      label: 'Seitenverhältnis',
      half: true,
      default: '3:2',
      options: ['3:2', '16:9', '4:3', '1:1', '4:5', '2:3', '9:16', '21:9'],
    },
    {
      id: 'palette',
      type: 'combo',
      label: 'Farbpalette',
      default: '',
      placeholder: 'frei',
      options: [
        'warm earthy',
        'cool blue and teal',
        'muted pastel',
        'vibrant saturated',
        'monochrome',
        'black and white',
        'neutral beige and white',
        'dark moody',
      ],
    },
    {
      id: 'details',
      type: 'text',
      label: 'Zusätzliche Details',
      placeholder: 'z. B. shallow depth of field, dust particles in the air',
    },
    {
      id: 'negative',
      type: 'textarea',
      label: 'Negative Prompt',
      rows: 2,
      default: 'blurry, low quality, distorted hands, extra fingers, oversaturated, artifacts',
      hint: 'Flux ignoriert Negative Prompts; Leonardo und ComfyUI nutzen sie.',
    },
    {
      id: 'stockSafe',
      type: 'toggle',
      label: 'Stock-tauglich',
      default: true,
      hint: 'Ergänzt Qualitätsmerkmale und schliesst Logos, Marken und Text aus.',
    },
    {
      id: 'batch',
      type: 'toggle',
      label: 'Batch-Modus',
      default: false,
      hint: '5 Varianten: Licht, Objektiv und Komposition wechseln reihum.',
    },
  ],
  outputs: [
    { key: 'prompt', label: 'Prompt', primary: true },
    { key: 'negative', label: 'Negative Prompt' },
  ],
  build: (values) => buildWith(values, {}),
  batch,
  ai: {
    system: [
      'You are a senior prompt engineer for AI image generators (Gemini, Flux, Ideogram, Leonardo) and an experienced Adobe Stock contributor.',
      'Write image prompts in fluent English as one dense descriptive paragraph: subject and action first, then setting, composition, lighting, lens, colour and mood.',
      'Favour concrete visual detail over adjectives like "beautiful" or "stunning". Never include brand names, logos, real people or legible text.',
      'Keep the image commercially usable: authentic, well lit, technically clean, with the requested copy space.',
      'The negative prompt is a comma-separated list of things to avoid.',
    ].join('\n'),
  },
}

export default category
