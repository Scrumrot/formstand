<script setup lang="ts">
// "Open in StackBlitz" for the docs' example listings, reusing the
// playground's own seed builder and demo sources — one source of truth
// for what a standalone project contains and which demos qualify. The
// imports are pure data + a click-time DOM POST, so SSR renders nothing
// stateful. A demo that is not self-contained renders nothing at all,
// mirroring the playground button's gate.
import { computed } from "vue";
import { DEMO_SOURCES, type DemoSourceKey } from "../../../examples/src/demo/demoSources";
import {
  canOpenInStackBlitz,
  openInStackBlitz,
} from "../../../examples/src/demo/stackblitz";

const props = defineProps<{ demo: DemoSourceKey; title: string }>();

const files = computed(() => DEMO_SOURCES[props.demo] ?? []);
const openable = computed(() => canOpenInStackBlitz(files.value));
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
