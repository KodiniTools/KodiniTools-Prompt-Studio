<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { categories } from './categories'
import FieldForm from './components/FieldForm.vue'
import LibraryPanel from './components/LibraryPanel.vue'
import PreviewPane from './components/PreviewPane.vue'
import SavedDrawer from './components/SavedDrawer.vue'
import { notice, notify } from './lib/notice'
import { copyText } from './lib/text'
import { useLibraryStore } from './stores/library'
import { useStudioStore } from './stores/studio'

const studio = useStudioStore()
const library = useLibraryStore()

const drawerOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const saveLabel = computed(() => {
  switch (library.state) {
    case 'loading':
      return 'Lädt …'
    case 'dirty':
    case 'saving':
      return 'Speichert …'
    case 'saved':
      return 'Gespeichert'
    case 'error':
      return 'Nicht gespeichert'
    default:
      return library.loaded ? 'Bereit' : ''
  }
})

async function onImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    await library.importJson(await file.text())
    notify('Import abgeschlossen – vorheriger Stand liegt als Backup auf dem Server', 3200)
  } catch (err) {
    notify(`Import fehlgeschlagen: ${(err as Error).message}`, 5000)
  }
}

async function copyPrimary(): Promise<void> {
  if (studio.primaryText.trim() === '') return
  if (!(await copyText(studio.primaryText))) return
  notify('Prompt kopiert')
  if (library.loaded) library.pushHistory(studio.snapshot())
}

/**
 * Tastenkürzel: Strg+Enter = Turbo, Alt+C = Haupt-Prompt kopieren,
 * Strg+S = Preset benennen, Esc = Seitenleiste schliessen.
 * (Alt+C statt Strg+Shift+C, weil der Browser dieses Kürzel für die Entwicklertools belegt.)
 */
function onKeydown(event: KeyboardEvent): void {
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (key === 'escape') {
    drawerOpen.value = false
  } else if (mod && key === 'enter') {
    event.preventDefault()
    if (studio.aiConfigured) void studio.runTurbo()
  } else if (event.altKey && !mod && key === 'c') {
    event.preventDefault()
    void copyPrimary()
  } else if (mod && !event.shiftKey && key === 's') {
    event.preventDefault()
    document.getElementById('preset-name')?.focus()
  }
}

function onBeforeUnload(): void {
  void library.flush(true)
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
  await Promise.all([library.load(), studio.loadStatus()])
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="border-line bg-panel flex items-center gap-3 border-b px-4 py-2">
      <h1 class="text-[15px] font-semibold tracking-tight">
        Prompt<span class="text-accent">·</span>Studio
      </h1>
      <span
        class="text-xs"
        :class="library.state === 'error' ? 'text-bad' : 'text-faint'"
        aria-live="polite"
      >
        {{ saveLabel }}
      </span>
      <div class="ml-auto flex items-center gap-1.5">
        <button type="button" class="btn" @click="drawerOpen = !drawerOpen">
          Favoriten &amp; Verlauf
        </button>
        <a class="btn no-underline" href="api/store/export" download>Export</a>
        <button type="button" class="btn" @click="fileInput?.click()">Import</button>
        <input
          ref="fileInput"
          class="hidden"
          type="file"
          accept="application/json,.json"
          @change="onImport"
        />
      </div>
    </header>

    <p
      v-if="library.message"
      class="bg-bad/10 text-bad border-line border-b px-4 py-2"
      role="alert"
    >
      {{ library.message }}
      <button v-if="!library.loaded" type="button" class="btn ml-2" @click="library.load()">
        Erneut versuchen
      </button>
    </p>

    <main class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[460px_minmax(0,1fr)]">
      <!-- Links: Kategorie, Parameter, eigene Bausteine -->
      <section class="border-line scroll min-h-0 border-r" aria-label="Parameter">
        <nav class="border-line bg-panel sticky top-0 z-10 border-b p-2" aria-label="Kategorien">
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="category in categories"
              :key="category.id"
              type="button"
              class="chip !rounded-md !px-2.5 !py-1"
              :aria-pressed="studio.categoryId === category.id"
              :title="category.description"
              @click="studio.selectCategory(category.id)"
            >
              {{ category.label }}
            </button>
          </div>
        </nav>

        <div class="space-y-6 p-4">
          <div class="flex items-baseline justify-between gap-3">
            <p class="text-dim text-xs">{{ studio.category.description }}</p>
            <button type="button" class="btn btn-quiet shrink-0" @click="studio.resetCategory()">
              Zurücksetzen
            </button>
          </div>
          <FieldForm />
          <hr class="border-line" />
          <LibraryPanel />
        </div>
      </section>

      <!-- Rechts: Vorschau -->
      <section class="min-h-0" aria-label="Vorschau">
        <PreviewPane />
      </section>
    </main>

    <SavedDrawer v-if="drawerOpen" @close="drawerOpen = false" />

    <div
      v-if="notice"
      class="border-accent bg-raised fixed right-4 bottom-4 z-30 rounded-md border px-3 py-2 shadow-xl"
      role="status"
    >
      {{ notice }}
    </div>
  </div>
</template>
