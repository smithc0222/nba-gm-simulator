<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useEmbed, initEmbed } from '@/composables/useEmbed';
import Menubar from 'primevue/menubar';
import Button from 'primevue/button';
import Toast from 'primevue/toast';

const auth = useAuthStore();
const router = useRouter();
const { isEmbed } = useEmbed();

initEmbed();
onMounted(() => auth.fetchUser());

const menuItems = [
  { label: 'Home', icon: 'pi pi-home', command: () => router.push('/') },
  { label: 'My Drafts', icon: 'pi pi-list', command: () => router.push('/drafts') },
  { label: 'Leaderboard', icon: 'pi pi-trophy', command: () => router.push('/leaderboard') },
];

async function handleLogout() {
  await auth.logout();
  router.push('/');
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-surface">
    <Toast />
    <Menubar v-if="!isEmbed" :model="menuItems" class="sticky top-0 z-50">
      <template #start>
        <span class="font-black text-xl uppercase tracking-tight cursor-pointer flex items-center gap-2" @click="router.push('/')">
          <i class="pi pi-bolt text-court-orange"></i>
          NBA GM Simulator
        </span>
      </template>
      <template #end>
        <div v-if="auth.isAuthenticated" class="flex items-center gap-2">
          <span class="text-sm text-text-secondary hidden sm:inline">{{ auth.user?.displayName }}</span>
          <Button label="Logout" icon="pi pi-sign-out" severity="secondary" size="small" @click="handleLogout" />
        </div>
        <div v-else class="flex gap-2">
          <Button label="Login" icon="pi pi-sign-in" severity="secondary" size="small" @click="router.push('/login')" />
          <Button label="Register" icon="pi pi-user-plus" size="small" @click="router.push('/register')" />
        </div>
      </template>
    </Menubar>

    <main class="flex-1 py-6 px-4 max-w-7xl mx-auto w-full">
      <router-view />
    </main>

    <footer v-if="!isEmbed" class="border-t border-border py-6 px-4">
      <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-text-muted">
        <span class="font-bold uppercase tracking-tight">NBA GM Simulator</span>
        <span>Draft legends. Build dynasties. Settle debates.</span>
      </div>
    </footer>
  </div>
</template>
