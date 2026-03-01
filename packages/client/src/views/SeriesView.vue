<script setup lang="ts">
import { onMounted, ref, computed, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useSeriesStore } from '@/stores/series';
import { useDraftStore } from '@/stores/draft';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Card from 'primevue/card';
import { SERIES_WINS_NEEDED } from '@nba-gm/shared';

const route = useRoute();
const seriesStore = useSeriesStore();
const draftStore = useDraftStore();
const seriesId = parseInt(route.params.id as string);

const revealedCount = ref(0);
const playingGameIdx = ref(-1); // index of game currently "playing" (showing animation)
const seriesComplete = ref(false);
const selectedGameIdx = ref<number | null>(null);
const revealStarted = ref(false);

onMounted(async () => {
  await seriesStore.fetchSeries(seriesId);
  if (s.value) {
    await draftStore.fetchDraft(s.value.draftId);
    await nextTick();
    startReveal();
  }
});

const s = computed(() => seriesStore.currentSeries);
const allGames = computed(() => seriesStore.currentGames);
const participants = computed(() => draftStore.currentDraft?.participants || []);

const team1Name = computed(() => {
  if (!s.value) return 'Team 1';
  return participants.value.find((p: any) => p.userId === s.value!.team1UserId)?.displayName || 'Team 1';
});
const team2Name = computed(() => {
  if (!s.value) return 'Team 2';
  return participants.value.find((p: any) => p.userId === s.value!.team2UserId)?.displayName || 'Team 2';
});

const revealedGames = computed(() => allGames.value.slice(0, revealedCount.value));

const team1Wins = computed(() =>
  revealedGames.value.filter((g: any) => g.winnerUserId === s.value?.team1UserId).length
);
const team2Wins = computed(() =>
  revealedGames.value.filter((g: any) => g.winnerUserId === s.value?.team2UserId).length
);

const winnerName = computed(() => {
  if (!seriesComplete.value || !s.value) return '';
  return s.value.winnerUserId === s.value.team1UserId ? team1Name.value : team2Name.value;
});

const selectedGame = computed(() => {
  if (selectedGameIdx.value === null) return null;
  return revealedGames.value[selectedGameIdx.value] || null;
});

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startReveal() {
  if (revealStarted.value) return;
  revealStarted.value = true;

  for (let i = 0; i < allGames.value.length; i++) {
    // Check if a team already won
    const t1w = allGames.value.slice(0, i).filter((g: any) => g.winnerUserId === s.value?.team1UserId).length;
    const t2w = allGames.value.slice(0, i).filter((g: any) => g.winnerUserId === s.value?.team2UserId).length;
    if (t1w >= SERIES_WINS_NEEDED || t2w >= SERIES_WINS_NEEDED) break;

    // Show "playing" animation
    playingGameIdx.value = i;
    await sleep(2500);

    // Reveal the game score
    playingGameIdx.value = -1;
    revealedCount.value = i + 1;

    // Brief pause before next game
    await sleep(1000);
  }

  seriesComplete.value = true;
  selectedGameIdx.value = 0;
}
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
              class="text-5xl sm:text-6xl font-black transition-all duration-500"
              :class="seriesComplete && s.winnerUserId === s.team1UserId ? 'text-court-orange scale-110' : 'text-text-primary'"
            >{{ team1Wins }}</div>
          </div>
          <div class="text-text-muted text-2xl font-bold">vs</div>
          <div class="text-center">
            <div class="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-1">{{ team2Name }}</div>
            <div
              class="text-5xl sm:text-6xl font-black transition-all duration-500"
              :class="seriesComplete && s.winnerUserId === s.team2UserId ? 'text-court-orange scale-110' : 'text-text-primary'"
            >{{ team2Wins }}</div>
          </div>
        </div>
        <!-- Winner banner -->
        <div v-if="seriesComplete" class="text-center mt-2">
          <div class="series-winner-banner inline-block px-6 py-2 rounded-full bg-court-orange text-white font-black text-lg tracking-wide">
            {{ winnerName }} Wins!
          </div>
        </div>
      </template>
    </Card>

    <!-- Playing animation -->
    <div v-if="playingGameIdx >= 0" class="mb-6 flex flex-col items-center gap-3 py-8">
      <div class="text-lg font-bold text-text-secondary">Game {{ playingGameIdx + 1 }}</div>
      <div class="playing-ball">
        <svg width="48" height="48" viewBox="0 0 48 48" class="text-court-orange">
          <circle cx="24" cy="24" r="22" fill="currentColor" opacity="0.9" />
          <path d="M4 24 C4 24 24 20 44 24" stroke="white" stroke-width="2" fill="none" />
          <path d="M24 2 C24 2 20 24 24 46" stroke="white" stroke-width="2" fill="none" />
          <path d="M8 8 C16 16 32 32 40 40" stroke="white" stroke-width="1.5" fill="none" />
          <path d="M40 8 C32 16 16 32 8 40" stroke="white" stroke-width="1.5" fill="none" />
        </svg>
      </div>
      <div class="text-sm text-text-muted animate-pulse">Simulating...</div>
    </div>

    <!-- Game Selector (revealed games only) -->
    <div v-if="revealedGames.length > 0" class="mb-6">
      <h3 class="text-lg font-semibold mb-3">Games</h3>
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="(game, idx) in revealedGames"
          :key="game.gameNumber"
          class="px-4 py-2 rounded-lg text-sm font-bold border transition-all duration-300 cursor-pointer game-reveal"
          :class="seriesComplete && idx === selectedGameIdx
            ? 'bg-court-orange text-white border-court-orange'
            : 'bg-surface-card text-text-primary border-border hover:border-court-orange'"
          :disabled="!seriesComplete"
          @click="seriesComplete && (selectedGameIdx = idx)"
        >
          G{{ game.gameNumber }}: {{ game.team1Score }}-{{ game.team2Score }}
        </button>
      </div>
    </div>

    <!-- Box Score (available after series completes) -->
    <div v-if="seriesComplete && selectedGame">
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

<style scoped>
.playing-ball {
  animation: bounce 0.6s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-16px); }
}

.game-reveal {
  animation: fadeSlideIn 0.4s ease-out;
}

@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.series-winner-banner {
  animation: winnerPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes winnerPop {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
