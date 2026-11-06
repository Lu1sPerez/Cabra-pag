import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Manrope } from 'next/font/google';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

// Las fuentes se descargan al compilar y se sirven desde el propio sitio:
// sin pedidos a Google en cada carga y sin saltos de texto al abrir la app.
const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  axes: ['opsz'],
});

export const metadata: Metadata = {
  title: 'Cabra Austral · POS',
};

export const viewport: Viewport = {
  themeColor: '#101113',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      data-theme={DEFAULT_THEME}
      className={`${manrope.variable} ${bricolage.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Aplica el tema guardado antes de pintar */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
