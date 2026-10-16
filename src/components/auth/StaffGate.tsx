'use client';

import { useAuth } from '@/components/auth/AuthProvider';
import { useStaff } from '@/components/auth/StaffProvider';
import PinScreen from '@/components/auth/PinScreen';

// En la tablet del salón, nada se muestra hasta que un mozo ingresa su PIN.
// El admin opera directamente, sin PIN.
export default function StaffGate({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const { staff } = useStaff();

  if (role === 'terminal' && !staff) return <PinScreen />;
  return <>{children}</>;
}
