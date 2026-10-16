'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getStaffAdmin, saveStaff, setStaffActive, type AdminStaff } from '@/actions/staff-actions';

const inputClass =
  'rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const onlyPin = (v: string) => v.replace(/\D/g, '').slice(0, 4);

export default function StaffEditor() {
  const [staff, setStaff] = useState<AdminStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(async () => setStaff(await getStaffAdmin()), []);

  useEffect(() => {
    reload()
      .catch((e) => {
        console.error(e);
        setError('No se pudo cargar la lista. Revisa que hayas ejecutado mozos.sql.');
      })
      .finally(() => setLoading(false));
  }, [reload]);

  const run = async (action: () => Promise<void>, okText: string) => {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      await action();
      await reload();
      setOk(okText);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Ocurrió un error inesperado.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length !== 4) return setError('El PIN debe tener 4 dígitos.');
    if (newPin !== newPin2) return setError('Los dos PIN no coinciden.');
    const name = newName.trim();
    run(async () => {
      await saveStaff(null, name, newPin);
      setNewName('');
      setNewPin('');
      setNewPin2('');
    }, `${name} ya puede ingresar con su PIN.`);
  };

  if (loading) return <div className="p-6 text-slate-500">Cargando mozos…</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Mozos</h1>
        <p className="text-sm text-slate-500">
          Cada mozo ingresa en la tablet eligiendo su nombre y su PIN de 4 dígitos.
        </p>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{ok}</p>}

      <form onSubmit={handleCreate} className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-semibold text-slate-800">Nuevo mozo</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre"
            aria-label="Nombre del mozo"
            className={cn(inputClass, 'flex-1 min-w-[10rem]')}
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={newPin}
            onChange={(e) => setNewPin(onlyPin(e.target.value))}
            placeholder="PIN"
            aria-label="PIN de 4 dígitos"
            className={cn(inputClass, 'w-24')}
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={newPin2}
            onChange={(e) => setNewPin2(onlyPin(e.target.value))}
            placeholder="Repetir"
            aria-label="Repetir PIN"
            className={cn(inputClass, 'w-24')}
          />
          <Button type="submit" disabled={!newName.trim() || newPin.length !== 4 || saving}>
            <Plus size={16} />
            Agregar
          </Button>
        </div>
      </form>

      {staff.length === 0 ? (
        <p className="text-slate-500">Todavía no hay mozos cargados.</p>
      ) : (
        <ul className="rounded-xl border bg-white divide-y">
          {staff.map((s) =>
            editingId === s.id ? (
              <EditRow
                key={s.id}
                member={s}
                saving={saving}
                onCancel={() => setEditingId(null)}
                onSave={(name, pin) =>
                  run(async () => {
                    await saveStaff(s.id, name, pin);
                    setEditingId(null);
                  }, pin ? `PIN de ${name} actualizado.` : 'Cambios guardados.')
                }
                onError={setError}
              />
            ) : (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className={cn('flex-1 font-medium text-slate-800', !s.is_active && 'opacity-50')}>
                  {s.name}
                </span>
                <Badge variant={s.is_active ? 'secondary' : 'outline'}>
                  {s.is_active ? 'Activo' : 'Desactivado'}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => setEditingId(s.id)} aria-label={`Editar ${s.name}`}>
                  <Pencil size={14} />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  className={s.is_active ? 'text-red-600 hover:bg-red-50' : ''}
                  onClick={() =>
                    run(
                      () => setStaffActive(s.id, !s.is_active),
                      s.is_active ? `${s.name} ya no puede ingresar.` : `${s.name} puede volver a ingresar.`
                    )
                  }
                >
                  {s.is_active ? 'Desactivar' : 'Activar'}
                </Button>
              </li>
            )
          )}
        </ul>
      )}

      <p className="text-xs text-slate-500">
        Desactivar a un mozo cierra su sesión al instante y conserva su historial de pedidos y cobros.
      </p>
    </div>
  );
}

function EditRow({
  member,
  saving,
  onCancel,
  onSave,
  onError,
}: {
  member: AdminStaff;
  saving: boolean;
  onCancel: () => void;
  onSave: (name: string, pin: string | null) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(member.name);
  const [pin, setPin] = useState('');

  return (
    <li className="px-4 py-3 bg-blue-50/50">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return onError('El nombre no puede quedar vacío.');
          if (pin && pin.length !== 4) return onError('El PIN debe tener 4 dígitos.');
          onSave(name.trim(), pin || null);
        }}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nombre"
          className={cn(inputClass, 'flex-1 min-w-[10rem]')}
        />
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(e) => setPin(onlyPin(e.target.value))}
          placeholder="PIN nuevo (opcional)"
          aria-label="PIN nuevo, opcional"
          className={cn(inputClass, 'w-44')}
        />
        <Button type="submit" size="sm" disabled={saving}>
          Guardar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </form>
    </li>
  );
}
