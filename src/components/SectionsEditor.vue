<script setup lang="ts">
import type { Section } from '../types'

const props = defineProps<{
  modelValue: Section[]
  tags: readonly string[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: Section[]] }>()

function update(index: number, patch: Partial<Section>): void {
  emit(
    'update:modelValue',
    props.modelValue.map((s, i) => (i === index ? { ...s, ...patch } : s)),
  )
}

function move(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= props.modelValue.length) return
  const next = [...props.modelValue]
  const [item] = next.splice(index, 1)
  if (item) next.splice(target, 0, item)
  emit('update:modelValue', next)
}

function remove(index: number): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index),
  )
}

function add(): void {
  emit('update:modelValue', [...props.modelValue, { tag: props.tags[1] ?? '[Verse]', text: '' }])
}
</script>

<template>
  <div class="space-y-1.5">
    <div
      v-for="(section, index) in modelValue"
      :key="index"
      class="border-line bg-ink rounded-md border p-1.5"
    >
      <div class="flex items-center gap-1">
        <input
          class="field !border-transparent !bg-transparent !py-0.5 font-mono !text-[13px] text-accent"
          type="text"
          list="suno-tags"
          :value="section.tag"
          :aria-label="`Tag für Abschnitt ${index + 1}`"
          @input="update(index, { tag: ($event.target as HTMLInputElement).value })"
        />
        <button
          type="button"
          class="btn btn-quiet"
          title="Nach oben"
          :disabled="index === 0"
          @click="move(index, -1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="btn btn-quiet"
          title="Nach unten"
          :disabled="index === modelValue.length - 1"
          @click="move(index, 1)"
        >
          ↓
        </button>
        <button
          type="button"
          class="btn btn-quiet"
          title="Abschnitt entfernen"
          @click="remove(index)"
        >
          ×
        </button>
      </div>
      <textarea
        class="field mt-1 !border-transparent font-mono !text-[13px]"
        rows="2"
        placeholder="Text (leer = nur Tag, z. B. für Solo oder Intro)"
        :value="section.text"
        :aria-label="`Text für Abschnitt ${index + 1}`"
        @input="update(index, { text: ($event.target as HTMLTextAreaElement).value })"
      />
    </div>
    <datalist id="suno-tags">
      <option v-for="tag in tags" :key="tag" :value="tag" />
    </datalist>
    <button type="button" class="btn w-full" @click="add">+ Abschnitt</button>
  </div>
</template>
