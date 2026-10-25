import { totalPorNatureza, type SaldoConta } from "@/lib/accounting/queries";
import type { LinhaAnalise } from "@/lib/accounting/analise";

/** Grupos do Balancete, na ordem do plano de contas. */
export const GRUPOS_BALANCETE: { natureza: SaldoConta["natureza"]; label: string; sheet: string }[] = [
  { natureza: "ATIVO", label: "1 · Ativo", sheet: "Ativo" },
  { natureza: "PASSIVO", label: "2 · Passivo", sheet: "Passivo" },
  { natureza: "PL", label: "3 · Patrimônio Líquido", sheet: "PL" },
  { natureza: "RECEITA", label: "4 · Receitas", sheet: "Receitas" },
  { natureza: "DESPESA", label: "5 · Despesas", sheet: "Despesas" },
];

function linhasDoGrupo(saldos: SaldoConta[], saldosAnt: SaldoConta[], natureza: SaldoConta["natureza"]) {
  const contas = saldos.filter((s) => s.natureza === natureza);
  const antPorCodigo = new Map(saldosAnt.filter((s) => s.natureza === natureza).map((s) => [s.conta_code, s]));
  const total = totalPorNatureza(saldos, natureza);
  const totalAnt = totalPorNatureza(saldosAnt, natureza);
  const linhas: LinhaAnalise[] = contas.map((c) => ({
    key: c.conta_code,
    label: `${c.conta_code} — ${c.conta_name}`,
    valor: Number(c.saldo),
    valorAnterior: antPorCodigo.has(c.conta_code) ? Number(antPorCodigo.get(c.conta_code)!.saldo) : null,
    indent: true,
  }));
  return { linhas, total, totalAnt };
}

/** Uma seção por grupo (Ativo, Passivo, PL, Receitas, Despesas), cada uma terminando no total do grupo — usada pela exportação do Balancete e pelo relatório geral. */
export function montarSecoesBalancete(saldos: SaldoConta[], saldosAnt: SaldoConta[], comparar: boolean) {
  return GRUPOS_BALANCETE.map((g) => {
    const { linhas, total, totalAnt } = linhasDoGrupo(saldos, saldosAnt, g.natureza);
    linhas.push({
      key: `${g.natureza}-total`,
      label: `Total ${g.label}`,
      valor: total,
      valorAnterior: comparar ? totalAnt : null,
      subtotal: true,
    });
    return { titulo: `Balancete — ${g.label}`, sheet: g.sheet, linhas, baseAV: total || 1, baseAVAnterior: totalAnt || 1 };
  });
}
