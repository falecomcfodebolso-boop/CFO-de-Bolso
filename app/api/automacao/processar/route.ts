import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerEmailsNovos, marcarComoLidos, enviarResultado, type EmailRecebido } from "@/lib/automacao/email";
import { processarArquivoAutomatico, type Pendencia, type ResultadoProcessamento } from "@/lib/automacao/processar-arquivo";
import { gerarRelatorioCompleto } from "@/lib/export/relatorio-completo";
import { periodoAnterior } from "@/lib/accounting/analise";
import { extrairTextoPdf } from "@/lib/import/parsers";
import { fmtDateNumerica } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Rotina diária da automação (Vercel Cron — ver vercel.json). Protegida pela chave de
 * automação: header `Authorization: Bearer <CRON_SECRET>` (a Vercel envia sozinha).
 *
 * Para cada e-mail novo, de remetente permitido, com extrato anexado:
 *   1. descobre a organização/conta bancária pela regra (automacao_regras);
 *   2. importa, classifica, valida e — só sem nenhuma pendência — lança (tudo ou nada);
 *   3. se todos os arquivos da organização naquele e-mail deram certo, gera o relatório
 *      completo do período (comparado ao período anterior), guarda no Storage e manda
 *      por e-mail; se não, manda a lista de pendências com o link para revisar.
 */

type Regra = {
  id: string;
  org_id: string;
  nome: string;
  identificador: string;
  conta_bancaria_code: string;
  remetentes_permitidos: string[];
};

type Org = { id: string; name: string; base_currency: string };

type ResultadoArquivo = {
  nomeArquivo: string;
  regra: Regra | null;
  execucaoId: string | null;
  resultado: ResultadoProcessamento | { status: "ignorado" | "revisar" | "erro"; pendencias: Pendencia[] };
};

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

async function escolherRegra(regras: Regra[], email: EmailRecebido, nomeArquivo: string, buffer: ArrayBuffer) {
  let texto = `${email.assunto} ${nomeArquivo}`;
  if (/\.pdf$/i.test(nomeArquivo)) {
    try {
      texto += " " + (await extrairTextoPdf(buffer)).slice(0, 4000);
    } catch {
      // sem texto — fica só com assunto e nome do arquivo
    }
  }
  const alvo = normalizar(texto);
  const candidatas = regras.filter(
    (r) =>
      r.remetentes_permitidos.map((x) => x.toLowerCase()).includes(email.remetente) &&
      alvo.includes(normalizar(r.identificador))
  );
  const destinos = new Map(candidatas.map((r) => [`${r.org_id}|${r.conta_bancaria_code}`, r]));
  return Array.from(destinos.values());
}

