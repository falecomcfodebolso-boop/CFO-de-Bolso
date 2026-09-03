import { requireOrgContext, canWrite } from "@/lib/org";
import { deleteAjusteAction } from "./actions";
import { NovoAjusteForm } from "./novo-ajuste-form";
import { fmtMoney } from "@/lib/format";
import { calcularAcruoInterno, CATEGORIA_ACRUO_LABEL, type AtivoAcruo } from "@/lib/accounting/acruo";
import { getSaldosPorConta } from "@/lib/accounting/queries";

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

  const [{ data: contasData }, { data: ativosData }, { data: ajustesData }, saldos] = await Promise.all([
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
    getSaldosPorConta(supabase, currentOrgId),
  ]);

  const contas = contasData ?? [];
  const ativos = (ativosData ?? []) as AtivoAcruo[];
  const ajustes = ajustesData ?? [];

  const hoje = new Date().toISOString().slice(0, 10);
  const dataRef = dataParam || hoje;

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
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Ajustes de Acruamento</h1>
        <p className="text-sm text-slate-500 mt-1">
          Reconhecimento de receitas e despesas acruadas — compare o saldo já lançado na
          contabilidade com o valor informado pelo extrato/valuation statement do banco ou
          custodiante e, opcionalmente, com o cálculo interno papel a papel, gerando
          automaticamente o lançamento de ajuste (variação do acruo) quando houver diferença.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 space-y-2">
        <p className="font-medium text-slate-700">Política de reconhecimento adotada</p>
        <p>
          O valor reportado pelo banco/custodiante na data-base é a fonte oficial do acruo — é ele
          que é registrado na contabilidade (não o cálculo interno). O lançamento gerado reflete a
          <strong> variação</strong> do acruo no período (diferença entre o saldo contábil atual da
          conta de acruo e o valor informado pelo extrato).
        </p>
        <p>
          O cálculo interno (30/360) é calculado papel a papel a partir do cadastro de cada Ativo e
          somado por grupo, apenas para comparação/justificativa da política. Papéis com cronograma
          de cupom periódico acruam desde o último pagamento; CLNs sem cronograma (acruo contínuo)
          acruam desde a data de início da aplicação. Em ambos os casos o valor é só uma referência —
          quem é lançado na contabilidade é sempre o valor informado pelo extrato do banco/custodiante.
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
              <th className="text-right px-3 py-2">Diferença lançada</th>
              <th className="text-left px-3 py-2">Fonte</th>
              {podeEscrever && <th></th>}
            </tr>
          </thead>
          <tbody>
            {ajustes.length === 0 && (
              <tr>
                <td colSpan={podeEscrever ? 9 : 8} className="px-3 py-6 text-center text-slate-400">
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
    </div>
  );
}
