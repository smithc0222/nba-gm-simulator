import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User } from '@nba-gm/shared';
import * as api from '@/api';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const loading = ref(false);

  const isAuthenticated = computed(() => !!user.value);

  async function fetchUser() {
    try {
      const res = await api.getMe();
      user.value = res.data.data;
    } catch {
      user.value = null;
    }
  }

  async function register(email: string, password: string, displayName: string) {
    loading.value = true;
    try {
      const res = await api.register(email, password, displayName);
      user.value = res.data.data;
      if (res.data.token) localStorage.setItem('token', res.data.token);
    } finally {
      loading.value = false;
    }
  }

  async function login(email: string, password: string) {
    loading.value = true;
    try {
      const res = await api.login(email, password);
      user.value = res.data.data;
      if (res.data.token) localStorage.setItem('token', res.data.token);
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    await api.logout();
    localStorage.removeItem('token');
    user.value = null;
  }

  return { user, loading, isAuthenticated, fetchUser, register, login, logout };
});
