"use client";

import { useState, useTransition } from "react";
import { gerarAnaliseCarteiraAction } from "./analise-actions";
import type { Ativo } from "@/lib/portfolio/indices";

type Analise = { id: string; conteudo: string; created_at: string };

export function AnaliseCarteira({
  ativos,
  currency,
  analises,
  podeEscrever,
}: {
  ativos: Ativo[];
  currency: string;
  analises: Analise[];
  podeEscrever: boolean;
}) {
  const [perfilRisco, setPerfilRisco] = useState("Investidor experiente, baixa exposição ao risco");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState(true);

  const ultima = analises[0];

  function gerar() {
    setErro(null);
    startTransition(async () => {
      const result = await gerarAnaliseCarteiraAction(ativos, currency, perfilRisco);
      if (result?.error) setErro(result.error);
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-900">Análise de risco e recomendações</h2>
        {ultima && (
          <button onClick={() => setExpandido((v) => !v)} className="text-xs text-slate-500 hover:underline">
            {expandido ? "recolher" : "expandir"}
          </button>
        )}
      </div>

      {podeEscrever && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={perfilRisco}
            onChange={(e) => setPerfilRisco(e.target.value)}
            placeholder="Perfil de risco do investidor"
            className="flex-1 min-w-[240px] rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={gerar}
            disabled={pending || ativos.length === 0}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "Gerando..." : "Gerar nova análise"}
          </button>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Gerada por IA a partir dos números atuais da carteira (concentração, setor, prazo, exposições) — não é
        aconselhamento de investimento individualizado, e não busca ratings de crédito ou cotações de mercado ao
        vivo. Cada geração fica salva no histórico.
      </p>

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</p>}

      {ultima ? (
        expandido && (
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-400 mb-2">
              Última análise: {new Date(ultima.created_at).toLocaleString("pt-BR")}
            </p>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700 text-sm">
              {ultima.conteudo}
            </div>
          </div>
        )
      ) : (
        <p className="text-sm text-slate-400">Nenhuma análise gerada ainda.</p>
      )}
    </div>
  );
}
