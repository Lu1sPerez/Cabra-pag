import type { Config } from 'tailwindcss';

// Colores de la app como variables CSS (definidas en src/app/globals.css).
// Así el mismo código se ve en tema claro u oscuro: cambia solo el valor de
// las variables según el atributo data-theme de <html>.
//
//   slate / gray  neutros (fondos, textos, bordes)
//   blue / brand  azul pizarra de la marca (#496275)
//   surface       tarjetas y paneles · bar: barra superior · canvas: plano
//   cuenta        ámbar de "pidió la cuenta" · ok: avisos verdes · warn: montos pendientes

const scale = (name: string) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((k) => [k, `rgb(var(--${name}-${k}) / <alpha-value>)`])
  );

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const neutral = scale('n');
const brand = scale('b');

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: neutral,
        gray: neutral,
        blue: brand,
        brand,
        surface: token('surface'),
        bar: token('bar'),
        canvas: token('canvas'),
        dot: token('dot'),
        cuenta: { DEFAULT: token('cuenta'), fg: token('cuenta-fg') },
        ok: { bg: token('ok-bg'), fg: token('ok-fg') },
        warn: token('warn'),
      },
      fontFamily: {
        // Las variables las define next/font en src/app/layout.tsx
        sans: ['var(--font-sans)', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Títulos y montos grandes
        display: ['var(--font-display)', '"Bricolage Grotesque"', 'var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderColor: {
        DEFAULT: 'rgb(var(--n-200) / <alpha-value>)',
      },
      borderRadius: {
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.06)',
        DEFAULT: '0 1px 2px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.06)',
        md: '0 2px 4px rgba(0, 0, 0, 0.06), 0 8px 20px rgba(0, 0, 0, 0.08)',
        xl: '0 12px 40px rgba(0, 0, 0, 0.25)',
      },
    },
  },
  plugins: [],
};

export default config;
