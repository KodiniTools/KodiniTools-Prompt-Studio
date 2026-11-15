import type { CategoryDef } from '../types'
import { commaJoin, num, sentence, str } from './helpers'

const INTENSITY = ['very subtle', 'gentle', 'moderate', 'dynamic', 'intense'] as const

function intensityWord(level: number): string {
  return INTENSITY[Math.min(INTENSITY.length, Math.max(1, Math.round(level))) - 1] ?? 'moderate'
}

const category: CategoryDef = {
  id: 'video-motion',
  label: 'Video & Motion',
  description: 'Kling AI, Runway, ComfyUI',
  order: 20,
  fields: [
    {
      id: 'tool',
      type: 'combo',
      label: 'Zieltool',
      half: true,
      default: 'Kling AI',
      options: ['Kling AI', 'Runway', 'ComfyUI'],
    },
    {
      id: 'duration',
      type: 'combo',
      label: 'Dauer',
      half: true,
      default: '5 seconds',
      options: ['5 seconds', '10 seconds'],
    },
    {
      id: 'subject',
      type: 'textarea',
      label: 'Subjekt & Szene',
      rows: 2,
      placeholder: 'z. B. an old fisherman on a wooden boat at dawn',
    },
    {
      id: 'action',
      type: 'textarea',
      label: 'Subjekt-Aktion',
      rows: 2,
      placeholder: 'z. B. slowly pulls in a net, water dripping from the ropes',
      hint: 'Eine klare Bewegung pro Clip – mehrere Aktionen verwischen.',
    },
    {
      id: 'camera',
      type: 'combo',
      label: 'Kamerabewegung',
      half: true,
      default: 'static shot',
      options: [
        'static shot',
        'slow pan left',
        'slow pan right',
        'tilt up',
        'tilt down',
        'dolly in',
        'dolly out',
        'tracking shot following the subject',
        'orbit around the subject',
        'drone flyover',
        'crane shot rising',
        'handheld',
      ],
    },
    {
      id: 'intensity',
      type: 'slider',
      label: 'Bewegungsintensität',
      half: true,
      min: 1,
      max: 5,
      step: 1,
      default: 2,
      format: intensityWord,
    },
    {
      id: 'lighting',
      type: 'combo',
      label: 'Licht & Atmosphäre',
      default: 'soft morning light, light mist',
      options: [
        'soft morning light, light mist',
        'golden hour, warm haze',
        'overcast, diffuse light',
        'night, neon reflections on wet ground',
        'stormy sky, dramatic clouds',
        'candlelight, deep shadows',
        'bright midday sun, hard shadows',
      ],
    },
    {
      id: 'style',
      type: 'combo',
      label: 'Stil / Look',
      default: 'cinematic, 35mm film look, shallow depth of field',
      options: [
        'cinematic, 35mm film look, shallow depth of field',
        'documentary realism, natural colors',
        'music video, high contrast, stylized color grade',
        'vintage 16mm film, visible grain',
        'clean commercial look, crisp detail',
        'anime style',
        'stop-motion look',
      ],
    },
    {
      id: 'startFrame',
      type: 'textarea',
      label: 'Start-Frame',
      rows: 2,
      placeholder:
        'Was zeigt das erste Bild? (bei Image-to-Video: das hochgeladene Bild beschreiben)',
    },
    {
      id: 'endFrame',
      type: 'textarea',
      label: 'End-Frame',
      rows: 2,
      placeholder: 'Was zeigt das letzte Bild? Leer lassen = offen.',
    },
    {
      id: 'negative',
      type: 'textarea',
      label: 'Negative Prompt',
      rows: 2,
      default: 'morphing, flickering, warped faces, extra limbs, jitter, text, watermark',
    },
  ],
  outputs: [
    { key: 'prompt', label: 'Prompt', primary: true },
    { key: 'negative', label: 'Negative Prompt' },
  ],
  build: (values) => {
    const subject = str(values, 'subject')
    const action = str(values, 'action')
    const camera = str(values, 'camera')
    const start = str(values, 'startFrame')
    const end = str(values, 'endFrame')
    const intensity = intensityWord(num(values, 'intensity', 2))

    const scene = sentence(commaJoin([subject, action]))
    const cam = camera
      ? sentence(`Camera: ${camera}, ${intensity} motion`)
      : sentence(`${intensity} motion`)

    let frames = ''
    if (start && end) {
      frames = `${sentence(`Starts on: ${start}`)} ${sentence(`Ends on: ${end}`)} One continuous, smooth transition from the first to the last frame.`
    } else if (start) {
      frames = `${sentence(`First frame: ${start}`)} The motion develops naturally from this frame.`
    } else if (end) {
      frames = sentence(`The shot resolves on: ${end}`)
    }

    const look = sentence(commaJoin([str(values, 'lighting'), str(values, 'style')]))
    const duration = str(values, 'duration')

    const prompt =
      scene === ''
        ? ''
        : [scene, cam, frames, look, duration && sentence(`Duration: ${duration}`)]
            .filter(Boolean)
            .join(' ')

    return { prompt, negative: str(values, 'negative') }
  },
  ai: {
    system: [
      'You are a director of photography writing prompts for AI video generators (Kling AI, Runway, ComfyUI video workflows).',
      'Describe one continuous shot in fluent English: subject and its single main action, camera movement with speed, lighting and atmosphere, then the visual style.',
      'Use precise film language (dolly, pan, tilt, tracking, rack focus). Describe motion as it unfolds over time. One action per clip.',
      'Respect start and end frame descriptions exactly when given, and describe how the shot travels between them.',
      'Adapt phrasing to the target tool named in the parameters. The negative prompt is a comma-separated list.',
    ].join('\n'),
  },
}

export default category
