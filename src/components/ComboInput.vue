<script setup lang="ts">
import { ref } from 'vue'

/**
 * Freitextfeld mit aufklappbarer Vorschlagsliste.
 * Anders als <datalist> zeigt die Liste immer alle Optionen – auch wenn schon ein Wert steht.
 */
defineProps<{
  id: string
  modelValue: string
  options: readonly string[]
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focus: []
}>()

const open = ref(false)

function pick(option: string): void {
  emit('update:modelValue', option)
  open.value = false
}
</script>

<template>
  <div class="relative" @keydown.esc="open = false">
    <input
      :id="id"
      class="field !pr-8"
      type="text"
      autocomplete="off"
      role="combobox"
      :aria-expanded="open"
      :aria-controls="`${id}-list`"
      :value="modelValue"
      :placeholder="placeholder ?? 'wählen oder eintippen'"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @focus="emit('focus')"
      @blur="open = false"
      @keydown.down.prevent="open = true"
    />
    <button
      type="button"
      class="text-dim hover:text-fg absolute top-0 right-0 h-full cursor-pointer px-2.5"
      tabindex="-1"
      aria-label="Vorschläge anzeigen"
      @mousedown.prevent
      @click="open = !open"
    >
      ▾
    </button>
    <ul
      v-if="open"
      :id="`${id}-list`"
      class="border-line bg-raised scroll absolute z-20 mt-1 max-h-60 w-full min-w-56 rounded-md border py-1 shadow-xl"
      role="listbox"
    >
      <li
        v-for="option in options"
        :key="option"
        role="option"
        :aria-selected="option === modelValue"
      >
        <button
          type="button"
          class="hover:bg-accent-soft w-full cursor-pointer px-2.5 py-1 text-left"
          :class="option === modelValue ? 'text-accent' : 'text-fg'"
          tabindex="-1"
          @mousedown.prevent
          @click="pick(option)"
        >
          {{ option }}
        </button>
      </li>
    </ul>
  </div>
</template>
