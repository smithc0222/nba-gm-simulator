import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Draft, DraftPick, PlayerWithStats, DraftCriteria } from '@nba-gm/shared';
import * as api from '@/api';

export const useDraftStore = defineStore('draft', () => {
  const drafts = ref<Draft[]>([]);
  const currentDraft = ref<any>(null);
  const playerPool = ref<PlayerWithStats[]>([]);
  const playerPoolTotal = ref(0);
  const playerPoolPage = ref(1);
  const loading = ref(false);
  const eventSource = ref<EventSource | null>(null);
  const sseReconnectTimer = ref<ReturnType<typeof setTimeout> | null>(null);
  const sseBackoff = ref(1000);
  const sseRetries = ref(0);
  const SSE_MAX_RETRIES = 15;
  const SSE_MAX_BACKOFF = 30000;

  async function fetchDrafts() {
    const res = await api.getDrafts();
    drafts.value = res.data.data;
  }

  async function fetchDraft(id: number) {
    const res = await api.getDraft(id);
    currentDraft.value = res.data.data;
  }

  async function create(name: string, criteria: DraftCriteria, mode?: 'online' | 'local', team2Name?: string) {
    loading.value = true;
    try {
      const res = await api.createDraft(name, criteria, mode, team2Name);
      return res.data.data;
    } finally {
      loading.value = false;
    }
  }

  async function join(shareCode: string) {
    const res = await api.joinDraft(shareCode);
    return res.data.data;
  }

  async function fetchPlayers(draftId: number, params?: Record<string, any>) {
    const res = await api.getDraftPlayers(draftId, params);
    playerPool.value = res.data.data;
    playerPoolTotal.value = res.data.total;
    playerPoolPage.value = res.data.page;
  }

  async function callCoinToss(draftId: number, call: 'heads' | 'tails') {
    const res = await api.callCoinToss(draftId, call);
    return res.data.data;
  }

  async function deleteDraft(id: number) {
    await api.deleteDraft(id);
    drafts.value = drafts.value.filter(d => d.id !== id);
  }

  async function pick(draftId: number, playerId: number, position: string) {
    loading.value = true;
    try {
      await api.makeDraftPick(draftId, playerId, position);
      await fetchDraft(draftId);
    } finally {
      loading.value = false;
    }
  }

  function connectSSE(draftId: number) {
    disconnectSSE();

    function createConnection() {
      const es = new EventSource(`/api/drafts/${draftId}/events`);

      es.addEventListener('state', (e) => {
        try {
          const parsed = JSON.parse(e.data);
          currentDraft.value = parsed.data;
          // Reset backoff on successful message
          sseBackoff.value = 1000;
          sseRetries.value = 0;
        } catch {
          // ignore malformed messages
        }
      });

      es.onerror = () => {
        es.close();
        eventSource.value = null;

        if (sseRetries.value >= SSE_MAX_RETRIES) {
          console.warn('SSE: max retries reached, giving up');
          return;
        }

        sseRetries.value++;
        const delay = sseBackoff.value;
        sseBackoff.value = Math.min(sseBackoff.value * 2, SSE_MAX_BACKOFF);

        sseReconnectTimer.value = setTimeout(() => {
          createConnection();
        }, delay);
      };

      eventSource.value = es;
    }

    createConnection();
  }

  function disconnectSSE() {
    if (sseReconnectTimer.value) {
      clearTimeout(sseReconnectTimer.value);
      sseReconnectTimer.value = null;
    }
    sseBackoff.value = 1000;
    sseRetries.value = 0;
    if (eventSource.value) {
      eventSource.value.close();
      eventSource.value = null;
    }
  }

  return {
    drafts, currentDraft, playerPool, playerPoolTotal, playerPoolPage, loading,
    fetchDrafts, fetchDraft, create, join, deleteDraft, fetchPlayers, callCoinToss, pick, connectSSE, disconnectSSE,
  };
});
