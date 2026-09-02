import Link from "next/link";
import { BookOpenText, Scale3D, Waves, PieChart, FileDown } from "lucide-react";
import { ExportButtons } from "./export-buttons";

const DEMONSTRACOES = [
  {
    href: "/demonstracoes/dre",
    icon: BookOpenText,
    title: "DRE",
    subtitle: "Demonstração do Resultado do Exercício",
    description: "Receitas, custos e despesas do período, até o lucro ou prejuízo líquido.",
  },
  {
    href: "/demonstracoes/balanco",
    icon: Scale3D,
    title: "Balanço Patrimonial",
    subtitle: "Posição patrimonial em uma data",
    description: "Ativo, Passivo e Patrimônio Líquido, separados em circulante e não circulante.",
  },
  {
    href: "/demonstracoes/dfc",
    icon: Waves,
    title: "DFC",
    subtitle: "Demonstração do Fluxo de Caixa",
    description: "De onde veio e para onde foi o caixa: operacional, investimento e financiamento.",
  },
  {
    href: "/demonstracoes/dmpl",
    icon: PieChart,
    title: "DMPL",
    subtitle: "Mutações do Patrimônio Líquido",
    description: "Como o Patrimônio Líquido mudou no período: aportes, distribuições e resultado.",
  },
];

function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DemonstracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ inicio?: string; fim?: string }>;
}) {
  const { inicio: inicioParam, fim: fimParam } = await searchParams;
  const inicio = inicioParam || inicioDoAno();
  const fim = fimParam || hoje();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Demonstrações Financeiras</h1>
        <p className="text-sm text-slate-500">
          Calculadas automaticamente a partir dos lançamentos do Diário — sem nenhum lançamento manual extra.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {DEMONSTRACOES.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition"
          >
            <div className="h-9 w-9 rounded-lg bg-slate-900 text-white grid place-items-center mb-3">
              <d.icon className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900">
              {d.title} <span className="font-normal text-slate-400">— {d.subtitle}</span>
            </h2>
            <p className="text-sm text-slate-500 mt-1.5">{d.description}</p>
          </Link>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <FileDown className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Relatório Completo</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Baixa a DRE, o Balanço, a DFC e a DMPL do mesmo período, tudo em um único arquivo — a posição do
          Balanço é calculada na data de fim escolhida.
        </p>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Início</label>
            <input
              type="date"
              name="inicio"
              defaultValue={inicio}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Fim</label>
            <input
              type="date"
              name="fim"
              defaultValue={fim}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800"
          >
            Atualizar período
          </button>
          <div className="ml-auto">
            <ExportButtons hrefBase="/api/export/relatorio" query={{ inicio, fim }} />
          </div>
        </form>
      </div>
    </div>
  );
}
