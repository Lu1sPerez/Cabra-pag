'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/browser';
import { useAuth } from '@/components/auth/AuthProvider';

// Solo rutas internas, para evitar redirecciones a otros sitios
function safeNext() {
  if (typeof window === 'undefined') return '/';
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) router.replace(safeNext());
  }, [loading, session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      console.error(error);
      setError(
        error.message.toLowerCase().includes('invalid login credentials')
          ? 'Email o contraseña incorrectos.'
          : 'No se pudo iniciar sesión. Revisa tu conexión e intenta de nuevo.'
      );
      setSubmitting(false);
      return;
    }

    router.replace(safeNext());
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm space-y-5"
      >
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ingresar</h1>
          <p className="text-sm text-slate-500">Acceso para administradores.</p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-600">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-600">Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full h-11" disabled={submitting}>
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    </main>
  );
}
