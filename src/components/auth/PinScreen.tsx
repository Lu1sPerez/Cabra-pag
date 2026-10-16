'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Delete } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { useStaff } from '@/components/auth/StaffProvider';
import { listActiveStaff, startStaffSession, type StaffOption } from '@/actions/staff-actions';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function PinScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { setStaff } = useStaff();

  const [options, setOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StaffOption | null>(null);
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listActiveStaff()
      .then(setOptions)
      .catch((e) => {
        console.error(e);
        setError('No se pudo cargar la lista de mozos.');
      })
      .finally(() => setLoading(false));
  }, []);

  const submit = useCallback(
    async (value: string) => {
      if (!selected) return;
      setChecking(true);
      setError(null);
      try {
        const result = await startStaffSession(selected.id, value);
        if (result.ok) {
          setStaff(result.session);
          return;
        }
        setError(result.error);
      } catch (e) {
        console.error(e);
        setError('No se pudo validar el PIN. Revisa la conexión.');
      }
      setPin('');
      setChecking(false);
    },
    [selected, setStaff]
  );

  const press = useCallback(
    (digit: string) => {
      if (checking) return;
      setError(null);
      setPin((prev) => {
        if (prev.length >= 4) return prev;
        const next = prev + digit;
        if (next.length === 4) submit(next);
        return next;
      });
    },
    [checking, submit]
  );

  const erase = useCallback(() => {
    if (!checking) setPin((p) => p.slice(0, -1));
  }, [checking]);

  // Teclado físico
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') erase();
      else if (e.key === 'Escape') {
        setSelected(null);
        setPin('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, press, erase]);

  const handleSignOut = async () => {
    if (!window.confirm('¿Cerrar la sesión de este equipo? Para volver a usarlo hará falta el usuario y la contraseña del salón.')) return;
    await signOut();
    router.replace('/login');
  };

  return (
    <main className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
      {!selected ? (
        <div className="w-full max-w-2xl space-y-6">
          <h1 className="text-3xl font-bold text-center">¿Quién eres?</h1>

          {loading ? (
            <p className="text-center text-slate-400">Cargando…</p>
          ) : options.length === 0 ? (
            <p className="text-center text-slate-300">
              No hay mozos cargados. El administrador puede crearlos en Administración › Mozos.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setSelected(o);
                    setPin('');
                    setError(null);
                  }}
                  className="h-20 rounded-xl bg-slate-800 text-lg font-semibold hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {o.name}
                </button>
              ))}
            </div>
          )}

          {error && <p role="alert" className="text-center text-red-300">{error}</p>}
        </div>
      ) : (
        <div className="w-full max-w-xs space-y-6">
          <div className="text-center space-y-1">
            <p className="text-slate-400">Hola,</p>
            <h1 className="text-2xl font-bold">{selected.name}</h1>
            <p className="text-slate-400 text-sm">Ingresa tu PIN</p>
          </div>

          <div className="flex justify-center gap-4" aria-label={`${pin.length} de 4 dígitos ingresados`}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn('h-4 w-4 rounded-full border-2 border-white', i < pin.length && 'bg-white')}
              />
            ))}
          </div>

          <p role="alert" className="h-5 text-center text-sm text-red-300">
            {checking ? <span className="text-slate-400">Verificando…</span> : error}
          </p>

          <div className="grid grid-cols-3 gap-3">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                disabled={checking}
                className="h-16 rounded-xl bg-slate-800 text-2xl font-semibold hover:bg-slate-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {k}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setPin('');
                setError(null);
              }}
              className="h-16 rounded-xl text-sm text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={() => press('0')}
              disabled={checking}
              className="h-16 rounded-xl bg-slate-800 text-2xl font-semibold hover:bg-slate-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              0
            </button>
            <button
              type="button"
              onClick={erase}
              aria-label="Borrar"
              disabled={checking}
              className="h-16 rounded-xl flex items-center justify-center text-slate-300 hover:bg-slate-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <Delete size={24} />
            </button>
          </div>
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        className="mt-10 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
      >
        Cerrar sesión del equipo
      </Button>
    </main>
  );
}
