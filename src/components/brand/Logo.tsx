import { LOGO_PATH, LOGO_VIEWBOX } from '@/lib/business';
import { cn } from '@/lib/utils';

// Toma el color del texto (currentColor): usa text-… para cambiarlo
export default function Logo({ className, title = 'Cabra Austral' }: { className?: string; title?: string }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} role="img" aria-label={title} className={cn('block', className)}>
      <path fill="currentColor" d={LOGO_PATH} />
    </svg>
  );
}
