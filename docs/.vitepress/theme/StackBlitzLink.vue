<script setup lang="ts">
// "Open in StackBlitz" for the docs' example listings, reusing the
// playground's own seed builder and demo sources, so there is one source
// of truth for what a standalone project contains and which demos qualify.
// The source map carries LOADERS, not text (the playground fetches each
// file's source on demand so its main chunk stays small), so the files are
// loaded here on mount: the server render emits nothing, which also means
// no hydration mismatch, and the button appears once the imports have been
// read and the demo proves self-contained. A demo that is not renders
// nothing at all, mirroring the playground button's gate.
import { computed, onMounted, ref } from "vue";
import {
  DEMO_SOURCES,
  type DemoFile,
  type DemoSourceKey,
  loadDemoFiles,
} from "../../../examples/src/demo/demoSources";
import {
  canOpenInStackBlitz,
  openInStackBlitz,
} from "../../../examples/src/demo/stackblitz";

const props = defineProps<{ demo: DemoSourceKey; title: string }>();

const loaded = ref<readonly DemoFile[] | null>(null);
onMounted(() => {
  void loadDemoFiles(DEMO_SOURCES[props.demo] ?? []).then((files) => {
    loaded.value = files;
  });
});
const files = computed(() => loaded.value ?? []);
const openable = computed(
  () => loaded.value !== null && canOpenInStackBlitz(loaded.value),
);
</script>

<template>
  <button
    v-if="openable"
    class="stackblitz-link"
    type="button"
    @click="openInStackBlitz(props.title, files)"
  >
    ⚡ Open in StackBlitz
  </button>
</template>

<style scoped>
.stackblitz-link {
  display: inline-block;
  margin: 4px 0 8px;
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 13px;
  cursor: pointer;
}
.stackblitz-link:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
</style>
