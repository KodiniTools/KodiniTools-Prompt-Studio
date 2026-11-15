import { ref } from 'vue'

/** Kurze Rückmeldung unten rechts (z. B. „Kopiert“). */
export const notice = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

export function notify(text: string, ms = 1800): void {
  notice.value = text
  clearTimeout(timer)
  timer = setTimeout(() => (notice.value = ''), ms)
}
