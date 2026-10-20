import RequireManager from '@/components/auth/RequireManager';

export default function CajaLayout({ children }: { children: React.ReactNode }) {
  return <RequireManager>{children}</RequireManager>;
}
