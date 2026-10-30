import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLOSING_BALANCE_ITAU_REGEX,
  detectarTipoArquivo,
  extrairTextoPdf,
  parseArquivo,
  parseValorFlexivel,
  ParseError,
  type TipoArquivoImportacao,
  type TransacaoExtraida,
} from "@/lib/import/parsers";
import { sugerirClassificacoes } from "@/lib/import/classify";
import { sugerirClassificacaoCupomAcruo } from "@/lib/accounting/detectar-cupom-acruo";
import { montarPropostasAcruoEMercado } from "@/lib/accounting/montar-propostas-acruo";
import { getBalanco } from "@/lib/accounting/demonstrativos";
import { getSaldosPorContaAteData } from "@/lib/accounting/queries";
import { fmtDateNumerica } from "@/lib/format";

// =====================================================================
// Processamento automático de um extrato (sem usuário logado).
//
// Regra de ouro: TUDO OU NADA. O arquivo só vira lançamento no Diário se
// TODAS as transações tiverem conta sugerida com confiança alta, nenhuma
// parecer duplicada e o arquivo não trouxer nada que exija revisão manual
// (apurações de acruamento, marcação a mercado). Depois de lançar, ainda
// confere o Balanço (Ativo = Passivo + PL) e, quando o extrato declara o
// saldo final, se o saldo contábil da conta bancária bate com ele — se
// qualquer conferência falhar, desfaz todos os lançamentos criados.
//
// Quando algo precisa de revisão, o lote fica salvo como "pendente" na
// tela /importar/[loteId], exatamente como numa importação manual.
// =====================================================================

export type Pendencia = { tipo: string; mensagem: string };

export type ResultadoProcessamento = {
  status: "sucesso" | "revisar" | "erro";
  loteId?: string;
  totalTransacoes: number;
  lancamentosCriados: number;
  periodoInicio?: string;
  periodoFim?: string;
  pendencias: Pendencia[];
};

const TOLERANCIA = 0.01;

function primeiroDiaDoMes(data: string) {
  return `${data.slice(0, 7)}-01`;
}

function ultimoDiaDoMes(data: string) {
  const [ano, mes] = data.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes, 0));
  return d.toISOString().slice(0, 10);
}

function extrairSaldoFinalDeclarado(texto: string): number | null {
  for (const linha of texto.split(/\r?\n/).map((l) => l.trim())) {
    const m = linha.match(CLOSING_BALANCE_ITAU_REGEX);
    if (m) return parseValorFlexivel(m[1]);
  }
  return null;
}

/** Mesma regra da tela de importação: mesma data, mesma conta bancária e mesmo valor = provável duplicata. */
async function encontrarLancamentoDuplicado(
  supabase: SupabaseClient,
  orgId: string,
  data: string,
  contaCode: string,
  valor: number
): Promise<number | null> {
  const { data: lancsNaData } = await supabase
    .from("lancamentos")
    .select("id, numero")
    .eq("org_id", orgId)
    .eq("data", data);
  if (!lancsNaData || lancsNaData.length === 0) return null;
  const { data: linhaIgual } = await supabase
    .from("lancamento_linhas")
    .select("lancamento_id")
    .eq("org_id", orgId)
    .eq("conta_code", contaCode)
    .eq("valor", valor)
    .in(
      "lancamento_id",
      lancsNaData.map((l) => l.id)
    )
    .limit(1)
    .maybeSingle();
  if (!linhaIgual) return null;
  return lancsNaData.find((l) => l.id === linhaIgual.lancamento_id)?.numero ?? null;
}

async function desfazerLancamentos(supabase: SupabaseClient, orgId: string, loteId: string, lancamentoIds: string[]) {
  if (lancamentoIds.length === 0) return;
  await supabase.from("lancamentos").delete().eq("org_id", orgId).in("id", lancamentoIds);
  await supabase
    .from("import_transacoes")
    .update({ status: "pendente", conta_confirmada: null, lancamento_id: null })
    .eq("org_id", orgId)
    .eq("lote_id", loteId);
}

