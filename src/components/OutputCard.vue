<script setup lang="ts">
import { computed, ref } from 'vue'
import { copyText, estimateTokens } from '../lib/text'

const props = defineProps<{
  label: string
  text: string
  limit?: number
  /** Kleinere Darstellung für Nebenausgaben. */
  compact?: boolean
}>()

const emit = defineEmits<{ copied: [] }>()

const copied = ref(false)
const over = computed(() => props.limit !== undefined && props.text.length > props.limit)
const empty = computed(() => props.text.trim() === '')

async function copy(): Promise<void> {
  if (empty.value) return
  if (!(await copyText(props.text))) return
  copied.value = true
  emit('copied')
  setTimeout(() => (copied.value = false), 1400)
}

defineExpose({ copy })
</script>

<template>
  <article class="border-line bg-panel rounded-lg border">
    <header class="border-line flex items-center gap-3 border-b px-3 py-1.5">
      <h3 class="text-dim text-xs font-semibold tracking-wider uppercase">{{ label }}</h3>
      <span class="ml-auto font-mono text-xs" :class="over ? 'text-bad' : 'text-faint'">
        {{ text.length }}<template v-if="limit !== undefined"> / {{ limit }}</template> Zeichen
        <span class="text-faint"> · ≈ {{ estimateTokens(text) }} Tokens</span>
      </span>
      <button
        type="button"
        class="btn"
        :class="{ 'btn-accent': copied }"
        :disabled="empty"
        @click="copy"
      >
        {{ copied ? 'Kopiert' : 'Kopieren' }}
      </button>
    </header>
    <pre
      class="scroll m-0 px-3 py-2.5 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap"
      :class="[compact ? 'max-h-40' : 'max-h-[46vh]', empty ? 'text-faint' : 'text-fg']"
      >{{ empty ? '— leer —' : text }}</pre>
    <p v-if="over" class="text-bad border-line border-t px-3 py-1.5 text-xs">
      {{ text.length - (limit ?? 0) }} Zeichen über dem Limit.
    </p>
  </article>
</template>
