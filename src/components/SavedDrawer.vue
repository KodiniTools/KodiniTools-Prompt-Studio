<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SavedPrompt } from '../../shared/schema'
import { getCategory } from '../categories'
import { notify } from '../lib/notice'
import { copyText, formatDate } from '../lib/text'
import { useLibraryStore } from '../stores/library'
import { useStudioStore } from '../stores/studio'

defineEmits<{ close: [] }>()

const studio = useStudioStore()
const library = useLibraryStore()

const tab = ref<'favorites' | 'history'>('favorites')
const query = ref('')
const confirmClear = ref(false)

const entries = computed(() => {
  const source = tab.value === 'favorites' ? library.doc.favorites : library.doc.history
  const q = query.value.trim().toLowerCase()
  if (q === '') return source
  return source.filter((e) =>
    Object.values(e.outputs).some((text) => text.toLowerCase().includes(q)),
  )
})

function categoryLabel(entry: SavedPrompt): string {
  return getCategory(entry.categoryId)?.label ?? entry.categoryId
}

function mainText(entry: SavedPrompt): string {
  const category = getCategory(entry.categoryId)
  const key = category?.outputs.find((o) => o.primary)?.key ?? category?.outputs[0]?.key
  return (key ? entry.outputs[key] : undefined) ?? Object.values(entry.outputs)[0] ?? ''
}

async function copy(entry: SavedPrompt): Promise<void> {
  if (await copyText(mainText(entry))) notify('Kopiert')
}

function clearHistory(): void {
  if (!confirmClear.value) {
    confirmClear.value = true
    setTimeout(() => (confirmClear.value = false), 4000)
    return
  }
  library.clearHistory()
  confirmClear.value = false
}
</script>

<template>
  <aside
    class="border-line bg-panel fixed top-0 right-0 z-20 flex h-full w-[min(520px,100vw)] flex-col border-l shadow-2xl"
    aria-label="Favoriten und Verlauf"
  >
    <header class="border-line flex items-center gap-2 border-b px-4 py-2.5">
      <button
        type="button"
        class="chip"
        :aria-pressed="tab === 'favorites'"
        @click="tab = 'favorites'"
      >
        Favoriten ({{ library.doc.favorites.length }})
      </button>
      <button type="button" class="chip" :aria-pressed="tab === 'history'" @click="tab = 'history'">
        Verlauf ({{ library.doc.history.length }})
      </button>
      <button type="button" class="btn btn-quiet ml-auto" @click="$emit('close')">
        Schliessen
      </button>
    </header>

    <div class="flex gap-2 px-4 py-2.5">
      <input
        v-model="query"
        class="field"
        type="search"
        placeholder="Suchen …"
        aria-label="Suchen"
      />
      <button
        v-if="tab === 'history' && library.doc.history.length > 0"
        type="button"
        class="btn"
        :class="{ '!border-bad !text-bad': confirmClear }"
        @click="clearHistory"
      >
        {{ confirmClear ? 'Wirklich leeren?' : 'Leeren' }}
      </button>
    </div>

    <ul class="scroll flex-1 space-y-2 px-4 pb-4">
      <li v-for="entry in entries" :key="entry.id" class="border-line rounded-md border p-2.5">
        <div class="text-faint mb-1 flex items-center gap-2 text-xs">
          <span class="text-accent">{{ categoryLabel(entry) }}</span>
          <span>{{
            entry.source === 'turbo' ? 'Turbo' : entry.source === 'batch' ? 'Batch' : 'Sofort'
          }}</span>
          <span class="ml-auto">{{ formatDate(entry.createdAt) }}</span>
        </div>
        <p class="line-clamp-3 font-mono text-xs break-words whitespace-pre-wrap">
          {{ mainText(entry) }}
        </p>
        <div class="mt-2 flex gap-1.5">
          <button type="button" class="btn" @click="(studio.restore(entry), $emit('close'))">
            Laden
          </button>
          <button type="button" class="btn" @click="copy(entry)">Kopieren</button>
          <button
            v-if="tab === 'favorites'"
            type="button"
            class="btn btn-quiet ml-auto"
            @click="library.removeFavorite(entry.id)"
          >
            Entfernen
          </button>
        </div>
      </li>
      <li v-if="entries.length === 0" class="text-faint py-6 text-center text-xs">
        {{
          query
            ? 'Keine Treffer.'
            : tab === 'favorites'
              ? 'Noch keine Favoriten. Der Stern in der Vorschau speichert den aktuellen Prompt.'
              : 'Der Verlauf füllt sich beim Kopieren und bei jedem Turbo-Lauf.'
        }}
      </li>
    </ul>
  </aside>
</template>
