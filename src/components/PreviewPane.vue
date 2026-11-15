<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAX_VARIANTS } from '../../shared/defaults'
import { notify } from '../lib/notice'
import { copyText } from '../lib/text'
import { useLibraryStore } from '../stores/library'
import { useStudioStore } from '../stores/studio'
import OutputCard from './OutputCard.vue'

const studio = useStudioStore()
const library = useLibraryStore()

const variantOptions = [1, 3, MAX_VARIANTS]
const copiedKeywords = ref(false)

const isFavorite = computed(
  () => studio.hasContent && library.findFavorite(studio.snapshot()) !== undefined,
)
const keywordText = computed(() => studio.stock?.keywords.map((k) => k.keyword).join(', ') ?? '')
const showStock = computed(() => studio.stock !== undefined && studio.activeTab.source === 'turbo')

function onCopied(): void {
  if (library.loaded) library.pushHistory(studio.snapshot())
}

function toggleFavorite(): void {
  if (!studio.hasContent) return
  notify(library.toggleFavorite(studio.snapshot()) ? 'Als Favorit gespeichert' : 'Favorit entfernt')
}

async function copyKeywords(): Promise<void> {
  if (!(await copyText(keywordText.value))) return
  copiedKeywords.value = true
  setTimeout(() => (copiedKeywords.value = false), 1400)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Turbo-Leiste -->
    <div
      class="border-line bg-panel flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5"
    >
      <button
        v-if="!studio.busy"
        type="button"
        class="btn btn-accent"
        :disabled="!studio.aiConfigured"
        title="Strg+Enter"
        @click="studio.runTurbo()"
      >
        Mit Claude verfeinern
      </button>
      <button v-else type="button" class="btn" @click="studio.cancelTurbo()">Abbrechen …</button>

      <label class="text-dim flex items-center gap-1.5 text-xs">
        Varianten
        <select
          class="field !w-auto !py-1"
          :value="library.doc.settings.variantCount"
          @change="
            library.updateSettings({
              variantCount: Number(($event.target as HTMLSelectElement).value),
            })
          "
        >
          <option v-for="n in variantOptions" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>

      <label
        v-if="studio.category.stockSeller"
        class="text-dim flex cursor-pointer items-center gap-1.5 text-xs"
      >
        <input v-model="studio.stockSeller" type="checkbox" />
        Stock-Seller: Titel + 25 Keywords
      </label>

      <span class="text-faint ml-auto text-xs">
        <template v-if="studio.busy">Claude arbeitet …</template>
        <template v-else-if="!studio.aiConfigured">Turbo aus – kein API-Key in der .env</template>
        <template v-else-if="studio.turbo && studio.turbo.model">
          {{ studio.turbo.model }} · {{ studio.turbo.usage.inputTokens }} ein /
          {{ studio.turbo.usage.outputTokens }} aus
        </template>
        <template v-else>{{ studio.model }}</template>
      </span>
    </div>

    <p v-if="studio.error" class="bg-bad/10 text-bad border-line border-b px-4 py-2" role="alert">
      {{ studio.error }}
    </p>
    <ul
      v-if="studio.turbo && studio.turbo.warnings.length > 0 && studio.activeTab.source === 'turbo'"
      class="bg-accent-soft text-accent border-line border-b px-4 py-2 text-xs"
    >
      <li v-for="warning in studio.turbo.warnings" :key="warning">{{ warning }}</li>
    </ul>

    <!-- Varianten -->
    <div class="flex items-center gap-1.5 px-4 pt-3">
      <div class="flex flex-wrap gap-1.5" role="tablist" aria-label="Varianten">
        <button
          v-for="tab in studio.tabs"
          :key="tab.key"
          type="button"
          role="tab"
          class="chip"
          :aria-pressed="studio.activeKey === tab.key"
          :aria-selected="studio.activeKey === tab.key"
          :title="tab.title"
          @click="studio.selectVariant(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
      <span class="text-faint min-w-0 flex-1 truncate pl-2 text-xs">{{
        studio.activeTab.title
      }}</span>
      <button
        type="button"
        class="btn"
        :class="{ '!border-accent !text-accent': isFavorite }"
        :disabled="!studio.hasContent || !library.loaded"
        :aria-pressed="isFavorite"
        @click="toggleFavorite"
      >
        {{ isFavorite ? '★ Favorit' : '☆ Favorit' }}
      </button>
    </div>

    <!-- Ausgaben -->
    <div class="scroll flex-1 space-y-3 px-4 py-3">
      <OutputCard
        v-for="spec in studio.outputSpecs"
        :key="spec.key"
        :label="spec.label"
        :text="studio.outputs[spec.key] ?? ''"
        :limit="spec.limit"
        :compact="!spec.primary && studio.outputSpecs.length > 1 && spec.key !== 'lyrics'"
        @copied="onCopied"
      />

      <template v-if="showStock && studio.stock">
        <OutputCard
          label="Stock-Titel"
          :text="studio.stock.title"
          :limit="70"
          compact
          @copied="onCopied"
        />
        <article class="border-line bg-panel rounded-lg border">
          <header class="border-line flex items-center gap-3 border-b px-3 py-1.5">
            <h3 class="text-dim text-xs font-semibold tracking-wider uppercase">
              Keywords ({{ studio.stock.keywords.length }})
            </h3>
            <span class="text-faint ml-auto text-xs"
              >nach Gewicht sortiert – wichtigste zuerst</span
            >
            <button
              type="button"
              class="btn"
              :class="{ 'btn-accent': copiedKeywords }"
              @click="copyKeywords"
            >
              {{ copiedKeywords ? 'Kopiert' : 'Kopieren' }}
            </button>
          </header>
          <ol class="flex list-none flex-wrap gap-1.5 p-3">
            <li
              v-for="keyword in studio.stock.keywords"
              :key="keyword.keyword"
              class="border-line rounded-full border px-2 py-0.5 font-mono text-xs"
              :style="{ opacity: 0.55 + keyword.weight * 0.045 }"
              :title="`Gewicht ${keyword.weight} von 10`"
            >
              {{ keyword.keyword }}
              <span class="text-accent">{{ keyword.weight }}</span>
            </li>
          </ol>
        </article>
      </template>
    </div>
  </div>
</template>
