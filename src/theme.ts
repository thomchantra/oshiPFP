export type Theme = 'dark' | 'light'

export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function toggleTheme(): Theme {
  const isDark = document.documentElement.classList.toggle('dark')
  return isDark ? 'dark' : 'light'
}
