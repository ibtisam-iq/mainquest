// Light or dark. The choice is kept in this browser only; with no choice, the system setting decides.
// The root element carries the resolved theme as data-theme, set before the first paint by THEME_SCRIPT.
export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'mainquest-theme';

// Runs in the page head, before anything is drawn, so a dark page never flashes light.
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_KEY}');var d=c==='dark'||(c!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

export function readChoice(): ThemeChoice {
  try {
    const c = localStorage.getItem(THEME_KEY);
    return c === 'light' || c === 'dark' ? c : 'system';
  } catch {
    return 'system';
  }
}

export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage can be blocked; the theme still changes for this visit.
  }
  document.documentElement.dataset.theme = choice === 'system' ? systemTheme() : choice;
  window.dispatchEvent(new Event('mainquest-theme'));
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
