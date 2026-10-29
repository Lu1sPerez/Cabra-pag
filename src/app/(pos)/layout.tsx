import RequireAuth from '@/components/auth/RequireAuth';
import { StaffProvider } from '@/components/auth/StaffProvider';
import StaffGate from '@/components/auth/StaffGate';
import AppShell from '@/components/layout/AppShell';

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <StaffProvider>
        <StaffGate>
          <AppShell>{children}</AppShell>
        </StaffGate>
      </StaffProvider>
    </RequireAuth>
  );
}
