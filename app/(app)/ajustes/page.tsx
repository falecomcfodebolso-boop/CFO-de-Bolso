import { requireOrgContext, canWrite } from "@/lib/org";
import { deleteAjusteAction } from "./actions";
import { LancarAjusteButton } from "./lancar-ajuste-button";
import { NovoAjusteForm } from "./novo-ajuste-form";
import { fmtMoney, fmtDate } from "@/lib/format";
import { calcularAcruoInterno, CATEGORIA_ACRUO_LABEL, type AtivoAcruo } from "@/lib/accounting/acruo";
import { getSaldosPorContaAteData } from "@/lib/accounting/queries";
import { getIntervaloDeLancamentos, resolverDataReferencia } from "@/lib/accounting/data-referencia";
import { NovaMarcacaoForm } from "./nova-marcacao-form";
import { LancarMarcacaoButton } from "./lancar-marcacao-button";
import { deleteMarcacaoAction } from "./marcacao-actions";
import Link from "next/link";
import { Upload } from "lucide-react";

/** Soma o saldo contábil de uma lista de contas separadas por vírgula (pools compartilhados). */
function somarSaldo(saldos: { conta_code: string; saldo: number }[], codigos: string): number {
  return codigos
    .split(",")
    .map((c) => c.trim())
    .reduce((acc, c) => acc + Number(saldos.find((s) => s.conta_code === c)?.saldo ?? 0), 0);
}

