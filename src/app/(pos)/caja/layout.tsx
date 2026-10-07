import RequireAuth from '@/components/auth/RequireAuth';

export default function CajaLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth role="admin">{children}</RequireAuth>;
}
