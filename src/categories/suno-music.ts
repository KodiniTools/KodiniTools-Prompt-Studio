import type { CategoryDef } from '../types'
import { commaJoin, list, num, sections, str } from './helpers'

/** Zeichenlimit des Style-Felds: 200 (ältere Suno-Modelle) oder 1000 (neuere). */
const STYLE_LIMITS = ['1000', '200'] as const

/**
 * Annahme: Lyrics-Limit 5000 Zeichen. Suno hat das Limit je Modell geändert –
 * bei Bedarf hier anpassen.
 */
const LYRICS_LIMIT = 5000

const TAGS = [
  '[Intro]',
  '[Verse]',
  '[Verse 1]',
  '[Verse 2]',
  '[Verse 3]',
  '[Pre-Chorus]',
  '[Chorus]',
  '[Post-Chorus]',
  '[Bridge]',
  '[Guitar Solo]',
  '[Instrumental Break]',
  '[Interlude]',
  '[Breakdown]',
  '[Build]',
  '[Final Chorus]',
  '[Outro]',
  '[End]',
] as const

const category: CategoryDef = {
  id: 'suno-music',
  label: 'Musik & Songwriting',
  description: 'Suno AI – Style-Prompt und Lyrics getrennt',
  order: 30,
  fields: [
    { id: 'title', type: 'text', label: 'Songtitel', half: true, placeholder: 'optional' },
    {
      id: 'language',
      type: 'combo',
      label: 'Sprache',
      half: true,
      default: 'English',
      options: ['English', 'Deutsch', 'Hrvatski', 'Bosanski', 'Instrumental'],
    },
    {
      id: 'genres',
      type: 'chips',
      label: 'Genre / Fusion',
      default: ['Classic Rock'],
      options: [
        'Classic Rock',
        'Hard Rock',
        'Balkan Sevdah',
        'Folk-Rock',
        'Cinematic',
        'Blues Rock',
        'Southern Rock',
        'Acoustic Ballad',
        'Balkan Brass',
        'Progressive Rock',
        'Heavy Metal',
        'Americana',
        'Orchestral',
        'Singer-Songwriter',
      ],
      hint: 'Zwei bis drei Genres ergeben eine Fusion.',
    },
    {
      id: 'bpm',
      type: 'slider',
      label: 'Tempo',
      half: true,
      min: 50,
      max: 200,
      step: 2,
      default: 110,
      unit: 'BPM',
    },
    {
      id: 'key',
      type: 'combo',
      label: 'Tonart',
      half: true,
      default: '',
      placeholder: 'offen',
      options: [
        'A minor',
        'E minor',
        'D minor',
        'G major',
        'C major',
        'D major',
        'E major',
        'B minor',
      ],
    },
    {
      id: 'instruments',
      type: 'chips',
      label: 'Instrumentierung',
      default: ['electric guitar', 'bass', 'drums'],
      options: [
        'electric guitar',
        'acoustic guitar',
        'bass',
        'drums',
        'Hammond organ',
        'piano',
        'strings',
        'accordion',
        'saz',
        'violin',
        'brass section',
        'harmonica',
        'tamburica',
        'clarinet',
        'synth pads',
        'choir',
      ],
    },
    {
      id: 'vocals',
      type: 'combo',
      label: 'Gesangsstil / Stimmfarbe',
      default: 'raspy male vocals',
      options: [
        'raspy male vocals',
        'powerful male tenor',
        'deep baritone male vocals',
        'warm female alto',
        'soaring female vocals',
        'melancholic sevdah vocals with ornamentation',
        'gritty rock vocals',
        'soft intimate vocals',
        'male and female duet',
        'gang vocals in the chorus',
      ],
    },
    {
      id: 'emotions',
      type: 'chips',
      label: 'Emotion',
      default: ['nostalgic'],
      options: [
        'nostalgic',
        'melancholic',
        'triumphant',
        'defiant',
        'longing',
        'hopeful',
        'bittersweet',
        'dark',
        'euphoric',
        'tender',
        'rebellious',
      ],
    },
    {
      id: 'production',
      type: 'combo',
      label: 'Produktions-Qualität',
      default: 'warm analog production, wide stereo mix',
      options: [
        'warm analog production, wide stereo mix',
        '70s vintage tape sound',
        'modern polished studio production',
        'raw live-in-the-room recording',
        'big arena sound with reverb',
        'intimate lo-fi recording',
        'epic cinematic mix',
      ],
    },
    {
      id: 'styleLimit',
      type: 'combo',
      label: 'Limit Style-Prompt',
      half: true,
      default: STYLE_LIMITS[0],
      options: STYLE_LIMITS,
      hint: '200 für ältere Suno-Modelle, 1000 für neuere.',
    },
    {
      id: 'theme',
      type: 'textarea',
      label: 'Thema / Story',
      rows: 2,
      placeholder: 'Worum geht der Song? Nur für den Turbo-Modus (Claude schreibt die Lyrics).',
    },
    {
      id: 'structure',
      type: 'sections',
      label: 'Lyrics-Gerüst',
      tags: TAGS,
      default: [
        { tag: '[Intro]', text: '' },
        { tag: '[Verse 1]', text: '' },
        { tag: '[Chorus]', text: '' },
        { tag: '[Verse 2]', text: '' },
        { tag: '[Chorus]', text: '' },
        { tag: '[Guitar Solo]', text: '' },
        { tag: '[Bridge]', text: '' },
        { tag: '[Chorus]', text: '' },
        { tag: '[Outro]', text: '' },
      ],
      hint: 'Tags stehen allein in einer Zeile, der Text darunter.',
    },
  ],
  outputs: [
    {
      key: 'style',
      label: 'Style-Prompt',
      primary: true,
      limit: (values) => {
        const n = Number(str(values, 'styleLimit'))
        return Number.isInteger(n) && n > 0 ? n : 1000
      },
    },
    { key: 'lyrics', label: 'Lyrics', limit: LYRICS_LIMIT },
    { key: 'title', label: 'Titel' },
  ],
  build: (values) => {
    const instrumental = str(values, 'language') === 'Instrumental'
    const language = str(values, 'language')

    const style = commaJoin([
      list(values, 'genres').join(' / '),
      `${num(values, 'bpm', 110)} BPM`,
      str(values, 'key'),
      list(values, 'instruments').join(', '),
      instrumental ? 'instrumental' : str(values, 'vocals'),
      !instrumental && language && language !== 'English' && `sung in ${language}`,
      list(values, 'emotions').join(', '),
      str(values, 'production'),
    ])

    const lyrics = sections(values, 'structure')
      .map((s) => {
        const tag = s.tag.trim()
        const text = instrumental ? '' : s.text.trim()
        return text ? `${tag}\n${text}` : tag
      })
      .filter((block) => block !== '')
      .join('\n\n')

    return { style, lyrics, title: str(values, 'title') }
  },
  ai: {
    system: [
      'You are a songwriter and producer writing for Suno AI.',
      'The "style" output is a comma-separated list of musical descriptors only: genres, tempo, instruments, vocal character, mood, production. No song title, no artist names, no lyrics.',
      'The "lyrics" output uses Suno metatags, each alone on its own line in square brackets (for example [Intro], [Verse 1], [Chorus], [Guitar Solo], [Outro]), followed by the sung lines. Keep the section order given in the parameters.',
      'Write lyrics in the requested language with natural rhythm and singable lines of similar length; give the chorus a memorable hook that repeats. Instrumental sections contain only the tag.',
      'If the language is Instrumental, return only tags in the lyrics. The "title" output is a short song title.',
      'Balkan genres such as sevdah deserve idiomatic imagery and phrasing, not literal translation from English.',
    ].join('\n'),
  },
}

export default category
