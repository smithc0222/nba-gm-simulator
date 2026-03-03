<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDraftStore } from '@/stores/draft';
import { useAuthStore } from '@/stores/auth';
import { useSeriesStore } from '@/stores/series';
import * as api from '@/api';
import { POSITIONS, getPickOrder } from '@nba-gm/shared';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const draftStore = useDraftStore();
const auth = useAuthStore();
const seriesStore = useSeriesStore();

const draftId = parseInt(route.params.id as string);
const search = ref('');
const selectedPosition = ref('');
const showPickDialog = ref(false);
const selectedPlayer = ref<any>(null);
const pickPosition = ref('');
const error = ref('');
const sortField = ref('name');
const sortOrder = ref<1 | -1>(1);
const page = ref(1);
let searchDebounce: ReturnType<typeof setTimeout> | undefined;

// Coin toss state
const coinTossFlipping = ref(false);
const coinTossResult = ref<{ call: string; result: string; creatorWon: boolean } | null>(null);
const coinTossShowResult = ref(false);
const isCreator = computed(() => draft.value?.createdBy === auth.user?.id);

const draft = computed(() => draftStore.currentDraft?.draft);
const participants = computed(() => draftStore.currentDraft?.participants || []);
const picks = computed(() => draftStore.currentDraft?.picks || []);
const currentTurn = computed(() => draftStore.currentDraft?.currentTurn);
const isLocal = computed(() => draft.value?.mode === 'local');
const isMyTurn = computed(() => currentTurn.value?.userId === auth.user?.id);
const canPick = computed(() => {
  if (draft.value?.status !== 'drafting') return false;
  return isLocal.value ? true : isMyTurn.value;
});

const currentPickingTeamName = computed(() => {
  if (!currentTurn.value) return '';
  const p = participants.value.find((p: any) => p.userId === currentTurn.value!.userId);
  return p?.displayName || '';
});

const filledPositions = computed(() => {
  if (!currentTurn.value) return [];
  if (isLocal.value) {
    // For local mode, show positions filled by the currently picking team
    const pickOrder = getPickOrder(draft.value!.currentPickNumber);
    const teamUserId = participants.value.find((p: any) => p.pickOrder === pickOrder)?.userId;
    return picks.value
      .filter((p: any) => p.userId === teamUserId)
      .map((p: any) => p.assignedPosition);
  }
  return picks.value
    .filter((p: any) => p.userId === auth.user?.id)
    .map((p: any) => p.assignedPosition);
});

const availablePositions = computed(() =>
  POSITIONS.filter(p => !filledPositions.value.includes(p))
);

const shareUrl = computed(() => {
  if (!draft.value) return '';
  return `${window.location.origin}/join/${draft.value.shareCode}`;
});

onMounted(async () => {
  await draftStore.fetchDraft(draftId);
  try {
    await loadPlayers();
  } catch (e: any) {
    error.value = 'Failed to load player pool. Please refresh the page.';
  }
  if (!isLocal.value && draft.value?.status !== 'complete') {
    draftStore.connectSSE(draftId);
  }
});

onUnmounted(() => draftStore.disconnectSSE());

async function loadPlayers() {
  await draftStore.fetchPlayers(draftId, {
    search: search.value || undefined,
    position: selectedPosition.value || undefined,
    page: page.value,
    sortBy: sortField.value,
    sortOrder: sortOrder.value === 1 ? 'asc' : 'desc',
  });
}

function onPositionChange() {
  page.value = 1;
  loadPlayers();
}

function onSort(event: { sortField: string | ((item: any) => string) | undefined; sortOrder: 1 | -1 | 0 | null | undefined }) {
  sortField.value = (event.sortField as string) || 'name';
  sortOrder.value = (event.sortOrder === -1 ? -1 : 1);
  page.value = 1;
  loadPlayers();
}

function onPage(event: { first: number; rows: number }) {
  page.value = Math.floor(event.first / event.rows) + 1;
  loadPlayers();
}

watch(search, () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    page.value = 1;
    loadPlayers();
  }, 300);
});

// When the draft transitions to complete, redirect to series page
watch(() => draft.value?.status, async (status) => {
  if (status === 'complete') {
    try {
      const res = await api.getDraftSeries(draftId);
      const seriesList = res.data.data;
      if (seriesList.length > 0) {
        draftStore.disconnectSSE();
        router.push(`/series/${seriesList[0].id}`);
      }
    } catch {
      // Series not created yet, polling will retry
    }
  }
});

