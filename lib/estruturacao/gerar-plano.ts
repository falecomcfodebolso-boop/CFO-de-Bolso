export type TipoNegocio =
  | "holding_patrimonial"
  | "operacional_comercio"
  | "operacional_servicos"
  | "operacional_industria"
  | "investimentos"
  | "outro";

export type PerfilEmpresa = {
  tipoNegocio: TipoNegocio;
  tipoNegocioOutro?: string;
  atividades: string;
  temCarteiraInvestimentos: boolean;
  temImoveis: boolean;
  temFuncionarios: boolean;
  moeda: string;
};

export type Natureza = "ATIVO" | "PASSIVO" | "PL" | "RECEITA" | "DESPESA";

export type ContaProposta = {
  code: string;
  name: string;
  natureza: Natureza;
  motivo?: string;
};

const TIPO_LABEL: Record<TipoNegocio, string> = {
  holding_patrimonial: "Holding patrimonial (não opera, só detém participações/ativos)",
  operacional_comercio: "Empresa operacional — comércio/varejo",
  operacional_servicos: "Empresa operacional — prestação de serviços",
  operacional_industria: "Empresa operacional — indústria/manufatura",
  investimentos: "Veículo de investimentos financeiros (sem operação comercial)",
  outro: "Outro",
};

// ---------------------------------------------------------------------
// Modelo base (fallback) — usado quando ANTHROPIC_API_KEY não está
// configurada. Não é personalizado por IA, mas já é um plano de contas
// completo e coerente com o tipo de negócio + as flags do formulário,
// para que a funcionalidade seja útil mesmo sem a chave.
// ---------------------------------------------------------------------
function planoBase(perfil: PerfilEmpresa): ContaProposta[] {
  const contas: ContaProposta[] = [
    { code: "1.1.001", name: "Caixa", natureza: "ATIVO" },
    { code: "1.1.002", name: "Bancos — Conta Corrente", natureza: "ATIVO" },
    { code: "3.1.001", name: "Capital Social", natureza: "PL" },
    { code: "3.2.001", name: "Lucros ou Prejuízos Acumulados", natureza: "PL" },
    { code: "5.1.001", name: "Despesas Administrativas Gerais", natureza: "DESPESA" },
    { code: "5.1.002", name: "Despesas Bancárias e Tarifas", natureza: "DESPESA" },
    { code: "5.2.001", name: "Despesas Financeiras e Juros Passivos", natureza: "DESPESA" },
  ];

  const isOperacional =
    perfil.tipoNegocio === "operacional_comercio" ||
    perfil.tipoNegocio === "operacional_servicos" ||
    perfil.tipoNegocio === "operacional_industria";

  if (isOperacional) {
    contas.push(
      { code: "1.2.001", name: "Contas a Receber de Clientes", natureza: "ATIVO" },
      { code: "2.1.001", name: "Fornecedores a Pagar", natureza: "PASSIVO" },
      { code: "2.1.002", name: "Impostos e Contribuições a Recolher", natureza: "PASSIVO" },
      { code: "4.1.001", name: "Receita de Vendas/Serviços", natureza: "RECEITA" },
      { code: "5.1.003", name: "Impostos sobre Vendas/Serviços", natureza: "DESPESA" }
    );
  }

  if (perfil.tipoNegocio === "operacional_comercio" || perfil.tipoNegocio === "operacional_industria") {
    contas.push(
      { code: "1.2.002", name: "Estoques", natureza: "ATIVO" },
      { code: "5.1.004", name: "Custo das Mercadorias/Produtos Vendidos (CMV/CPV)", natureza: "DESPESA" }
    );
  }

  if (perfil.temCarteiraInvestimentos || perfil.tipoNegocio === "investimentos" || perfil.tipoNegocio === "holding_patrimonial") {
    contas.push(
      { code: "1.3.001", name: "Aplicações Financeiras — Renda Fixa", natureza: "ATIVO" },
      { code: "1.3.002", name: "Aplicações Financeiras — Fundos/Renda Variável", natureza: "ATIVO" },
      { code: "1.3.003", name: "Juros e Rendimentos a Receber", natureza: "ATIVO" },
      { code: "4.2.001", name: "Receitas Financeiras — Juros e Rendimentos", natureza: "RECEITA" },
      { code: "4.2.002", name: "Ganhos com Aplicações Financeiras", natureza: "RECEITA" }
    );
  }

  if (perfil.tipoNegocio === "holding_patrimonial") {
    contas.push(
      { code: "1.4.001", name: "Participações Societárias", natureza: "ATIVO" },
      { code: "4.2.003", name: "Receita de Dividendos/Lucros Recebidos", natureza: "RECEITA" }
    );
  }

  if (perfil.temImoveis) {
    contas.push(
      { code: "1.5.001", name: "Imóveis", natureza: "ATIVO" },
      { code: "1.5.002", name: "Depreciação Acumulada de Imóveis", natureza: "ATIVO" },
      { code: "4.3.001", name: "Receita de Aluguéis", natureza: "RECEITA" },
      { code: "5.3.001", name: "Despesas com Manutenção de Imóveis e Condomínio", natureza: "DESPESA" },
      { code: "5.3.002", name: "IPTU e Taxas sobre Imóveis", natureza: "DESPESA" }
    );
  }

  if (perfil.temFuncionarios) {
    contas.push(
      { code: "2.2.001", name: "Salários e Ordenados a Pagar", natureza: "PASSIVO" },
      { code: "2.2.002", name: "Obrigações Trabalhistas (FGTS/INSS/Férias)", natureza: "PASSIVO" },
      { code: "5.4.001", name: "Despesas com Pessoal — Salários e Encargos", natureza: "DESPESA" }
    );
  }

  return contas;
}

