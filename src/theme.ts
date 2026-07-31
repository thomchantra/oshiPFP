export type Theme = 'dark' | 'light'

export function getTheme(): Theme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark'
}

export function toggleTheme(): Theme {
  const isLight = document.documentElement.classList.toggle('light')
  return isLight ? 'light' : 'dark'
}
