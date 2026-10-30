'use client';

import { useEffect, useRef } from 'react';

// Vuelve a cargar los datos cuando la pantalla vuelve a estar visible (el iPad
// se despierta o se vuelve a la pestaña) o cuando vuelve internet.
// Supabase Realtime no reenvía los cambios que pasaron mientras estaba desconectado.
export function useResync(callback: () => void) {
  const cb = useRef(callback);

  useEffect(() => {
    cb.current = callback;
  }, [callback]);

  useEffect(() => {
    let last = 0;
    const run = () => {
      const now = Date.now();
      if (now - last < 1500) return; // evita dos recargas seguidas (visible + online)
      last = now;
      cb.current();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    // Solo cuando Safari restaura la página desde su caché (no en la carga normal)
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) run();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', run);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', run);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);
}
