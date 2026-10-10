import { periodoAnterior, dataComparacaoPadrao } from "@/lib/accounting/analise";

export function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}

export function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export function resolverPeriodo(searchParams: URLSearchParams) {
  return {
    inicio: searchParams.get("inicio") || inicioDoAno(),
    fim: searchParams.get("fim") || hoje(),
  };
}

/** `comparar=0` desliga a comparação; qualquer outro valor (inclusive ausente) liga — mesma regra usada nas páginas de demonstrações. */
export function resolverComparar(searchParams: URLSearchParams): boolean {
  return searchParams.get("comparar") !== "0";
}

/** Resolve início/fim do período atual + comparar + início/fim do período anterior (DRE, DFC, DMPL) — usa os mesmos padrões das páginas quando o período anterior não vem na querystring. */
export function resolverPeriodoComAnterior(searchParams: URLSearchParams) {
  const { inicio, fim } = resolverPeriodo(searchParams);
  const comparar = resolverComparar(searchParams);
  const padrao = periodoAnterior(inicio, fim);
  const inicioAnt = searchParams.get("inicioAnt") || padrao.inicio;
  const fimAnt = searchParams.get("fimAnt") || padrao.fim;
  return { inicio, fim, comparar, inicioAnt, fimAnt };
}

/** Resolve a data + comparar + data anterior (Balanço) — usa o mesmo padrão (1 ano antes) da página quando a data anterior não vem na querystring. */
export function resolverDataComAnterior(searchParams: URLSearchParams) {
  const data = searchParams.get("data") || hoje();
  const comparar = resolverComparar(searchParams);
  const dataAnt = searchParams.get("dataAnt") || dataComparacaoPadrao(data);
  return { data, comparar, dataAnt };
}