function openPickDialog(player: any) {
  selectedPlayer.value = player;
  pickPosition.value = availablePositions.value[0] || '';
  showPickDialog.value = true;
}

async function confirmPick() {
  if (!selectedPlayer.value || !pickPosition.value) return;
  error.value = '';
  try {
    await draftStore.pick(draftId, selectedPlayer.value.id, pickPosition.value);
    showPickDialog.value = false;
    await loadPlayers();
  } catch (e: any) {
    error.value = e.response?.data?.message || 'Failed to make pick';
  }
}

async function handleSimulate() {
  try {
    const result = await seriesStore.simulate(draftId);
    router.push(`/series/${result.series.id}`);
  } catch (e: any) {
    error.value = e.response?.data?.message || 'Failed to simulate';
  }
}

function getSlotPick(userId: number, position: string) {
  return picks.value.find((p: any) => p.userId === userId && p.assignedPosition === position) || null;
}

async function handleCoinToss(call: 'heads' | 'tails') {
  coinTossFlipping.value = true;
  try {
    const result = await draftStore.callCoinToss(draftId, call);
    coinTossResult.value = result;
    // Wait for flip animation to complete
    setTimeout(async () => {
      coinTossShowResult.value = true;
      // After showing result, transition to drafting
      setTimeout(async () => {
        await draftStore.fetchDraft(draftId);
        await loadPlayers();
        coinTossFlipping.value = false;
        coinTossShowResult.value = false;
        coinTossResult.value = null;
      }, 2000);
    }, 1500);
  } catch (e: any) {
    error.value = e.response?.data?.message || 'Failed to call coin toss';
    coinTossFlipping.value = false;
  }
}

function copyShareLink() {
  navigator.clipboard.writeText(shareUrl.value);
  toast.add({ severity: 'success', summary: 'Link copied!', life: 2000 });
}

const hasActiveFilters = computed(() => !!search.value || !!selectedPosition.value);

function clearFilters() {
  search.value = '';
  selectedPosition.value = '';
  page.value = 1;
  loadPlayers();
}
</script>

