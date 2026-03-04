import { ref } from 'vue';

const isEmbed = ref(false);

export function initEmbed() {
  const params = new URLSearchParams(window.location.search);
  isEmbed.value = params.get('embed') === '1' || window.self !== window.top;
}

export function useEmbed() {
  return { isEmbed };
}
