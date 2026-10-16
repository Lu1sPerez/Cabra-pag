import RequireAuth from '@/components/auth/RequireAuth';
import { StaffProvider } from '@/components/auth/StaffProvider';
import StaffGate from '@/components/auth/StaffGate';

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <StaffProvider>
        <StaffGate>{children}</StaffGate>
      </StaffProvider>
    </RequireAuth>
  );
}
