'use client';

import { applyChoice, type ThemeChoice } from '../lib/theme.ts';
import { Icon } from './Icon.tsx';
import { useFollowSystem, useTheme, useThemeChoice } from './useTheme.ts';

// The header's switch: one press between light and dark.
export function ThemeToggle() {
  useFollowSystem();
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className="icon-link" onClick={() => applyChoice(next)} aria-label={`Switch to the ${next} theme`} title={`Switch to the ${next} theme`}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  );
}

const CHOICES: { id: ThemeChoice; label: string; icon: 'monitor' | 'sun' | 'moon' }[] = [
  { id: 'system', label: 'System', icon: 'monitor' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
];

// The footer's switch, with the system setting as a third choice.
export function ThemeSwitch() {
  const choice = useThemeChoice();
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Theme">
      {CHOICES.map((c) => (
        <button key={c.id} type="button" role="radio" aria-checked={choice === c.id} onClick={() => applyChoice(c.id)} title={c.label}>
          <Icon name={c.icon} size={15} /><span className="sr-only">{c.label}</span>
        </button>
      ))}
    </div>
  );
}
