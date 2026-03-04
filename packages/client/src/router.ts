import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
    },
    {
      path: '/drafts',
      name: 'drafts',
      component: () => import('@/views/DraftsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/drafts/new',
      name: 'draft-create',
      component: () => import('@/views/DraftCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/drafts/:id',
      name: 'draft',
      component: () => import('@/views/DraftView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/join/:shareCode',
      name: 'join',
      component: () => import('@/views/JoinView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/series/:id',
      name: 'series',
      component: () => import('@/views/SeriesView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/leaderboard',
      name: 'leaderboard',
      component: () => import('@/views/LeaderboardView.vue'),
    },
  ],
});

const EMBED_ROUTE_KEY = 'embed_route';
const isEmbed = window.location.search.includes('embed=1');

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const auth = useAuthStore();
    if (!auth.isAuthenticated) {
      await auth.fetchUser();
      if (!auth.isAuthenticated) {
        return { name: 'login', query: { redirect: to.fullPath } };
      }
    }
  }
});

// In embed mode, persist route to localStorage so iframe refreshes restore it
if (isEmbed) {
  router.afterEach((to) => {
    if (to.path !== '/login' && to.path !== '/register') {
      localStorage.setItem(EMBED_ROUTE_KEY, to.fullPath);
    }
  });

  router.isReady().then(() => {
    const saved = localStorage.getItem(EMBED_ROUTE_KEY);
    if (saved && router.currentRoute.value.path === '/') {
      router.replace(saved);
    }
  });
}

export default router;
