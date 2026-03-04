import { describe, it, expect, beforeEach, vi } from 'vitest';

// Reset module between tests so the shared ref resets
beforeEach(() => {
  vi.resetModules();
});

describe('useEmbed', () => {
  it('defaults to not embedded', async () => {
    const { useEmbed } = await import('./useEmbed');
    expect(useEmbed().isEmbed.value).toBe(false);
  });

  it('detects embed=1 query param', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?embed=1' },
      writable: true,
    });
    const { useEmbed, initEmbed } = await import('./useEmbed');
    initEmbed();
    expect(useEmbed().isEmbed.value).toBe(true);
  });

  it('does not activate for other query values', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?embed=0' },
      writable: true,
    });
    const { useEmbed, initEmbed } = await import('./useEmbed');
    initEmbed();
    expect(useEmbed().isEmbed.value).toBe(false);
  });
});
