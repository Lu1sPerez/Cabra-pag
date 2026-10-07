import type { Metadata } from 'next';
import { AuthProvider } from '@/components/auth/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'POS · Control de Salón',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}