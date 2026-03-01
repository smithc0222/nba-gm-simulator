<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSeriesStore } from '@/stores/series';
import { useDraftStore } from '@/stores/draft';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Card from 'primevue/card';

const route = useRoute();
const seriesStore = useSeriesStore();
const draftStore = useDraftStore();
const seriesId = parseInt(route.params.id as string);
const selectedGameIdx = ref(0);

onMounted(async () => {
  await seriesStore.fetchSeries(seriesId);
  if (s.value) {
    await draftStore.fetchDraft(s.value.draftId);
  }
});

const s = computed(() => seriesStore.currentSeries);
const games = computed(() => seriesStore.currentGames);
const participants = computed(() => draftStore.currentDraft?.participants || []);

const team1Name = computed(() => {
  if (!s.value) return 'Team 1';
  return participants.value.find((p: any) => p.userId === s.value!.team1UserId)?.displayName || 'Team 1';
});
const team2Name = computed(() => {
  if (!s.value) return 'Team 2';
  return participants.value.find((p: any) => p.userId === s.value!.team2UserId)?.displayName || 'Team 2';
});

const team1Wins = computed(() => games.value.filter((g: any) => g.winnerUserId === s.value?.team1UserId).length);
const team2Wins = computed(() => games.value.filter((g: any) => g.winnerUserId === s.value?.team2UserId).length);

const selectedGame = computed(() => games.value[selectedGameIdx.value]);
</script>

<template>
  <div v-if="s">
    <h2 class="text-2xl font-bold mb-6">Series Result</h2>

    <!-- Scoreboard -->
    <Card class="mb-6">
      <template #content>
        <div class="flex justify-center items-center gap-8 sm:gap-16 py-4">
          <div class="text-center">
            <div class="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-1">{{ team1Name }}</div>
            <div
              class="text-5xl sm:text-6xl font-black"
              :class="s.winnerUserId === s.team1UserId ? 'text-court-orange' : 'text-text-primary'"
            >{{ team1Wins }}</div>
          </div>
          <div class="text-text-muted text-2xl font-bold">vs</div>
          <div class="text-center">
            <div class="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-1">{{ team2Name }}</div>
            <div
              class="text-5xl sm:text-6xl font-black"
              :class="s.winnerUserId === s.team2UserId ? 'text-court-orange' : 'text-text-primary'"
            >{{ team2Wins }}</div>
          </div>
        </div>
        <div class="text-center mt-2">
          <Tag v-if="s.winnerUserId" :value="s.winnerUserId === s.team1UserId ? `${team1Name} Wins!` : `${team2Name} Wins!`" severity="success" />
        </div>
      </template>
    </Card>

    <!-- Game Selector -->
    <div class="mb-6">
      <h3 class="text-lg font-semibold mb-3">Games</h3>
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="(game, idx) in games"
          :key="game.gameNumber"
          class="px-4 py-2 rounded-lg text-sm font-bold border transition-colors cursor-pointer"
          :class="idx === selectedGameIdx
            ? 'bg-court-orange text-white border-court-orange'
            : 'bg-surface-card text-text-primary border-border hover:border-court-orange'"
          @click="selectedGameIdx = idx"
        >
          G{{ game.gameNumber }}: {{ game.team1Score }}-{{ game.team2Score }}
        </button>
      </div>
    </div>

    <!-- Box Score -->
    <div v-if="selectedGame">
      <h3 class="text-lg font-semibold mb-2">
        Game {{ selectedGame.gameNumber }} Box Score
        <span class="text-sm font-normal text-text-muted">
          ({{ selectedGame.team1Score }} - {{ selectedGame.team2Score }})
        </span>
      </h3>

      <Card class="mb-4">
        <template #title>{{ team1Name }}</template>
        <template #content>
          <div class="overflow-x-auto">
            <DataTable :value="(selectedGame.gameLog as any)?.team1Players || []" size="small" stripedRows>
              <Column field="playerName" header="Player" />
              <Column field="position" header="Pos" style="width: 3rem" />
              <Column field="points" header="PTS" style="width: 3rem" />
              <Column field="rebounds" header="REB" style="width: 3rem" />
              <Column field="assists" header="AST" style="width: 3rem" />
              <Column field="steals" header="STL" style="width: 3rem" />
              <Column field="blocks" header="BLK" style="width: 3rem" />
              <Column header="FG" style="width: 5rem">
                <template #body="{ data }">{{ data.fgMade }}/{{ data.fgAttempted }}</template>
              </Column>
              <Column field="minutes" header="MIN" style="width: 3rem" />
            </DataTable>
          </div>
        </template>
      </Card>

      <Card>
        <template #title>{{ team2Name }}</template>
        <template #content>
          <div class="overflow-x-auto">
            <DataTable :value="(selectedGame.gameLog as any)?.team2Players || []" size="small" stripedRows>
              <Column field="playerName" header="Player" />
              <Column field="position" header="Pos" style="width: 3rem" />
              <Column field="points" header="PTS" style="width: 3rem" />
              <Column field="rebounds" header="REB" style="width: 3rem" />
              <Column field="assists" header="AST" style="width: 3rem" />
              <Column field="steals" header="STL" style="width: 3rem" />
              <Column field="blocks" header="BLK" style="width: 3rem" />
              <Column header="FG" style="width: 5rem">
                <template #body="{ data }">{{ data.fgMade }}/{{ data.fgAttempted }}</template>
              </Column>
              <Column field="minutes" header="MIN" style="width: 3rem" />
            </DataTable>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>
