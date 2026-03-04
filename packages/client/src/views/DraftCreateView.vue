<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDraftStore } from '@/stores/draft';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import SelectButton from 'primevue/selectbutton';
import Message from 'primevue/message';
import Card from 'primevue/card';

const router = useRouter();
const draftStore = useDraftStore();

const name = ref('');
const mode = ref<'online' | 'local'>('online');
const team2Name = ref('');
const modeOptions = [
  { label: 'Online', value: 'online' },
  { label: 'Local Two-Player', value: 'local' },
];
const useYearRange = ref(true);
const startYear = ref(1970);
const endYear = ref(2024);
const useDraftClass = ref(false);
const draftClassYear = ref(2003);
const error = ref('');

async function handleCreate() {
  error.value = '';
  const criteria: any = {};
  if (useYearRange.value) {
    criteria.activeYearRange = { start: startYear.value, end: endYear.value };
  }
  if (useDraftClass.value) {
    criteria.draftClassYear = draftClassYear.value;
  }
  if (!criteria.activeYearRange && !criteria.draftClassYear) {
    error.value = 'Select at least one filter criterion';
    return;
  }

  if (mode.value === 'local' && !team2Name.value.trim()) {
    error.value = 'Player 2 name is required for local mode';
    return;
  }

  try {
    const draft = await draftStore.create(name.value, criteria, mode.value, mode.value === 'local' ? team2Name.value : undefined);
    router.push(`/drafts/${draft.id}`);
  } catch (e: any) {
    error.value = e.response?.data?.message || 'Failed to create draft';
  }
}
</script>

<template>
  <div class="max-w-lg mx-auto mt-8">
    <Card>
      <template #title>
        <h2 class="text-3xl font-black">Create New Draft</h2>
      </template>
      <template #content>
        <Message v-if="error" severity="error" class="mb-4">{{ error }}</Message>
        <form @submit.prevent="handleCreate" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <label for="name" class="text-sm font-semibold text-text-secondary">Draft Name</label>
            <InputText id="name" v-model="name" required placeholder="e.g. 90s Legends Draft" />
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-sm font-semibold text-text-secondary">Mode</label>
            <SelectButton v-model="mode" :options="modeOptions" optionLabel="label" optionValue="value" />
          </div>

          <div v-if="mode === 'local'" class="flex flex-col gap-1">
            <label for="team2Name" class="text-sm font-semibold text-text-secondary">Player 2 Name</label>
            <InputText id="team2Name" v-model="team2Name" placeholder="e.g. Jordan" />
          </div>

          <div class="flex items-center gap-2">
            <Checkbox v-model="useYearRange" :binary="true" inputId="yearRange" />
            <label for="yearRange" class="text-sm font-semibold text-text-secondary">Filter by active years</label>
          </div>
          <div v-if="useYearRange" class="flex gap-4 pl-6">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold text-text-secondary">Start Year</label>
              <InputNumber v-model="startYear" :min="1946" :max="2026" :useGrouping="false" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold text-text-secondary">End Year</label>
              <InputNumber v-model="endYear" :min="1946" :max="2026" :useGrouping="false" />
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Checkbox v-model="useDraftClass" :binary="true" inputId="draftClass" />
            <label for="draftClass" class="text-sm font-semibold text-text-secondary">Filter by draft class</label>
          </div>
          <div v-if="useDraftClass" class="pl-6">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold text-text-secondary">Draft Class Year</label>
              <InputNumber v-model="draftClassYear" :min="1947" :max="2025" :useGrouping="false" />
            </div>
          </div>

          <Button type="submit" label="Create Draft" :loading="draftStore.loading" class="mt-4" />
        </form>
      </template>
    </Card>
  </div>
</template>
