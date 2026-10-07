import RequireAuth from '@/components/auth/RequireAuth';

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
