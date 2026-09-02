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
