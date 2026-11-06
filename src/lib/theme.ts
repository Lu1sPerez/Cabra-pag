// Tema de la app (oscuro o claro), guardado en cada dispositivo.
// El valor inicial lo aplica un script en src/app/layout.tsx antes de pintar,
// para que la pantalla no parpadee en blanco al abrir.

export type Theme = 'dark' | 'light';

export const THEME_KEY = 'cabra-tema';
export const DEFAULT_THEME: Theme = 'dark';

// Script en línea para <head>: lee la preferencia y la aplica de inmediato
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'${DEFAULT_THEME}'}catch(e){document.documentElement.dataset.theme='${DEFAULT_THEME}'}`;

export function getTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Sin almacenamiento (modo privado): el tema vale hasta recargar
  }
}
