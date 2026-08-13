export type Theme = 'dark' | 'light'

export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Resolves the initial theme once at app mount — follows the OS/browser's `prefers-color-scheme`
 * when available, otherwise falls back to `getTheme()`'s existing light default. No persistence
 * (no localStorage): this only decides the starting point each fresh load; the header's manual
 * toggle (toggleTheme) still overrides it for the rest of the session same as before. */
export function initTheme(): Theme {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  if (prefersDark) document.documentElement.classList.add('dark')
  return getTheme()
}

export function toggleTheme(): Theme {
  const isDark = document.documentElement.classList.toggle('dark')
  return isDark ? 'dark' : 'light'
}
