// Genera el ticket como un archivo HTML independiente (se abre en cualquier
// celular o computadora, se puede imprimir o guardar como PDF).
import { BUSINESS, LOGO_PATH, LOGO_VIEWBOX } from '@/lib/business';

export type TicketItem = { name: string; qty: number; unitPrice: number };
export type TicketPayment = { method: string; amount: number; adjustment: number; cashGiven?: number | null };

export type TicketData = {
  kind: 'receipt' | 'precuenta';
  orderId: string;
  tableName: string;
  date: Date;
  staffNames: string[];
  items: TicketItem[];
  discount: number;
  discountReason?: string | null;
  payments: TicketPayment[];
};

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const num = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
const money = (n: number) => `$ ${num(n)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function ticketNumber(orderId: string) {
  return `#${orderId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function ticketTotals(d: TicketData) {
  const subtotal = round2(d.items.reduce((acc, i) => acc + i.qty * i.unitPrice, 0));
  const net = round2(subtotal - d.discount);
  const adjustments = round2(d.payments.reduce((acc, p) => acc + p.adjustment, 0));
  const paidBase = round2(d.payments.reduce((acc, p) => acc + (p.amount - p.adjustment), 0));
  const remaining = Math.max(0, round2(net - paidBase));
  return { subtotal, net, adjustments, total: round2(net + adjustments), remaining };
}