const SYSTEM_PROMPT = `Você é um contador que estrutura o plano de contas inicial de uma empresa que nunca teve
contabilidade organizada. Gere um plano de contas completo e coerente para o perfil descrito, seguindo
o padrão contábil brasileiro (partida dobrada, natureza ATIVO/PASSIVO/PL/RECEITA/DESPESA).

Responda SOMENTE com um array JSON, sem nenhum texto antes ou depois, no formato exato:
[{"code":"1.1.001","name":"Caixa","natureza":"ATIVO","motivo":"conta básica de caixa"}, ...]

Regras:
- "code" segue o padrão N.G.SSS onde N é 1=Ativo, 2=Passivo, 3=Patrimônio Líquido, 4=Receita, 5=Despesa;
  G é um grupo (1, 2, 3...) dentro da natureza; SSS é um número sequencial de 3 dígitos dentro do grupo.
- Gere entre 18 e 35 contas — nem genérico demais, nem excessivamente detalhado para uma estruturação inicial.
- Contas devem ser específicas ao perfil descrito (ex: se a empresa vende produtos, inclua Estoques e CMV; se
  é uma holding com carteira, inclua Aplicações Financeiras e Participações Societárias; etc).
- Sempre inclua pelo menos: Caixa/Bancos, Capital Social, Lucros/Prejuízos Acumulados.
- "motivo" é uma frase curta (menos de 12 palavras) explicando por que essa conta foi incluída para este perfil.
- Nomes de conta em português, claros e específicos (evite nomes genéricos demais como "Outras Despesas").`;

function extrairJsonArray(texto: string): unknown {
  const inicio = texto.indexOf("[");
  const fim = texto.lastIndexOf("]");
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error("Resposta do modelo não continha um array JSON.");
  }
  return JSON.parse(texto.slice(inicio, fim + 1));
}

function descreverPerfil(perfil: PerfilEmpresa): string {
  const tipo = perfil.tipoNegocio === "outro" ? perfil.tipoNegocioOutro || "Outro" : TIPO_LABEL[perfil.tipoNegocio];
  return [
    `Tipo de negócio: ${tipo}`,
    `Principais atividades: ${perfil.atividades || "não informado"}`,
    `Tem carteira de investimentos financeiros? ${perfil.temCarteiraInvestimentos ? "Sim" : "Não"}`,
    `Tem imóveis? ${perfil.temImoveis ? "Sim" : "Não"}`,
    `Tem funcionários (folha de pagamento)? ${perfil.temFuncionarios ? "Sim" : "Não"}`,
    `Moeda base: ${perfil.moeda}`,
  ].join("\n");
}

const NATUREZAS_VALIDAS = new Set<Natureza>(["ATIVO", "PASSIVO", "PL", "RECEITA", "DESPESA"]);

export async function gerarPlanoDeContas(
  perfil: PerfilEmpresa
): Promise<{ contas: ContaProposta[]; modoDemo: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { contas: planoBase(perfil), modoDemo: true };
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: descreverPerfil(perfil) }],
      }),
    });

    if (!resp.ok) throw new Error(`Anthropic API error: ${resp.status}`);

    const json = await resp.json();
    const texto = json.content?.[0]?.text ?? "";
    const parsed = extrairJsonArray(texto) as ContaProposta[];

    const validas = parsed.filter(
      (c) =>
        c &&
        typeof c.code === "string" &&
        /^\d\.\d+\.\d{3}$/.test(c.code) &&
        typeof c.name === "string" &&
        c.name.trim().length > 0 &&
        NATUREZAS_VALIDAS.has(c.natureza)
    );

    if (validas.length === 0) throw new Error("Nenhuma conta válida na resposta do modelo.");
    return { contas: validas, modoDemo: false };
  } catch {
    // Se a IA falhar por qualquer motivo, cai para o modelo base em vez
    // de deixar o usuário sem nada.
    return { contas: planoBase(perfil), modoDemo: true };
  }
}
