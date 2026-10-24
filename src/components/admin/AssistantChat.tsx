'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/browser';

type Message = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  '¿Cómo venimos hoy?',
  'Compara esta semana con la anterior',
  '¿Qué productos dejan más ganancia?',
  '¿En qué gastamos más este mes?',
  '¿Cuáles son los horarios más fuertes?',
  '¿Cómo cerró el mes pasado?',
];

// Formato simple: **negrita** y listas con "-" o "•"
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
  );
}

function FormattedText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="list-disc pl-5 space-y-1">
          {list.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const item = line.match(/^(?:[-•*]|\d+\.)\s+(.*)$/);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    if (!line) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(
      <p key={`p${blocks.length}`} className={heading ? 'font-semibold' : undefined}>
        {renderInline(heading ? heading[1] : line)}
      </p>
    );
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

export default function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;

    const next: Message[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Tu sesión venció. Vuelve a ingresar.');

      const res = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: next,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo obtener una respuesta.');

      setMessages([...next, { role: 'assistant', content: body.reply }]);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'No se pudo obtener una respuesta.');
      setMessages(messages);
      setInput(question);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-4rem)] p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Asistente</h1>
          <p className="text-sm text-slate-500">
            Pregunta por ventas, gastos, productos, mozos o cómo está el salón ahora.
          </p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            disabled={loading}
          >
            <RotateCcw size={16} />
            Nueva conversación
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border bg-white p-4 space-y-4" aria-live="polite">
        {messages.length === 0 && !loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <p className="text-slate-500">Elige una pregunta para empezar o escribe la tuya.</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xl">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" className="rounded-full" onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed',
                  m.role === 'user' ? 'bg-blue-600 text-white whitespace-pre-wrap' : 'bg-slate-50 text-slate-800'
                )}
              >
                {m.role === 'user' ? m.content : <FormattedText text={m.content} />}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Revisando los datos…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta…"
          aria-label="Pregunta para el asistente"
          maxLength={2000}
          disabled={loading}
          className="flex-1 min-w-0 rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button type="submit" disabled={loading || !input.trim()} aria-label="Enviar pregunta">
          <Send size={16} />
          Enviar
        </Button>
      </form>
      <p className="mt-2 text-xs text-slate-500">
        Para responder, las preguntas y los datos necesarios se envían al servicio de IA configurado. Revisa los números
        importantes en Análisis.
      </p>
    </div>
  );
}