<template>
  <div v-if="draft">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row justify-between items-start gap-4 mb-6">
      <div class="flex items-center gap-3 flex-wrap">
        <h2 class="text-2xl font-bold">{{ draft.name }}</h2>
        <Tag :value="draft.status === 'coin_toss' ? 'coin toss' : draft.status" :severity="draft.status === 'complete' ? 'success' : draft.status === 'drafting' ? 'info' : 'warn'" />
      </div>
      <div class="flex gap-2 w-full lg:w-auto">
        <div v-if="draft.status === 'waiting' && !isLocal" class="flex flex-col gap-1 w-full lg:w-auto">
          <label class="text-xs font-semibold uppercase tracking-wide text-text-secondary">Share with your opponent</label>
          <div class="flex gap-2 items-center">
            <InputText :modelValue="shareUrl" readonly class="flex-1 lg:w-80 text-xs font-mono" />
            <Button icon="pi pi-copy" severity="secondary" size="small" v-tooltip.top="'Copy link'" @click="copyShareLink" />
          </div>
          <p class="text-xs text-text-muted m-0">They'll join automatically when they open this link.</p>
        </div>
        <Button v-if="draft.status === 'complete'" label="Simulate Series" icon="pi pi-play" @click="handleSimulate" :loading="seriesStore.loading" />
      </div>
    </div>

    <Message v-if="error" severity="error" class="mb-4">{{ error }}</Message>

    <!-- Participants -->
    <div class="mb-6">
      <h3 class="text-lg font-semibold mb-3">Participants</h3>
      <div class="flex gap-3 flex-wrap">
        <div
          v-for="p in participants"
          :key="p.userId"
          class="flex items-center gap-2 px-4 py-2 bg-surface-card rounded-lg border border-border"
          :class="{ 'ring-2 ring-court-orange': currentTurn?.userId === p.userId }"
        >
          <Tag :value="`#${p.pickOrder}`" severity="secondary" />
          <span class="font-semibold">{{ p.displayName }}</span>
          <Tag v-if="currentTurn?.userId === p.userId" value="Picking..." severity="warn" />
        </div>
        <div
          v-if="participants.length < 2"
          class="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-border text-text-muted"
        >
          <i class="pi pi-user-plus"></i>
          Waiting for opponent...
        </div>
      </div>
    </div>

    <!-- Coin Toss Phase -->
    <div v-if="draft.status === 'coin_toss' || coinTossFlipping" class="mb-6">
      <div class="flex flex-col items-center gap-6 py-12">
        <!-- Coin animation -->
        <div class="coin-container" :class="{ flipping: coinTossFlipping && !coinTossShowResult }">
          <div class="coin" :class="coinTossShowResult && coinTossResult ? (coinTossResult.result === 'tails' ? 'show-tails' : '') : ''">
            <div class="coin-face coin-heads">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="38" fill="#F59E0B" stroke="#D97706" stroke-width="3"/>
                <text x="40" y="46" text-anchor="middle" font-size="20" font-weight="bold" fill="#78350F">H</text>
              </svg>
            </div>
            <div class="coin-face coin-tails">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="38" fill="#3B82F6" stroke="#2563EB" stroke-width="3"/>
                <text x="40" y="46" text-anchor="middle" font-size="20" font-weight="bold" fill="#EFF6FF">T</text>
              </svg>
            </div>
          </div>
        </div>

        <!-- Result display -->
        <div v-if="coinTossShowResult && coinTossResult" class="text-center coin-result-reveal">
          <div class="text-2xl font-black mb-2">
            {{ coinTossResult.result === 'heads' ? 'Heads' : 'Tails' }}!
          </div>
          <div class="text-lg text-text-secondary">
            {{ coinTossResult.creatorWon ? 'You won the toss — you pick first!' : 'You lost the toss — opponent picks first.' }}
          </div>
        </div>

        <!-- Call buttons (creator only, not yet flipping) -->
        <template v-if="!coinTossFlipping">
          <div v-if="isCreator || isLocal" class="text-center">
            <h3 class="text-xl font-bold mb-4">Call the Coin Toss</h3>
            <p class="text-text-secondary mb-6">Winner picks first in the draft</p>
            <div class="flex gap-4 justify-center">
              <Button label="Heads" icon="pi pi-circle" class="px-6 py-3 text-lg" severity="warn" @click="handleCoinToss('heads')" />
              <Button label="Tails" icon="pi pi-circle-fill" class="px-6 py-3 text-lg" severity="info" @click="handleCoinToss('tails')" />
            </div>
          </div>
          <div v-else class="text-center">
            <h3 class="text-xl font-bold mb-2">Coin Toss</h3>
            <p class="text-text-muted animate-pulse">Waiting for opponent to call the toss...</p>
          </div>
        </template>
      </div>
    </div>

    <!-- Turn Indicator -->
    <div v-if="draft.status === 'drafting' && canPick" class="mb-4 px-4 py-3 bg-court-orange/10 border border-court-orange/30 rounded-lg">
      <Message severity="info" class="m-0">
        <template v-if="isLocal">{{ currentPickingTeamName }}'s turn — Pick #{{ currentTurn?.pickNumber }}</template>
        <template v-else>It's your turn! Pick #{{ currentTurn?.pickNumber }}</template>
      </Message>
    </div>

    <!-- Draft Picks — Position Slot Cards -->
    <div class="mb-6">
      <h3 class="text-lg font-semibold mb-2">Draft Picks</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          v-for="p in participants"
          :key="p.userId"
          class="rounded-lg border border-border p-4"
          :class="{ 'ring-2 ring-court-orange': draft?.status === 'drafting' && currentTurn?.userId === p.userId }"
        >
          <div class="text-sm font-bold mb-3 uppercase tracking-wide text-text-secondary">{{ p.displayName }}</div>
          <div class="flex flex-col gap-2">
            <div
              v-for="pos in POSITIONS"
              :key="pos"
              class="flex items-center gap-3 px-3 py-2 rounded-md text-sm"
              :class="getSlotPick(p.userId, pos)
                ? 'bg-court-orange/15 border border-court-orange/40'
                : 'border-2 border-dashed border-border text-text-muted'"
            >
              <span class="font-bold w-8">{{ pos }}</span>
              <span v-if="getSlotPick(p.userId, pos)" class="font-semibold text-text-primary">
                {{ getSlotPick(p.userId, pos)!.playerName }}
              </span>
              <span v-else class="italic">—</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Player Pool (visible during drafting) -->
    <div v-if="draft.status === 'drafting'">
      <h3 class="text-lg font-semibold mb-2">Available Players</h3>
      <div class="flex flex-col sm:flex-row gap-2 mb-4">
        <InputText v-model="search" placeholder="Search players..." class="flex-1" />
        <Select v-model="selectedPosition" :options="[{ label: 'All Positions', value: '' }, ...POSITIONS.map(p => ({ label: p, value: p }))]" optionLabel="label" optionValue="value" placeholder="Position" @change="onPositionChange" />
      </div>

      <div class="overflow-x-auto">
        <DataTable
          :value="draftStore.playerPool"
          stripedRows
          size="small"
          lazy
          sortMode="single"
          :sortField="sortField"
          :sortOrder="sortOrder"
          @sort="onSort"
          paginator
          :rows="25"
          :totalRecords="draftStore.playerPoolTotal"
          :first="(page - 1) * 25"
          @page="onPage"
        >
          <Column field="name" header="Player" sortable />
          <Column field="primaryPosition" header="Pos" sortable style="width: 4rem" />
          <Column header="PPG" sortable sortField="ppg">
            <template #body="{ data }">{{ data.careerStats.ppg.toFixed(1) }}</template>
          </Column>
          <Column header="RPG" sortable sortField="rpg">
            <template #body="{ data }">{{ data.careerStats.rpg.toFixed(1) }}</template>
          </Column>
          <Column header="APG" sortable sortField="apg">
            <template #body="{ data }">{{ data.careerStats.apg.toFixed(1) }}</template>
          </Column>
          <Column header="Years">
            <template #body="{ data }">{{ data.careerStartYear }}-{{ data.careerEndYear }}</template>
          </Column>
          <Column header="" style="width: 6rem" v-if="canPick">
            <template #body="{ data }">
              <Button label="Draft" size="small" @click="openPickDialog(data)" />
            </template>
          </Column>
        </DataTable>
      </div>
      <div v-if="draftStore.playerPool.length === 0 && hasActiveFilters" class="text-center py-8">
        <i class="pi pi-search text-4xl text-text-muted mb-3"></i>
        <p class="text-text-secondary font-semibold mb-2">No players match your filters</p>
        <Button label="Clear filters" severity="secondary" size="small" @click="clearFilters" />
      </div>
    </div>

    <!-- Pick Dialog -->
    <Dialog v-model:visible="showPickDialog" header="Assign Position" modal :style="{ width: '24rem' }">
      <div v-if="selectedPlayer" class="flex flex-col gap-4">
        <p class="font-semibold">{{ selectedPlayer.name }}</p>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold text-text-secondary">Position</label>
          <Select v-model="pickPosition" :options="availablePositions" placeholder="Select position" />
        </div>
        <Button label="Confirm Pick" @click="confirmPick" :disabled="!pickPosition" />
      </div>
    </Dialog>
  </div>
  <div v-else class="flex flex-col gap-6">
    <div class="h-8 w-64 bg-surface-card rounded animate-pulse"></div>
    <div class="flex gap-3">
      <div class="h-12 w-40 bg-surface-card rounded-lg animate-pulse"></div>
      <div class="h-12 w-40 bg-surface-card rounded-lg animate-pulse"></div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="h-48 bg-surface-card rounded-lg animate-pulse"></div>
      <div class="h-48 bg-surface-card rounded-lg animate-pulse"></div>
    </div>
  </div>
</template>

<style scoped>
.coin-container {
  perspective: 400px;
  width: 80px;
  height: 80px;
}

.coin {
  width: 80px;
  height: 80px;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.3s ease-out;
}

.coin-face {
  position: absolute;
  width: 80px;
  height: 80px;
  backface-visibility: hidden;
}

.coin-tails {
  transform: rotateY(180deg);
}

.coin.show-tails {
  transform: rotateY(180deg);
}

.coin-container.flipping .coin {
  animation: coinFlip 1.5s ease-in-out;
}

@keyframes coinFlip {
  0% { transform: rotateY(0deg) translateY(0); }
  25% { transform: rotateY(900deg) translateY(-60px); }
  50% { transform: rotateY(1800deg) translateY(-80px); }
  75% { transform: rotateY(2520deg) translateY(-30px); }
  100% { transform: rotateY(3240deg) translateY(0); }
}

.coin-result-reveal {
  animation: fadeSlideUp 0.4s ease-out;
}

@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
