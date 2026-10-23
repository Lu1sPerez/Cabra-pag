import type { Config } from 'tailwindcss';

// Paleta del local:
//   #496275  azul pizarra  -> color principal (botones, enlaces, foco, gráficos)
//   #F0EEE9  marfil        -> fondo de la app
// Las clases "slate" y "blue" que ya usa la app se redefinen con esta paleta,
// así el estilo cambia en todas las pantallas sin tocar cada componente.

const warmNeutral = {
  50: '#F0EEE9', // fondo
  100: '#E7E4DE',
  200: '#D8D4CC', // bordes
  300: '#BFBAB0',
  400: '#99948A',
  500: '#6B675F', // texto secundario
  600: '#55524C',
  700: '#403E3A',
  800: '#2E3B45', // títulos y encabezados oscuros
  900: '#222D35', // botón principal oscuro
  950: '#161E24',
};

const brand = {
  50: '#EEF2F5',
  100: '#DCE4EA',
  200: '#BCCAD5',
  300: '#96ACBC',
  400: '#6F8BA0',
  500: '#58748A',
  600: '#496275', // principal
  700: '#3D5262',
  800: '#32434F',
  900: '#283640',
  950: '#1A242B',
};

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: warmNeutral,
        gray: warmNeutral,
        blue: brand,
        brand,
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderColor: {
        DEFAULT: warmNeutral[200],
      },
      borderRadius: {
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(34, 45, 53, 0.05)',
        DEFAULT: '0 1px 2px rgba(34, 45, 53, 0.05), 0 2px 8px rgba(34, 45, 53, 0.06)',
        md: '0 2px 4px rgba(34, 45, 53, 0.05), 0 8px 20px rgba(34, 45, 53, 0.08)',
        xl: '0 12px 40px rgba(34, 45, 53, 0.18)',
      },
    },
  },
  plugins: [],
};

export default config;