export default async function AjustesPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const podeEscrever = canWrite(currentMembership.role);
  const { data: dataParam } = await searchParams;

  const [
    { data: contasData },
    { data: ativosData },
    { data: ajustesData },
    { data: ativosMercadoData },
    { data: marcacoesData },
    intervalo,
  ] = await Promise.all([
    supabase.from("plano_de_contas").select("code, name").eq("org_id", currentOrgId).order("code"),
    supabase
      .from("ativos")
      .select(
        "id, nome, valor_face, taxa_cupom, categoria_acruo, tipo_taxa, spread_taxa, taxa_referencia_atual, indice_referencia, data_pagamento_anterior, data_inicio_acruo, pendente_custodiante, conta_acruo_code, conta_receita_code, grupo_acruo_nome"
      )
      .eq("org_id", currentOrgId)
      .not("grupo_acruo_nome", "is", null)
      .order("grupo_acruo_nome")
      .order("nome"),
    supabase
      .from("ajustes_acruo")
      .select("*")
      .eq("org_id", currentOrgId)
      .order("data_base", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("ativos")
      .select("id, nome, conta_code, conta_ganho_perda_mercado_code")
      .eq("org_id", currentOrgId)
      .eq("categoria_acruo", "mercado")
      .order("nome"),
    supabase
      .from("ajustes_marcacao_mercado")
      .select("*")
      .eq("org_id", currentOrgId)
      .order("data_base", { ascending: false })
      .order("created_at", { ascending: false }),
    getIntervaloDeLancamentos(supabase, currentOrgId),
  ]);

  const contas = contasData ?? [];
  const ativos = (ativosData ?? []) as AtivoAcruo[];
  const ajustes = ajustesData ?? [];
  const ativosMercado = ativosMercadoData ?? [];
  const marcacoes = marcacoesData ?? [];

  const hoje = new Date().toISOString().slice(0, 10);
  const dataEscolhida = dataParam || hoje;
  const { data: dataRef, ajustada: dataAjustada, dataOriginal } = resolverDataReferencia(dataEscolhida, intervalo);
  // "Contábil atual" precisa refletir o saldo tal como estava na data-base do fechamento
  // sendo comparado (ex.: 31/08), não o saldo "ao vivo" de hoje — senão, ao consultar um
  // mês fechado depois de já termos lançamentos de meses seguintes, o valor mostrado deixa
  // de ser o que estava contabilizado naquele fechamento.
  const saldos = await getSaldosPorContaAteData(supabase, currentOrgId, dataRef);

  // Agrupa os ativos cadastrados por grupo de acruo, calculando o cálculo interno papel a
  // papel de cada um na data de referência selecionada (padrão: hoje) e o subtotal do grupo.
  const grupos = new Map<
    string,
    { contaAcruo: string; contaReceita: string; itens: (AtivoAcruo & { dias: number | null; valorCalc: number | null })[] }
  >();
  for (const a of ativos) {
    if (!a.grupo_acruo_nome || !a.conta_acruo_code || !a.conta_receita_code) continue;
    const r = calcularAcruoInterno(a, dataRef);
    if (!grupos.has(a.grupo_acruo_nome)) {
      grupos.set(a.grupo_acruo_nome, { contaAcruo: a.conta_acruo_code, contaReceita: a.conta_receita_code, itens: [] });
    }
    grupos.get(a.grupo_acruo_nome)!.itens.push({ ...a, dias: r.dias, valorCalc: r.valor });
  }

  const gruposParaForm = Array.from(grupos.entries()).map(([nome, g]) => ({
    nome,
    contaAcruo: g.contaAcruo,
    contaReceita: g.contaReceita,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Ajustes de Acruamento</h1>
          <p className="text-sm text-slate-500 mt-1">
            Reconhecimento de receitas e despesas acruadas — compare o saldo já lançado na
            contabilidade com o valor informado pelo extrato/valuation statement do banco ou
            custodiante e, opcionalmente, com o cálculo interno papel a papel. Depois de revisar e
            aprovar, o lançamento de ajuste (variação do acruo) é gerado com um clique.
          </p>
        </div>
        {podeEscrever && (
          <Link
            href="/ajustes/importar"
            className="shrink-0 inline-flex items-center gap-1.5 text-sm bg-slate-900 text-white rounded-md px-3 py-2 hover:bg-slate-800"
          >
            <Upload className="h-4 w-4" />
            Importar de PDF
          </Link>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 space-y-2">
        <p className="font-medium text-slate-700">Política de reconhecimento adotada</p>
        <p>
          O valor reportado pelo banco/custodiante na data-base é a fonte oficial do acruo — é ele
          que é registrado na contabilidade (não o cálculo interno). Registrar uma apuração só grava
          os números para revisão; o lançamento reflete a <strong>variação</strong> do acruo no
          período (diferença entre o saldo contábil na própria data-base e o valor informado pelo
          extrato) e só é gerado quando o responsável revisa e aprova, clicando em
          &ldquo;Lançar no Diário&rdquo; na tabela de histórico abaixo.
        </p>
        <p>
          O cálculo interno (30/360) é calculado papel a papel a partir do cadastro de cada Ativo e
          somado por grupo, apenas para comparação/justificativa da política. Papéis com cronograma
          de cupom periódico acruam desde o último pagamento; CLNs sem cronograma (acruo contínuo)
          acruam desde a data de início da aplicação. Em ambos os casos o valor é só uma referência —
          quem é lançado na contabilidade, depois da aprovação, é sempre o valor informado pelo
          extrato do banco/custodiante.
        </p>
      </div>

      {grupos.size > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Detalhamento por papel{" "}
              <span className="font-normal text-slate-400">
                (referência: {new Date(`${dataRef}T00:00:00Z`).toLocaleDateString("pt-BR")})
              </span>
            </h2>
            <form method="get" className="flex items-end gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Data de referência</label>
                <input
                  type="date"
                  name="data"
                  defaultValue={dataRef}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800"
              >
                Atualizar
              </button>
            </form>
          </div>
          <p className="text-xs text-slate-400 -mt-2">
            Use a data de referência acima para comparar com um extrato de uma data específica (ex.: a
            data-base do valuation statement do banco). &ldquo;Informado pelo banco&rdquo; mostra o valor da
            apuração registrada para essa data — ou, na falta dela, a apuração mais recente registrada em ou
            antes dessa data (veja &ldquo;Nova apuração&rdquo; abaixo).
          </p>
          {dataAjustada && dataOriginal && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-3">
              Não há lançamentos contábeis para {fmtDate(dataOriginal)}
              {dataOriginal > dataRef
                ? " (é depois do último lançamento registrado)"
                : " (é antes do primeiro lançamento registrado)"}
              . Mostrando o {dataOriginal > dataRef ? "último" : "primeiro"} período disponível:{" "}
              <strong>{fmtDate(dataRef)}</strong>.
            </div>
          )}
          {Array.from(grupos.entries()).map(([nomeGrupo, g]) => {
            const subtotal = g.itens.reduce((acc, i) => acc + (i.valorCalc ?? 0), 0);
            const itensPendentes = g.itens.filter((i) => i.pendente_custodiante);
            const itensConfirmados = g.itens.filter((i) => !i.pendente_custodiante);
            const temPendentes = itensPendentes.length > 0;
            const subtotalPendente = itensPendentes.reduce((acc, i) => acc + (i.valorCalc ?? 0), 0);
            const subtotalConfirmado = itensConfirmados.reduce((acc, i) => acc + (i.valorCalc ?? 0), 0);
            const saldoContabilAtual = somarSaldo(saldos, g.contaAcruo);
            // Prioriza a apuração registrada exatamente na data de referência escolhida; na
            // falta dela, usa a mais recente registrada em ou antes dessa data (ajustes já vêm
            // ordenados por data_base decrescente).
            const ajustesGrupo = ajustes.filter((a) => a.nome_grupo === nomeGrupo);
            const ultimoAjuste =
              ajustesGrupo.find((a) => a.data_base === dataRef) ?? ajustesGrupo.find((a) => a.data_base <= dataRef) ?? null;
            // Ao comparar com o banco, usa só as posições já confirmadas pelo custodiante — as
            // "pending receipt" ainda não têm valor reportado, então entrariam como diferença
            // artificial de 100% se somadas ao lado do cálculo.
            const baseCalculoParaComparar = temPendentes ? subtotalConfirmado : subtotal;
            const diferencaCalcBanco =
              ultimoAjuste != null
                ? Math.round((baseCalculoParaComparar - ultimoAjuste.valor_reportado_banco) * 100) / 100
                : null;
            const bate = diferencaCalcBanco != null && Math.abs(diferencaCalcBanco) < 0.01;
            return (
              <div key={nomeGrupo} className="rounded-lg border border-slate-200 overflow-x-auto">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-700 flex items-baseline justify-between">
                  <span>{nomeGrupo}</span>
                  <span className="text-xs text-slate-400 font-normal">
                    conta(s): {g.contaAcruo} · receita: {g.contaReceita}
                  </span>
                </div>
                <div className="px-3 py-2.5 border-b border-slate-200 bg-white grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <div className="text-[11px] uppercase text-slate-400">Contábil atual</div>
                    <div className="text-sm font-medium text-slate-700">{fmtMoney(saldoContabilAtual)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-slate-400">
                      Calculado (interno, 30/360){temPendentes ? " — confirmados" : ""}
                    </div>
                    <div className="text-sm font-medium text-slate-700">{fmtMoney(baseCalculoParaComparar)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-slate-400">
                      Informado pelo banco
                      {ultimoAjuste && (
                        <> ({new Date(`${ultimoAjuste.data_base}T00:00:00Z`).toLocaleDateString("pt-BR")})</>
                      )}
                    </div>
                    <div className="text-sm font-medium text-slate-700">
                      {ultimoAjuste ? fmtMoney(ultimoAjuste.valor_reportado_banco) : "— (nenhuma apuração registrada)"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-slate-400">Diferença (calculado vs. banco)</div>
                    <div className={`text-sm font-medium ${diferencaCalcBanco == null ? "text-slate-400" : bate ? "text-emerald-700" : "text-amber-700"}`}>
                      {diferencaCalcBanco != null ? fmtMoney(diferencaCalcBanco) : "—"}
                    </div>
                  </div>
                  {temPendentes && (
                    <div className="col-span-2 sm:col-span-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-0.5">
                      <span>
                        {itensPendentes.length} posição(ões) &ldquo;pending receipt&rdquo; no custodiante — estimativa
                        30/360 de {fmtMoney(subtotalPendente)}, sem valor do banco para comparar (não entra na
                        diferença acima).
                      </span>
                    </div>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead className="text-slate-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-3 py-2">Papel</th>
                      <th className="text-left px-3 py-2">Categoria</th>
                      <th className="text-right px-3 py-2">Valor Face</th>
                      <th className="text-right px-3 py-2">Taxa</th>
                      <th className="text-right px-3 py-2">Dias</th>
                      <th className="text-right px-3 py-2">Cálculo Interno</th>
                      <th className="text-left px-3 py-2">Obs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.itens.map((i) => {
                      const taxaEfetiva =
                        i.tipo_taxa === "flutuante"
                          ? (i.taxa_referencia_atual ?? 0) + (i.spread_taxa ?? 0)
                          : i.taxa_cupom;
                      return (
                        <tr key={i.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">{i.nome}</td>
                          <td className="px-3 py-2 text-slate-500">
                            {i.categoria_acruo ? CATEGORIA_ACRUO_LABEL[i.categoria_acruo] : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">{i.valor_face != null ? fmtMoney(i.valor_face) : "—"}</td>
                          <td className="px-3 py-2 text-right">
                            {taxaEfetiva != null ? `${(taxaEfetiva * 100).toFixed(3)}%` : "—"}
                            {i.tipo_taxa === "flutuante" && (
                              <span className="text-xs text-slate-400"> ({i.indice_referencia})</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{i.dias ?? "—"}</td>
                          <td className="px-3 py-2 text-right font-medium">
                            {i.valorCalc != null ? fmtMoney(i.valorCalc) : "— (usa extrato)"}
                          </td>
                          <td className="px-3 py-2 text-slate-400 text-xs">
                            {i.pendente_custodiante ? "Pending no custodiante" : ""}
                          </td>
                        </tr>
                      );
                    })}
                    {temPendentes && (
                      <>
                        <tr className="border-t border-slate-200 bg-slate-50 text-slate-600">
                          <td className="px-3 py-2" colSpan={5}>
                            Subtotal — confirmados pelo custodiante
                          </td>
                          <td className="px-3 py-2 text-right">{fmtMoney(subtotalConfirmado)}</td>
                          <td></td>
                        </tr>
                        <tr className="bg-amber-50 text-amber-700">
                          <td className="px-3 py-2" colSpan={5}>
                            Subtotal — pending receipt (sem valor do custodiante)
                          </td>
                          <td className="px-3 py-2 text-right">{fmtMoney(subtotalPendente)}</td>
                          <td></td>
                        </tr>
                      </>
                    )}
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                      <td className="px-3 py-2" colSpan={5}>
                        Subtotal {nomeGrupo}
                      </td>
                      <td className="px-3 py-2 text-right">{fmtMoney(subtotal)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {podeEscrever && (
        <div className="rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Nova apuração</h2>
          <NovoAjusteForm contas={contas} grupos={gruposParaForm} dataBasePadrao={dataRef} />
        </div>
      )}

      <div className="rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Data-base</th>
              <th className="text-left px-3 py-2">Grupo</th>
              <th className="text-left px-3 py-2">Conta de acruo</th>
              <th className="text-right px-3 py-2">Contábil (antes)</th>
              <th className="text-right px-3 py-2">Banco/extrato</th>
              <th className="text-right px-3 py-2">Cálculo interno</th>
              <th className="text-right px-3 py-2">Diferença</th>
              <th className="text-left px-3 py-2">Fonte</th>
              <th className="text-right px-3 py-2">Status</th>
              {podeEscrever && <th></th>}
            </tr>
          </thead>
          <tbody>
            {ajustes.length === 0 && (
              <tr>
                <td colSpan={podeEscrever ? 10 : 9} className="px-3 py-6 text-center text-slate-400">
                  Nenhuma apuração de acruamento registrada ainda.
                </td>
              </tr>
            )}
            {ajustes.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{new Date(`${a.data_base}T00:00:00Z`).toLocaleDateString("pt-BR")}</td>
                <td className="px-3 py-2">{a.nome_grupo}</td>
                <td className="px-3 py-2 text-slate-500">{a.conta_acruo_code}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(a.saldo_contabil_antes)}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(a.valor_reportado_banco)}</td>
                <td className="px-3 py-2 text-right text-slate-500">
                  {a.acruo_calculado_interno != null ? fmtMoney(a.acruo_calculado_interno) : "—"}
                </td>
                <td className={`px-3 py-2 text-right font-medium ${a.diferenca >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {fmtMoney(a.diferenca)}
                </td>
                <td className="px-3 py-2 text-slate-500">{a.fonte || "—"}</td>
                <td className="px-3 py-2 text-right">
                  {a.lancamento_id ? (
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      Lançado
                    </span>
                  ) : Math.abs(a.diferenca) < 0.01 ? (
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                      Sem diferença
                    </span>
                  ) : podeEscrever ? (
                    <LancarAjusteButton id={a.id} />
                  ) : (
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                      Pendente de lançamento
                    </span>
                  )}
                </td>
                {podeEscrever && (
                  <td className="px-3 py-2 text-right">
                    <form action={deleteAjusteAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        excluir
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pt-4 border-t border-slate-200 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Marcação a Mercado — Fundos de Renda Variável</h2>
          <p className="text-sm text-slate-500 mt-1">
            Fundos e posições sem cronograma de cupom (Pimco, Vanguard SP 500, Oaktree, CP Note GLD) não
            geram juros acruado — o valor contábil é o próprio principal, marcado a mercado contra o
            relatório/valuation statement do custodiante. Mesmo fluxo em dois passos: registrar a
            apuração e só gerar o lançamento (contra a conta de ganho/perda dedicada de cada fundo)
            depois de aprovar em &ldquo;Lançar no Diário&rdquo;.
          </p>
        </div>

        {ativosMercado.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ativosMercado.map((a) => {
              const contabilAtual = Number(saldos.find((s) => s.conta_code === a.conta_code)?.saldo ?? 0);
              const marcacoesAtivo = marcacoes.filter((m) => m.ativo_id === a.id);
              const ultimaMarcacao =
                marcacoesAtivo.find((m) => m.data_base === dataRef) ??
                marcacoesAtivo.find((m) => m.data_base <= dataRef) ??
                null;
              const diferenca = ultimaMarcacao
                ? Math.round((ultimaMarcacao.valor_reportado_mercado - contabilAtual) * 100) / 100
                : null;
              return (
                <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-sm font-medium text-slate-800 mb-2">{a.nome}</div>
                  <div className="text-[11px] uppercase text-slate-400">Contábil atual</div>
                  <div className="text-sm font-medium text-slate-700 mb-1.5">{fmtMoney(contabilAtual)}</div>
                  <div className="text-[11px] uppercase text-slate-400">
                    Informado
                    {ultimaMarcacao && <> ({fmtDate(ultimaMarcacao.data_base)})</>}
                  </div>
                  <div className="text-sm font-medium text-slate-700 mb-1.5">
                    {ultimaMarcacao ? fmtMoney(ultimaMarcacao.valor_reportado_mercado) : "—"}
                  </div>
                  <div className="text-[11px] uppercase text-slate-400">Diferença</div>
                  <div
                    className={`text-sm font-medium ${
                      diferenca == null ? "text-slate-400" : Math.abs(diferenca) < 0.01 ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {diferenca != null ? fmtMoney(diferenca) : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {podeEscrever && (
          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Nova apuração de marcação a mercado</h3>
            <NovaMarcacaoForm ativos={ativosMercado} dataBasePadrao={dataRef} />
          </div>
        )}

        <div className="rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2">Data-base</th>
                <th className="text-left px-3 py-2">Fundo</th>
                <th className="text-right px-3 py-2">Contábil (antes)</th>
                <th className="text-right px-3 py-2">Mercado (relatório)</th>
                <th className="text-right px-3 py-2">Diferença</th>
                <th className="text-left px-3 py-2">Fonte</th>
                <th className="text-right px-3 py-2">Status</th>
                {podeEscrever && <th></th>}
              </tr>
            </thead>
            <tbody>
              {marcacoes.length === 0 && (
                <tr>
                  <td colSpan={podeEscrever ? 8 : 7} className="px-3 py-6 text-center text-slate-400">
                    Nenhuma apuração de marcação a mercado registrada ainda.
                  </td>
                </tr>
              )}
              {marcacoes.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{fmtDate(m.data_base)}</td>
                  <td className="px-3 py-2">{m.nome_ativo}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(m.saldo_contabil_antes)}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(m.valor_reportado_mercado)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${m.diferenca >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {fmtMoney(m.diferenca)}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{m.fonte || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {m.lancamento_id ? (
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                        Lançado
                      </span>
                    ) : Math.abs(m.diferenca) < 0.01 ? (
                      <span className="text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                        Sem diferença
                      </span>
                    ) : podeEscrever ? (
                      <LancarMarcacaoButton id={m.id} />
                    ) : (
                      <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                        Pendente de lançamento
                      </span>
                    )}
                  </td>
                  {podeEscrever && (
                    <td className="px-3 py-2 text-right">
                      <form action={deleteMarcacaoAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <button type="submit" className="text-xs text-red-600 hover:underline">
                          excluir
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
