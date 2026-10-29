import OrderMenu from '@/components/salon/OrderMenu';

export default function MesaPage({ params }: { params: { tableId: string } }) {
  return (
    <main className="min-h-screen bg-slate-50">
      <OrderMenu tableId={params.tableId} />
    </main>
  );
}