export async function processarArquivoAutomatico(
  supabase: SupabaseClient,
  args: { orgId: string; contaBancariaCode: string; nomeArquivo: string; buffer: ArrayBuffer }
): Promise<ResultadoProcessamento> {
  const { orgId, contaBancariaCode, nomeArquivo, buffer } = args;
  const pendencias: Pendencia[] = [];
  const vazio = { totalTransacoes: 0, lancamentosCriados: 0 };

  const tipo = detectarTipoArquivo(nomeArquivo);
  if (!tipo) {
    return {
      status: "erro",
      ...vazio,
      pendencias: [{ tipo: "formato", mensagem: "Formato não reconhecido (envie .ofx, .csv, .xls/.xlsx ou .pdf)." }],
    };
  }

  // 1) Leitura do extrato
  let transacoes: TransacaoExtraida[] = [];
  try {
    transacoes = await parseArquivo(tipo as TipoArquivoImportacao, buffer);
  } catch (e) {
    const msg = e instanceof ParseError ? e.message : `Não consegui ler o arquivo: ${(e as Error).message}`;
    return { status: "erro", ...vazio, pendencias: [{ tipo: "leitura", mensagem: msg }] };
  }

  let saldoFinalDeclarado: number | null = null;
  if (tipo === "pdf") {
    // Statements de custódia podem trazer acruamento / marcação a mercado — isso não é
    // lançado automaticamente (exige escolha de conta e conferência com o banco).
    const acruo = await montarPropostasAcruoEMercado(supabase, orgId, buffer);
    if (!acruo.error) {
      const nAcruo = acruo.propostas?.length ?? 0;
      const nMercado = acruo.propostasMercado?.length ?? 0;
      if (nAcruo > 0 || nMercado > 0) {
        pendencias.push({
          tipo: "acruamento",
          mensagem: `O extrato traz ${nAcruo} apuração(ões) de juros acruados e ${nMercado} marcação(ões) a mercado — importe este arquivo em Ajustes para revisar e lançar.`,
        });
      }
    }
    try {
      saldoFinalDeclarado = extrairSaldoFinalDeclarado(await extrairTextoPdf(buffer));
    } catch {
      saldoFinalDeclarado = null;
    }
  }

  if (transacoes.length === 0) {
    if (pendencias.length > 0) return { status: "revisar", ...vazio, pendencias };
    return {
      status: "erro",
      ...vazio,
      pendencias: [{ tipo: "leitura", mensagem: "Nenhuma transação de caixa encontrada no arquivo." }],
    };
  }

  const datas = transacoes.map((t) => t.data).sort();
  const periodoInicio = primeiroDiaDoMes(datas[0]);
  const periodoFim = ultimoDiaDoMes(datas[datas.length - 1]);
  const base = { totalTransacoes: transacoes.length, periodoInicio, periodoFim };

  // 2) Lote + transações + sugestões de conta (mesmo fluxo da tela /importar)
  const { data: contas, error: contasError } = await supabase
    .from("plano_de_contas")
    .select("code, name, natureza")
    .eq("org_id", orgId)
    .neq("code", contaBancariaCode);
  if (contasError) throw contasError;

  const { data: lote, error: loteError } = await supabase
    .from("import_lotes")
    .insert({
      org_id: orgId,
      conta_bancaria_code: contaBancariaCode,
      nome_arquivo: nomeArquivo,
      tipo_arquivo: tipo,
      total_transacoes: transacoes.length,
    })
    .select("id")
    .single();
  if (loteError) throw loteError;
  const loteId: string = lote.id;

  const { data: inseridas, error: insertError } = await supabase
    .from("import_transacoes")
    .insert(
      transacoes.map((t) => ({ org_id: orgId, lote_id: loteId, data: t.data, descricao: t.descricao, valor: t.valor }))
    )
    .select("id");
  if (insertError) throw insertError;

  const sugestoesCupom = await sugerirClassificacaoCupomAcruo(transacoes, supabase, orgId);
  let sugestoesIA: Awaited<ReturnType<typeof sugerirClassificacoes>> = [];
  try {
    sugestoesIA = await sugerirClassificacoes(transacoes, contas ?? []);
  } catch {
    sugestoesIA = [];
  }
  const sugestoes = transacoes.map((_, i) => sugestoesCupom.get(i) ?? sugestoesIA[i] ?? null);

  await Promise.all(
    inseridas.map((row, i) =>
      sugestoes[i]?.conta_code
        ? supabase
            .from("import_transacoes")
            .update({ conta_sugerida: sugestoes[i]!.conta_code, confianca_sugestao: sugestoes[i]!.confianca })
            .eq("id", row.id)
        : Promise.resolve()
    )
  );

  // 3) Validações antes de lançar
  const codigosValidos = new Set((contas ?? []).map((c) => c.code));
  for (let i = 0; i < transacoes.length; i++) {
    const t = transacoes[i];
    const s = sugestoes[i];
    const rotulo = `${fmtDateNumerica(t.data)} · ${t.descricao.slice(0, 60)} · ${t.valor.toFixed(2)}`;
    if (!s?.conta_code || !codigosValidos.has(s.conta_code)) {
      pendencias.push({ tipo: "sem_conta", mensagem: `Sem conta de contrapartida: ${rotulo}` });
    } else if (s.confianca !== "alta") {
      pendencias.push({
        tipo: "confianca",
        mensagem: `Classificação com confiança ${s.confianca ?? "desconhecida"} (${s.conta_code}): ${rotulo}`,
      });
    }
    const dup = await encontrarLancamentoDuplicado(supabase, orgId, t.data, contaBancariaCode, Math.abs(t.valor));
    if (dup !== null) {
      pendencias.push({ tipo: "duplicata", mensagem: `Parece já lançada (lançamento #${dup}): ${rotulo}` });
    }
  }

  if (pendencias.length > 0) {
    return { status: "revisar", loteId, lancamentosCriados: 0, pendencias, ...base };
  }

  // 4) Lançamento — sequencial, para numerar sem colisão
  const { data: maxNumero } = await supabase
    .from("lancamentos")
    .select("numero")
    .eq("org_id", orgId)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  let proximoNumero = (maxNumero?.numero ?? 0) + 1;
  const criados: string[] = [];

  for (let i = 0; i < transacoes.length; i++) {
    const t = transacoes[i];
    const contaCode = sugestoes[i]!.conta_code!;
    const valorAbs = Math.abs(t.valor);
    const entrada = t.valor > 0;
    const { data: lancamentoId, error: rpcError } = await supabase.rpc("create_lancamento", {
      p_org_id: orgId,
      p_numero: proximoNumero,
      p_data: t.data,
      p_historico: t.descricao,
      p_linhas: [
        { conta_code: contaBancariaCode, tipo: entrada ? "D" : "C", valor: valorAbs },
        { conta_code: contaCode, tipo: entrada ? "C" : "D", valor: valorAbs },
      ],
    });
    if (rpcError) {
      await desfazerLancamentos(supabase, orgId, loteId, criados);
      return {
        status: "erro",
        loteId,
        lancamentosCriados: 0,
        pendencias: [{ tipo: "lancamento", mensagem: `Falha ao lançar "${t.descricao.slice(0, 60)}": ${rpcError.message}. Nada foi lançado.` }],
        ...base,
      };
    }
    criados.push(lancamentoId as string);
    await supabase
      .from("import_transacoes")
      .update({ status: "conciliado", conta_confirmada: contaCode, lancamento_id: lancamentoId })
      .eq("id", inseridas[i].id)
      .eq("org_id", orgId);
    proximoNumero++;
  }

  // 5) Conferências depois de lançar
  const erros: Pendencia[] = [];
  const balanco = await getBalanco(supabase, orgId, periodoFim);
  if (Math.abs(balanco.diferenca) >= TOLERANCIA) {
    erros.push({
      tipo: "balanco",
      mensagem: `Balanço não fecha em ${fmtDateNumerica(periodoFim)}: diferença de ${balanco.diferenca.toFixed(2)} entre Ativo e Passivo + PL.`,
    });
  }
  if (saldoFinalDeclarado !== null) {
    const ultimaData = datas[datas.length - 1];
    const saldos = await getSaldosPorContaAteData(supabase, orgId, ultimaData);
    const saldoConta = Number(saldos.find((s) => s.conta_code === contaBancariaCode)?.saldo ?? 0);
    if (Math.abs(saldoConta - saldoFinalDeclarado) >= TOLERANCIA) {
      erros.push({
        tipo: "saldo_banco",
        mensagem: `Saldo contábil da conta ${contaBancariaCode} em ${fmtDateNumerica(ultimaData)} (${saldoConta.toFixed(2)}) não bate com o saldo final do extrato (${saldoFinalDeclarado.toFixed(2)}) — falta lançar algum período anterior ou há lançamento a mais.`,
      });
    }
  }

  if (erros.length > 0) {
    await desfazerLancamentos(supabase, orgId, loteId, criados);
    return {
      status: "erro",
      loteId,
      lancamentosCriados: 0,
      pendencias: [...erros, { tipo: "desfeito", mensagem: "Os lançamentos deste arquivo foram desfeitos; o lote ficou pendente para revisão." }],
      ...base,
    };
  }

  return { status: "sucesso", loteId, lancamentosCriados: criados.length, pendencias: [], ...base };
}
