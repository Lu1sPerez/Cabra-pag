import AdminGate from '@/components/auth/AdminGate';

// Ajustes: solo el admin, salvo Ventas y Gastos, que también abre el encargado
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
