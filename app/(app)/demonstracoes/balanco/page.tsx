import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getBalanco, type ContaSaldo } from "@/lib/accounting/demonstrativos";
import { fmtMoney } from "@/lib/format";
import { ExportButtons } from "../export-buttons";

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function Bloco({ titulo, contas, total, currency }: { titulo: string; contas: ContaSaldo[]; total: number; currency: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-medium text-slate-500 uppercase px-4 py-1.5">
        <span>{titulo}</span>
        <span>{fmtMoney(total, currency)}</span>
      </div>
      {contas.length === 0 ? (
        <p className="text-sm text-slate-400 px-4 py-1.5">Sem saldo.</p>
      ) : (
        contas.map((c) => (
          <div key={c.code} className="flex justify-between text-sm px-4 py-1">
            <span className="text-slate-700">
              <span className="font-mono text-xs text-slate-400 mr-2">{c.code}</span>
              {c.name}
            </span>
            <span className="font-mono text-slate-900">{fmtMoney(c.saldo, currency)}</span>
          </div>
        ))
      )}
    </div>
  );
}

export default async function BalancoPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data: dataParam } = await searchParams;
  const data = dataParam || hoje();

  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const b = await getBalanco(supabase, currentOrgId, data);

  const fecha = Math.abs(b.diferenca) < 0.01;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/demonstracoes" className="text-sm text-slate-500 hover:underline">
            ← Demonstrações
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">Balanço Patrimonial</h1>
          <p className="text-sm text-slate-500">Posição do Ativo, Passivo e Patrimônio Líquido em uma data.</p>
        </div>
        <ExportButtons hrefBase="/api/export/balanco" query={{ data }} />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Data de referência</label>
          <input
            type="date"
            name="data"
            defaultValue={data}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800">
          Atualizar
        </button>
      </form>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between text-sm font-semibold text-slate-900">
            <span>Ativo</span>
            <span>{fmtMoney(b.ativoTotal, currency)}</span>
          </div>
          <div className="divide-y divide-slate-50 py-1">
            <Bloco titulo="Circulante" contas={b.contasAtivoCirculante} total={b.ativoCirculante} currency={currency} />
            <Bloco
              titulo="Não Circulante"
              contas={b.contasAtivoNaoCirculante}
              total={b.ativoNaoCirculante}
              currency={currency}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between text-sm font-semibold text-slate-900">
            <span>Passivo + Patrimônio Líquido</span>
            <span>{fmtMoney(b.passivoMaisPl, currency)}</span>
          </div>
          <div className="divide-y divide-slate-50 py-1">
            <Bloco
              titulo="Passivo Circulante"
              contas={b.contasPassivoCirculante}
              total={b.passivoCirculante}
              currency={currency}
            />
            <Bloco
              titulo="Passivo Não Circulante"
              contas={b.contasPassivoNaoCirculante}
              total={b.passivoNaoCirculante}
              currency={currency}
            />
            <Bloco titulo="Patrimônio Líquido" contas={b.contasPl} total={b.capitalEReservas} currency={currency} />
            <div className="flex justify-between text-sm px-4 py-1 italic">
              <span className="text-slate-500">Resultado do Exercício (ainda não fechado)</span>
              <span className="font-mono text-slate-700">{fmtMoney(b.resultadoDoExercicio, currency)}</span>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 text-sm flex justify-between ${
          fecha ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
        }`}
      >
        <span>{fecha ? "Balanço fechado (Ativo = Passivo + PL)" : "Atenção: o balanço não fechou"}</span>
        <span className="font-mono">{fmtMoney(b.diferenca, currency)}</span>
      </div>
    </div>
  );
}