function baseUrl(req: NextRequest) {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return prod ? `https://${prod}` : req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: regrasData, error: regrasError } = await supabase
    .from("automacao_regras")
    .select("id, org_id, nome, identificador, conta_bancaria_code, remetentes_permitidos")
    .eq("ativo", true);
  if (regrasError) return NextResponse.json({ error: regrasError.message }, { status: 500 });
  const regras = (regrasData ?? []) as Regra[];
  const remetentes = new Set(regras.flatMap((r) => r.remetentes_permitidos.map((x) => x.toLowerCase())));
  if (remetentes.size === 0) return NextResponse.json({ emails: 0, mensagem: "Nenhuma regra ativa." });

  let emails: EmailRecebido[];
  try {
    emails = await lerEmailsNovos(remetentes);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const orgsCache = new Map<string, Org>();
  async function getOrg(id: string): Promise<Org> {
    if (!orgsCache.has(id)) {
      const { data } = await supabase.from("organizations").select("id, name, base_currency").eq("id", id).single();
      orgsCache.set(id, data as Org);
    }
    return orgsCache.get(id)!;
  }

  const site = baseUrl(req);
  const resumoGeral: { email: string; arquivos: { arquivo: string; status: string }[] }[] = [];
  const uidsProcessados: number[] = [];

  for (const email of emails) {
    const resultados: ResultadoArquivo[] = [];

    for (const anexo of email.anexos) {
      const { data: jaFeito } = await supabase
        .from("automacao_execucoes")
        .select("id")
        .eq("email_message_id", email.messageId)
        .eq("nome_arquivo", anexo.nomeArquivo)
        .maybeSingle();
      if (jaFeito) continue;

      const destinos = await escolherRegra(regras, email, anexo.nomeArquivo, anexo.buffer);
      let regra: Regra | null = null;
      let resultado: ResultadoArquivo["resultado"];

      if (destinos.length === 0) {
        resultado = {
          status: "ignorado",
          pendencias: [
            {
              tipo: "regra",
              mensagem: `Não identifiquei a empresa/banco. Coloque no assunto um destes identificadores: ${regras
                .map((r) => `"${r.identificador}" (${r.nome})`)
                .join(", ")}.`,
            },
          ],
        };
      } else if (destinos.length > 1) {
        resultado = {
          status: "revisar",
          pendencias: [
            {
              tipo: "regra",
              mensagem: `O arquivo combina com mais de uma regra (${destinos.map((d) => d.nome).join(", ")}). Reenvie com só um identificador no assunto.`,
            },
          ],
        };
      } else {
        regra = destinos[0];
        try {
          resultado = await processarArquivoAutomatico(supabase, {
            orgId: regra.org_id,
            contaBancariaCode: regra.conta_bancaria_code,
            nomeArquivo: anexo.nomeArquivo,
            buffer: anexo.buffer,
          });
        } catch (e) {
          resultado = { status: "erro", pendencias: [{ tipo: "excecao", mensagem: (e as Error).message }] };
        }
      }

      const r = resultado as Partial<ResultadoProcessamento> & { status: string; pendencias: Pendencia[] };
      const { data: exec } = await supabase
        .from("automacao_execucoes")
        .insert({
          org_id: regra?.org_id ?? null,
          regra_id: regra?.id ?? null,
          email_message_id: email.messageId,
          email_remetente: email.remetente,
          email_assunto: email.assunto,
          nome_arquivo: anexo.nomeArquivo,
          status: r.status,
          periodo_inicio: r.periodoInicio ?? null,
          periodo_fim: r.periodoFim ?? null,
          lote_id: r.loteId ?? null,
          total_transacoes: r.totalTransacoes ?? 0,
          lancamentos_criados: r.lancamentosCriados ?? 0,
          pendencias: r.pendencias,
        })
        .select("id")
        .single();

      resultados.push({ nomeArquivo: anexo.nomeArquivo, regra, execucaoId: exec?.id ?? null, resultado });
    }

    if (resultados.length === 0) {
      uidsProcessados.push(email.uid);
      continue;
    }

    // Relatório completo por organização — só quando TODOS os arquivos dela deram certo.
    const anexosEmail: { nomeArquivo: string; buffer: Buffer }[] = [];
    const linhasRelatorio: string[] = [];
    const porOrg = new Map<string, ResultadoArquivo[]>();
    for (const r of resultados) {
      if (!r.regra) continue;
      porOrg.set(r.regra.org_id, [...(porOrg.get(r.regra.org_id) ?? []), r]);
    }
    for (const [orgId, lista] of porOrg) {
      const org = await getOrg(orgId);
      const todosOk = lista.every((x) => x.resultado.status === "sucesso");
      if (!todosOk) {
        linhasRelatorio.push(`${org.name}: relatório completo NÃO gerado — há arquivo com pendência ou erro.`);
        continue;
      }
      const periodos = lista.map((x) => x.resultado as ResultadoProcessamento);
      const inicio = periodos.map((p) => p.periodoInicio!).sort()[0];
      const fim = periodos.map((p) => p.periodoFim!).sort().reverse()[0];
      const ant = periodoAnterior(inicio, fim);
      try {
        const rel = await gerarRelatorioCompleto(
          supabase,
          orgId,
          { currency: org.base_currency ?? "USD", orgName: org.name },
          { inicio, fim, comparar: true, inicioAnt: ant.inicio, fimAnt: ant.fim },
          "pdf"
        );
        const caminho = `${orgId}/${new Date().toISOString().slice(0, 10)}-${rel.nomeArquivo}`;
        const { error: upErr } = await supabase.storage
          .from("automacao")
          .upload(caminho, rel.buffer, { contentType: rel.contentType, upsert: true });
        if (!upErr) {
          await supabase
            .from("automacao_execucoes")
            .update({ relatorio_path: caminho })
            .in(
              "id",
              lista.map((x) => x.execucaoId).filter((x): x is string => !!x)
            );
        }
        anexosEmail.push({ nomeArquivo: rel.nomeArquivo, buffer: rel.buffer });
        linhasRelatorio.push(
          `${org.name}: relatório completo de ${fmtDateNumerica(inicio)} a ${fmtDateNumerica(fim)} (comparado a ${fmtDateNumerica(
            ant.inicio
          )} a ${fmtDateNumerica(ant.fim)}) em anexo.`
        );
      } catch (e) {
        linhasRelatorio.push(`${org.name}: lançamentos feitos, mas falhou ao gerar o relatório: ${(e as Error).message}`);
      }
    }

    // E-mail de retorno
    const blocos = resultados.map((r) => {
      const st = r.resultado.status;
      const rr = r.resultado as Partial<ResultadoProcessamento>;
      const cabecalho =
        st === "sucesso"
          ? `✔ ${r.nomeArquivo}: ${rr.lancamentosCriados} lançamento(s) no Diário (${r.regra?.nome}).`
          : st === "ignorado"
            ? `– ${r.nomeArquivo}: ignorado.`
            : `✖ ${r.nomeArquivo}: ${st === "revisar" ? "precisa de revisão — nada foi lançado" : "erro — nada foi lançado"} (${r.regra?.nome ?? "sem regra"}).`;
      const pend = r.resultado.pendencias.slice(0, 15).map((p) => `   • ${p.mensagem}`);
      if (r.resultado.pendencias.length > 15) pend.push(`   • ... e mais ${r.resultado.pendencias.length - 15}.`);
      const link = rr.loteId && st !== "sucesso" ? [`   Revisar: ${site}/importar/${rr.loteId}`] : [];
      return [cabecalho, ...pend, ...link].join("\n");
    });
    const algumProblema = resultados.some((r) => r.resultado.status !== "sucesso");
    const texto = [
      "Resultado da rotina automática do CFO de Bolso:",
      "",
      ...blocos,
      "",
      ...linhasRelatorio,
      "",
      `Histórico: ${site}/automacao`,
    ].join("\n");
    try {
      await enviarResultado({
        para: email.remetente,
        assunto: `${algumProblema ? "[Revisar] " : "[OK] "}CFO de Bolso — ${email.assunto || "extratos"}`,
        texto,
        responderA: email.messageId,
        anexos: anexosEmail,
      });
    } catch {
      // o resultado continua registrado em /automacao mesmo se o aviso falhar
    }

    uidsProcessados.push(email.uid);
    resumoGeral.push({
      email: email.assunto,
      arquivos: resultados.map((r) => ({ arquivo: r.nomeArquivo, status: r.resultado.status })),
    });
  }

  try {
    await marcarComoLidos(uidsProcessados);
  } catch {
    // a deduplicação por (message-id, arquivo) evita reprocessar mesmo se isso falhar
  }

  return NextResponse.json({ emails: emails.length, resumo: resumoGeral });
}
