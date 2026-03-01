<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDraftStore } from '@/stores/draft';
import { useAuthStore } from '@/stores/auth';
import { useSeriesStore } from '@/stores/series';
import { POSITIONS, getPickOrder } from '@nba-gm/shared';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';

const route = useRoute();
const router = useRouter();
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
  await draftStore.fetchPlayers(draftId);
  if (draft.value?.status === 'drafting' && !isLocal.value) {
    draftStore.startPolling(draftId);
  }
});

onUnmounted(() => draftStore.stopPolling());

async function searchPlayers() {
  await draftStore.fetchPlayers(draftId, {
    search: search.value || undefined,
    position: selectedPosition.value || undefined,
  });
}

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
    await draftStore.fetchPlayers(draftId);
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

function copyShareLink() {
  navigator.clipboard.writeText(shareUrl.value);
}
</script>

<template>
  <div v-if="draft">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row justify-between items-start gap-4 mb-6">
      <div class="flex items-center gap-3 flex-wrap">
        <h2 class="text-2xl font-bold">{{ draft.name }}</h2>
        <Tag :value="draft.status" :severity="draft.status === 'complete' ? 'success' : draft.status === 'drafting' ? 'info' : 'warn'" />
      </div>
      <div class="flex gap-2 w-full lg:w-auto">
        <div v-if="draft.status === 'waiting' && !isLocal" class="flex gap-2 items-center w-full lg:w-auto">
          <InputText :modelValue="shareUrl" readonly class="flex-1 lg:w-80 text-xs font-mono" />
          <Button icon="pi pi-copy" severity="secondary" size="small" @click="copyShareLink" />
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

    <!-- Turn Indicator -->
    <div v-if="draft.status === 'drafting' && canPick" class="mb-4 px-4 py-3 bg-court-orange/10 border border-court-orange/30 rounded-lg">
      <Message severity="info" class="m-0">
        <template v-if="isLocal">{{ currentPickingTeamName }}'s turn — Pick #{{ currentTurn?.pickNumber }}</template>
        <template v-else>It's your turn! Pick #{{ currentTurn?.pickNumber }}</template>
      </Message>
    </div>

    <!-- Draft Picks -->
    <div class="mb-6">
      <h3 class="text-lg font-semibold mb-2">Draft Picks</h3>
      <div class="overflow-x-auto">
        <DataTable :value="picks" stripedRows size="small">
          <Column field="pickNumber" header="#" style="width: 3rem" />
          <Column header="Team">
            <template #body="{ data }">
              {{ participants.find((p: any) => p.userId === data.userId)?.displayName }}
            </template>
          </Column>
          <Column field="playerName" header="Player" />
          <Column field="assignedPosition" header="Position" />
        </DataTable>
      </div>
    </div>

    <!-- Player Pool (visible during drafting) -->
    <div v-if="draft.status === 'drafting'">
      <h3 class="text-lg font-semibold mb-2">Available Players</h3>
      <div class="flex flex-col sm:flex-row gap-2 mb-4">
        <InputText v-model="search" placeholder="Search players..." @keyup.enter="searchPlayers" class="flex-1" />
        <div class="flex gap-2">
          <Select v-model="selectedPosition" :options="['', ...POSITIONS]" placeholder="Position" @change="searchPlayers" />
          <Button icon="pi pi-search" @click="searchPlayers" />
        </div>
      </div>

      <div class="overflow-x-auto">
        <DataTable :value="draftStore.playerPool" stripedRows size="small">
          <Column field="name" header="Player" />
          <Column field="primaryPosition" header="Pos" style="width: 4rem" />
          <Column header="PPG">
            <template #body="{ data }">{{ data.careerStats.ppg.toFixed(1) }}</template>
          </Column>
          <Column header="RPG">
            <template #body="{ data }">{{ data.careerStats.rpg.toFixed(1) }}</template>
          </Column>
          <Column header="APG">
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
</template>
