<script setup lang="ts">
import { ref } from 'vue'
import { useStudioStore } from '../stores/studio'
import type { FieldDef, Section } from '../types'
import ComboInput from './ComboInput.vue'
import SectionsEditor from './SectionsEditor.vue'

const studio = useStudioStore()
const customChip = ref<Record<string, string>>({})

function text(field: FieldDef): string {
  const v = studio.values[field.id]
  return typeof v === 'string' ? v : ''
}

function chips(field: FieldDef): string[] {
  const v = studio.values[field.id]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function number(field: FieldDef): number {
  const v = studio.values[field.id]
  return typeof v === 'number' ? v : 0
}

function sectionList(field: FieldDef): Section[] {
  const v = studio.values[field.id]
  return Array.isArray(v) ? v.filter((x): x is Section => typeof x === 'object' && x !== null) : []
}

function onInput(field: FieldDef, event: Event): void {
  studio.setValue(field.id, (event.target as HTMLInputElement | HTMLTextAreaElement).value)
}

function toggleChip(field: FieldDef, option: string): void {
  const current = chips(field)
  studio.setValue(
    field.id,
    current.includes(option) ? current.filter((c) => c !== option) : [...current, option],
  )
}

function addCustomChip(field: FieldDef): void {
  const value = (customChip.value[field.id] ?? '').trim()
  if (value === '') return
  if (!chips(field).includes(value)) studio.setValue(field.id, [...chips(field), value])
  customChip.value[field.id] = ''
}

/** Vorgegebene Optionen plus eigene, bereits gewählte Werte. */
function chipOptions(field: FieldDef & { type: 'chips' }): string[] {
  const extra = chips(field).filter((c) => !field.options.includes(c))
  return [...field.options, ...extra]
}
</script>

<template>
  <div class="grid grid-cols-2 gap-x-3 gap-y-3">
    <div
      v-for="field in studio.category.fields"
      :key="`${studio.category.id}:${field.id}`"
      :class="field.half ? 'col-span-1' : 'col-span-2'"
    >
      <!-- Toggle: Beschriftung neben dem Schalter -->
      <label v-if="field.type === 'toggle'" class="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          class="mt-0.5 h-4 w-4"
          :checked="studio.values[field.id] === true"
          @change="studio.setValue(field.id, ($event.target as HTMLInputElement).checked)"
        />
        <span>
          <span class="text-fg">{{ field.label }}</span>
          <span v-if="field.hint" class="text-faint block text-xs">{{ field.hint }}</span>
        </span>
      </label>

      <template v-else>
        <label class="label" :for="`f-${field.id}`">
          {{ field.label }}
          <span v-if="field.type === 'slider'" class="text-fg float-right font-mono">
            {{ number(field) }}{{ field.unit ? ` ${field.unit}` : '' }}
            <template v-if="field.format"> · {{ field.format(number(field)) }}</template>
          </span>
        </label>

        <input
          v-if="field.type === 'text'"
          :id="`f-${field.id}`"
          class="field"
          type="text"
          :value="text(field)"
          :placeholder="field.placeholder"
          @input="onInput(field, $event)"
          @focus="studio.focusedField = field.id"
        />

        <textarea
          v-else-if="field.type === 'textarea'"
          :id="`f-${field.id}`"
          class="field"
          :rows="field.rows ?? 3"
          :value="text(field)"
          :placeholder="field.placeholder"
          @input="onInput(field, $event)"
          @focus="studio.focusedField = field.id"
        />

        <ComboInput
          v-else-if="field.type === 'combo'"
          :id="`f-${field.id}`"
          :model-value="text(field)"
          :options="field.options"
          :placeholder="field.placeholder"
          @update:model-value="studio.setValue(field.id, $event)"
          @focus="studio.focusedField = field.id"
        />

        <template v-else-if="field.type === 'chips'">
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="option in chipOptions(field)"
              :key="option"
              type="button"
              class="chip"
              :aria-pressed="chips(field).includes(option)"
              @click="toggleChip(field, option)"
            >
              {{ option }}
            </button>
            <input
              :id="`f-${field.id}`"
              v-model="customChip[field.id]"
              class="field !w-32 !rounded-full !px-2.5 !py-0.5 text-[12.5px]"
              type="text"
              placeholder="+ eigener"
              @keydown.enter.prevent="addCustomChip(field)"
              @blur="addCustomChip(field)"
            />
          </div>
        </template>

        <input
          v-else-if="field.type === 'slider'"
          :id="`f-${field.id}`"
          class="w-full"
          type="range"
          :min="field.min"
          :max="field.max"
          :step="field.step"
          :value="number(field)"
          @input="studio.setValue(field.id, Number(($event.target as HTMLInputElement).value))"
        />

        <SectionsEditor
          v-else-if="field.type === 'sections'"
          :model-value="sectionList(field)"
          :tags="field.tags"
          @update:model-value="studio.setValue(field.id, $event)"
        />

        <p v-if="field.hint" class="text-faint mt-1 text-xs">{{ field.hint }}</p>
      </template>
    </div>
  </div>
</template>
