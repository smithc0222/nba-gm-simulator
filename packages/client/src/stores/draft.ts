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
  const polling = ref<ReturnType<typeof setInterval> | null>(null);

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

  async function pick(draftId: number, playerId: number, position: string) {
    loading.value = true;
    try {
      await api.makeDraftPick(draftId, playerId, position);
      await fetchDraft(draftId);
    } finally {
      loading.value = false;
    }
  }

  function startPolling(draftId: number, intervalMs = 3000) {
    stopPolling();
    polling.value = setInterval(() => fetchDraft(draftId), intervalMs);
  }

  function stopPolling() {
    if (polling.value) {
      clearInterval(polling.value);
      polling.value = null;
    }
  }

  return {
    drafts, currentDraft, playerPool, playerPoolTotal, playerPoolPage, loading,
    fetchDrafts, fetchDraft, create, join, fetchPlayers, pick, startPolling, stopPolling,
  };
});