export function buildTicketHtml(d: TicketData) {
  const t = ticketTotals(d);
  const isReceipt = d.kind === 'receipt';
  const date = d.date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const staff = Array.from(new Set(d.staffNames.filter(Boolean))).join(', ');

  const items = d.items
    .map(
      (i) => `
      <div class="item">
        <div class="row"><strong>${esc(i.name)}</strong><span>${num(round2(i.qty * i.unitPrice))}</span></div>
        <div class="muted">${i.qty} × ${num(i.unitPrice)}</div>
      </div>`
    )
    .join('');

  const payments = d.payments
    .map((p) => {
      const lines = [`<div class="row"><span>${esc(p.method)}</span><span>${num(p.amount)}</span></div>`];
      if (p.adjustment > 0) lines.push(`<div class="muted">incluye recargo ${num(p.adjustment)}</div>`);
      if (p.adjustment < 0) lines.push(`<div class="muted">incluye descuento ${num(-p.adjustment)}</div>`);
      if (p.cashGiven != null && p.cashGiven > p.amount) {
        lines.push(`<div class="muted">pagó con ${num(p.cashGiven)} · vuelto ${num(round2(p.cashGiven - p.amount))}</div>`);
      }
      return lines.join('');
    })
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(isReceipt ? 'Ticket' : 'Pre-cuenta')} ${esc(d.tableName)} · ${esc(BUSINESS.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #F0EEE9; color: #222D35; font: 13px/1.6 ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; }
  .ticket { width: 100%; max-width: 340px; margin: 24px auto; background: #fff; border-radius: 8px; padding: 26px 22px 22px; box-shadow: 0 2px 14px rgba(34,45,53,.10); }
  header, footer { text-align: center; }
  .logo { width: 104px; height: auto; color: #222D35; display: block; margin: 0 auto 6px; }
  .name { font: 800 18px/1.2 system-ui, -apple-system, sans-serif; letter-spacing: .1em; }
  .muted { color: #55524C; }
  .sep { border: 0; border-top: 1px dashed #99948A; margin: 12px 0; }
  .row { display: flex; justify-content: space-between; gap: 12px; }
  .item { margin-bottom: 8px; }
  .total { display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; }
  .total strong { font: 800 26px/1.1 system-ui, -apple-system, sans-serif; }
  .warn { margin-top: 8px; font-weight: 700; }
  .badge { display: inline-block; border: 1px solid #222D35; border-radius: 6px; padding: 2px 8px; font-weight: 700; margin-top: 8px; }
  button { width: 100%; margin-top: 18px; height: 44px; border-radius: 12px; border: 1px solid #D8D4CC; background: #F0EEE9; color: #222D35; font: 700 14px system-ui, -apple-system, sans-serif; cursor: pointer; }
  @media print { body { background: #fff; } .ticket { box-shadow: none; margin: 0 auto; } button { display: none; } }
</style>
</head>
<body>
<article class="ticket">
  <header>
    <svg class="logo" viewBox="${LOGO_VIEWBOX}" role="img" aria-label="${esc(BUSINESS.name)}"><path fill="currentColor" d="${LOGO_PATH}"/></svg>
    <div class="name">${esc(BUSINESS.name.toUpperCase())}</div>
    <div class="muted">${esc(BUSINESS.tagline)}</div>
    <div class="muted">${esc(BUSINESS.address)}</div>
    <div class="muted">${esc(BUSINESS.instagram)}</div>
    ${isReceipt ? '' : '<div class="badge">PRE-CUENTA</div>'}
  </header>
  <hr class="sep">
  <div class="row"><span class="muted">${isReceipt ? 'Ticket' : 'Cuenta'}</span><span>${esc(ticketNumber(d.orderId))}</span></div>
  <div class="row"><span class="muted">Fecha</span><span>${esc(date)}</span></div>
  <div class="row"><span class="muted">Mesa</span><span>${esc(d.tableName)}</span></div>
  ${staff ? `<div class="row"><span class="muted">Atendió</span><span>${esc(staff)}</span></div>` : ''}
  <hr class="sep">
  ${items}
  <hr class="sep">
  <div class="row"><span>Subtotal</span><span>${num(t.subtotal)}</span></div>
  ${d.discount > 0 ? `<div class="row"><span>Descuento</span><span>−${num(d.discount)}</span></div>` : ''}
  ${d.discount > 0 && d.discountReason ? `<div class="muted">(${esc(d.discountReason)})</div>` : ''}
  ${t.adjustments !== 0 ? `<div class="row"><span>${t.adjustments > 0 ? 'Recargos' : 'Descuentos por medio de pago'}</span><span>${t.adjustments > 0 ? '' : '−'}${num(Math.abs(t.adjustments))}</span></div>` : ''}
  <div class="total"><span><strong style="font-size:15px">TOTAL</strong></span><strong>${money(t.total)}</strong></div>
  ${
    payments
      ? `<hr class="sep"><div class="muted" style="margin-bottom:4px">${d.payments.length > 1 ? 'Pagos' : 'Pago'}</div>${payments}`
      : ''
  }
  ${t.remaining > 0.009 && d.payments.length ? `<div class="row warn"><span>Resta pagar</span><span>${num(t.remaining)}</span></div>` : ''}
  <hr class="sep">
  <footer>
    <div class="name" style="font-size:15px;letter-spacing:0">${isReceipt ? '¡Gracias por venir!' : 'Esta cuenta no es un comprobante de pago'}</div>
    ${BUSINESS.hours.map((h) => `<div class="muted">${esc(h)}</div>`).join('')}
    <div class="warn">Comprobante no válido como factura</div>
  </footer>
  <button type="button" onclick="window.print()">Imprimir o guardar como PDF</button>
</article>
</body>
</html>`;
}

export function ticketFileName(d: TicketData) {
  const day = d.date.toISOString().slice(0, 10);
  const table = d.tableName.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return `${d.kind === 'receipt' ? 'ticket' : 'precuenta'}-${table || 'mesa'}-${day}.html`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadTicket(d: TicketData) {
  downloadBlob(new Blob([buildTicketHtml(d)], { type: 'text/html;charset=utf-8' }), ticketFileName(d));
}

// Abre el menú de compartir del dispositivo (WhatsApp, mail…). Si no se puede, descarga.
export async function shareTicket(d: TicketData) {
  const filename = ticketFileName(d);
  const file = new File([buildTicketHtml(d)], filename, { type: 'text/html' });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `Ticket ${d.tableName} · ${BUSINESS.name}` });
      return 'shared' as const;
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled' as const;
    }
  }
  downloadTicket(d);
  return 'downloaded' as const;
}
