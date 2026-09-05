/**
 * Arredonda um valor monetario para centavos e normaliza "-0" para "0".
 * Usado para eliminar residuos de ponto flutuante (ex: -2.8e-14) que
 * surgem ao somar muitas parcelas em D/C e que, sem isso, aparecem na
 * tela como um saldo "negativo" de zero (-US$ 0,00) numa conta que na
 * pratica ja foi totalmente liquidada.
 */
export function arredondarCentavos(value: number): number {
  const arredondado = Math.round(value * 100) / 100;
  return arredondado === 0 ? 0 : arredondado;
}

export function fmtMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(arredondarCentavos(value));
}

export function fmtDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "2-digit" }).format(d);
}

export function fmtDateNumerica(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export function fmtDateHora(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
