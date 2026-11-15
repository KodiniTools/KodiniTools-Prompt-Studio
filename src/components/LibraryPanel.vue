<script setup lang="ts">
import { computed, ref } from 'vue'
import { notify } from '../lib/notice'
import { formatDate } from '../lib/text'
import { useLibraryStore } from '../stores/library'
import { useStudioStore } from '../stores/studio'

const studio = useStudioStore()
const library = useLibraryStore()

const presetName = ref('')
const blockLabel = ref('')
const blockText = ref('')
const blockGlobal = ref(false)
const showBlockForm = ref(false)

const presets = computed(() =>
  library.doc.presets.filter((p) => p.categoryId === studio.category.id),
)
const blocks = computed(() =>
  library.doc.blocks.filter((b) => b.categoryId === studio.category.id || b.categoryId === '*'),
)

function savePreset(): void {
  const saved = library.savePreset(studio.category.id, presetName.value, studio.values)
  if (!saved) return
  notify(`Preset „${saved.name}“ gespeichert`)
  presetName.value = ''
}

function addBlock(): void {
  const block = library.addBlock(
    blockGlobal.value ? '*' : studio.category.id,
    blockLabel.value,
    blockText.value,
  )
  if (!block) return
  blockLabel.value = ''
  blockText.value = ''
  showBlockForm.value = false
  notify('Baustein gespeichert')
}

function insert(text: string): void {
  if (!studio.insertBlock(text))
    notify('Erst in ein Textfeld klicken, dann den Baustein wählen', 2600)
}
</script>

<template>
  <div class="space-y-5">
    <section>
      <h3 class="text-dim mb-2 text-xs font-semibold tracking-wider uppercase">Presets</h3>
      <form class="flex gap-1.5" @submit.prevent="savePreset">
        <input
          id="preset-name"
          v-model="presetName"
          class="field"
          type="text"
          maxlength="80"
          placeholder="Aktuelle Einstellungen speichern als …"
          aria-label="Name des Presets"
        />
        <button type="submit" class="btn" :disabled="presetName.trim() === '' || !library.loaded">
          Speichern
        </button>
      </form>
      <ul v-if="presets.length > 0" class="mt-2 space-y-1">
        <li
          v-for="preset in presets"
          :key="preset.id"
          class="border-line flex items-center gap-1 rounded-md border px-2 py-1"
        >
          <button
            type="button"
            class="min-w-0 flex-1 cursor-pointer truncate text-left hover:text-accent"
            :title="`Laden – gespeichert ${formatDate(preset.createdAt)}`"
            @click="studio.applyValues(preset.values)"
          >
            {{ preset.name }}
          </button>
          <button
            type="button"
            class="btn btn-quiet"
            :aria-label="`Preset ${preset.name} löschen`"
            @click="library.deletePreset(preset.id)"
          >
            ×
          </button>
        </li>
      </ul>
      <p v-else class="text-faint mt-2 text-xs">Noch keine Presets für diese Kategorie.</p>
    </section>

    <section>
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-dim text-xs font-semibold tracking-wider uppercase">Meine Bausteine</h3>
        <button type="button" class="btn btn-quiet" @click="showBlockForm = !showBlockForm">
          {{ showBlockForm ? 'Schliessen' : '+ Neu' }}
        </button>
      </div>

      <form
        v-if="showBlockForm"
        class="border-line mb-2 space-y-1.5 rounded-md border p-2"
        @submit.prevent="addBlock"
      >
        <input
          v-model="blockLabel"
          class="field"
          type="text"
          maxlength="60"
          placeholder="Kurzname, z. B. Werkstatt-Licht"
          aria-label="Name des Bausteins"
        />
        <textarea
          v-model="blockText"
          class="field"
          rows="2"
          maxlength="4000"
          placeholder="Text, der eingefügt wird"
          aria-label="Text des Bausteins"
        />
        <div class="flex items-center justify-between">
          <label class="text-dim flex cursor-pointer items-center gap-1.5 text-xs">
            <input v-model="blockGlobal" type="checkbox" /> in allen Kategorien
          </label>
          <button
            type="submit"
            class="btn"
            :disabled="blockLabel.trim() === '' || blockText.trim() === '' || !library.loaded"
          >
            Baustein speichern
          </button>
        </div>
      </form>

      <div v-if="blocks.length > 0" class="flex flex-wrap gap-1.5">
        <span
          v-for="block in blocks"
          :key="block.id"
          class="border-line inline-flex items-center rounded-full border"
        >
          <button
            type="button"
            class="cursor-pointer py-0.5 pr-1 pl-2.5 text-[12.5px] hover:text-accent"
            :title="block.text"
            @mousedown.prevent
            @click="insert(block.text)"
          >
            {{ block.label }}
          </button>
          <button
            type="button"
            class="text-faint hover:text-bad cursor-pointer pr-2 pl-0.5"
            :aria-label="`Baustein ${block.label} löschen`"
            @mousedown.prevent
            @click="library.deleteBlock(block.id)"
          >
            ×
          </button>
        </span>
      </div>
      <p v-else class="text-faint text-xs">
        Bausteine sind eigene Textschnipsel. Ein Klick fügt sie in das zuletzt angeklickte Feld ein.
      </p>
    </section>
  </div>
</template>
