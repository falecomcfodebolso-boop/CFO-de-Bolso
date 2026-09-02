"use client";

import { useState, useRef, useEffect } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatWidget({ initialMessages }: { initialMessages: Msg[] }) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversaId, setConversaId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const resp = await fetch("/api/cfo-bolso/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, conversaId }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Erro ao consultar o CFO de Bolso.");
      setConversaId(json.conversaId);
      setMessages((m) => [...m, { role: "assistant", content: json.answer }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const sugestoes = [
    "Qual o resultado do período e de onde ele vem?",
    "Quais são os 3 ativos com maior concentração na carteira?",
    "Explique a composição da conta 4.1.001.",
    "Tenho algum vencimento nos próximos 30 dias?",
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl flex flex-col h-[70vh]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-slate-500 space-y-2">
            <p>Pergunte algo sobre a contabilidade ou a carteira desta organização. Exemplos:</p>
            <ul className="space-y-1">
              {sugestoes.map((s) => (
                <li key={s}>
                  <button onClick={() => setInput(s)} className="underline text-slate-700 hover:text-slate-900">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && <div className="text-sm text-slate-400">CFO de Bolso está calculando...</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-slate-200 p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Pergunte ao CFO de Bolso..."
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={send}
          disabled={loading}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
