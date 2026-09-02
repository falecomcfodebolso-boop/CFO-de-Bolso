import Link from "next/link";
import { BookOpenText, Scale3D, Waves, PieChart } from "lucide-react";

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

export default function DemonstracoesPage() {
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
    </div>
  );
}
