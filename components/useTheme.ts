'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { applyChoice, currentTheme, readChoice, type Theme, type ThemeChoice } from '../lib/theme.ts';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('mainquest-theme', onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener('mainquest-theme', onChange);
  };
}

// The theme on screen now. Pages are built light, so the server's answer is light.
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light');
}

// The stored choice, which may be "system".
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, readChoice, () => 'system');
}

// While the choice is "system", follow the system setting as it changes.
export function useFollowSystem() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (readChoice() === 'system') applyChoice('system'); };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
}
