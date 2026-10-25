import { FileDown } from "lucide-react";
import { periodoAnterior } from "@/lib/accounting/analise";

function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Cartão do Dashboard que baixa todos os relatórios (DRE, Balanço, DFC, DMPL, Balancete, Razões e Diários)
 * em um único PDF, com o mesmo seletor de período atual × período anterior das telas de
 * demonstrações. O formulário envia direto para /api/export/relatorio, que devolve o arquivo.
 */
export function ExportarRelatorios() {
  const inicio = inicioDoAno();
  const fim = hoje();
  const anterior = periodoAnterior(inicio, fim);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <FileDown className="h-4 w-4 text-slate-500" />
        <h2 className="font-medium text-slate-900">Exportar todos os relatórios</h2>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Gera um único PDF com DRE, Balanço Patrimonial, DFC, DMPL e Balancete, com análise vertical e horizontal, seguidos dos Razões de cada conta e dos Diários de lançamentos no final.
        O Balanço e o Balancete são posicionados na data de fim de cada período.
      </p>

      <form method="get" action="/api/export/relatorio" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="formato" value="pdf" />
        <div className="flex flex-wrap items-end gap-3">
          <span className="w-full text-xs font-semibold text-slate-600">Período atual</span>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Início</label>
            <input type="date" name="inicio" defaultValue={inicio} required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Fim</label>
            <input type="date" name="fim" defaultValue={fim} required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
        </div>
        <div className="w-full h-px bg-slate-100 my-1" />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="comparar" value="1" defaultChecked className="rounded border-slate-300" />
          Comparar com período anterior (análise horizontal)
        </label>
        {/* Vem depois do checkbox: marcado, o servidor lê "1" (primeiro valor); desmarcado, só sobra este "0". */}
        <input type="hidden" name="comparar" value="0" />
        <div className="flex flex-wrap items-end gap-3">
          <span className="w-full text-xs font-semibold text-slate-600">Período anterior</span>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Início</label>
            <input type="date" name="inicioAnt" defaultValue={anterior.inicio} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Fim</label>
            <input type="date" name="fimAnt" defaultValue={anterior.fim} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800"
        >
          <FileDown className="h-3.5 w-3.5" />
          Baixar PDF
        </button>
      </form>
    </div>
  );
}
