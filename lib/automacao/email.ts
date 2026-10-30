import { ImapFlow, type MessageStructureObject } from "imapflow";
import nodemailer from "nodemailer";

// =====================================================================
// Caixa de e-mail da automação (Gmail com "senha de app").
//
// Variáveis de ambiente (só no servidor / Vercel):
//   AUTOMACAO_EMAIL_USER   — endereço da caixa que recebe os extratos
//   AUTOMACAO_EMAIL_SENHA  — senha de app do Google (16 letras)
//   AUTOMACAO_EMAIL_AVISO  — (opcional) para onde mandar o resultado;
//                            padrão: responde ao próprio remetente
// =====================================================================

export type AnexoRecebido = { nomeArquivo: string; buffer: ArrayBuffer };

export type EmailRecebido = {
  uid: number;
  messageId: string;
  remetente: string;
  assunto: string;
  anexos: AnexoRecebido[];
};

const EXTENSOES_ACEITAS = /\.(ofx|csv|xls|xlsx|pdf)$/i;

export function configEmail() {
  const user = process.env.AUTOMACAO_EMAIL_USER;
  const pass = process.env.AUTOMACAO_EMAIL_SENHA?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  return { user, pass, aviso: process.env.AUTOMACAO_EMAIL_AVISO || null };
}

function coletarAnexos(node: MessageStructureObject | undefined, acc: { part: string; nome: string }[] = []) {
  if (!node) return acc;
  const nome = node.dispositionParameters?.filename ?? node.parameters?.name;
  if (node.part && nome && EXTENSOES_ACEITAS.test(nome)) acc.push({ part: node.part, nome });
  for (const filho of node.childNodes ?? []) coletarAnexos(filho, acc);
  return acc;
}

async function streamParaArrayBuffer(stream: NodeJS.ReadableStream): Promise<ArrayBuffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  const buf = Buffer.concat(chunks);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/**
 * Lê os e-mails NÃO LIDOS da caixa, de remetentes permitidos, que tenham anexo de extrato.
 * Os e-mails de remetentes não permitidos são deixados como estão (não são marcados como lidos).
 * Quem chama deve marcar como lido (`marcarComoLidos`) só depois de registrar a execução.
 */
export async function lerEmailsNovos(remetentesPermitidos: Set<string>): Promise<EmailRecebido[]> {
  const cfg = configEmail();
  if (!cfg) throw new Error("Caixa de e-mail da automação não configurada (AUTOMACAO_EMAIL_USER / AUTOMACAO_EMAIL_SENHA).");

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  const emails: EmailRecebido[] = [];
  try {
    const uids = (await client.search({ seen: false }, { uid: true })) || [];
    for (const uid of uids) {
      const msg = await client.fetchOne(String(uid), { envelope: true, bodyStructure: true }, { uid: true });
      if (!msg) continue;
      const remetente = (msg.envelope?.from?.[0]?.address ?? "").toLowerCase();
      if (!remetentesPermitidos.has(remetente)) continue;
      const partes = coletarAnexos(msg.bodyStructure);
      if (partes.length === 0) continue;

      const anexos: AnexoRecebido[] = [];
      for (const p of partes) {
        const { content } = await client.download(String(uid), p.part, { uid: true });
        anexos.push({ nomeArquivo: p.nome, buffer: await streamParaArrayBuffer(content) });
      }
      emails.push({
        uid,
        messageId: msg.envelope?.messageId ?? `uid-${uid}`,
        remetente,
        assunto: msg.envelope?.subject ?? "",
        anexos,
      });
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return emails;
}

export async function marcarComoLidos(uids: number[]) {
  const cfg = configEmail();
  if (!cfg || uids.length === 0) return;
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    await client.messageFlagsAdd(uids.join(","), ["\\Seen"], { uid: true });
  } finally {
    lock.release();
    await client.logout();
  }
}

export async function enviarResultado(args: {
  para: string;
  assunto: string;
  texto: string;
  responderA?: string;
  anexos?: { nomeArquivo: string; buffer: Buffer }[];
}) {
  const cfg = configEmail();
  if (!cfg) return;
  const transporte = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  await transporte.sendMail({
    from: `CFO de Bolso <${cfg.user}>`,
    to: cfg.aviso ?? args.para,
    subject: args.assunto,
    text: args.texto,
    inReplyTo: args.responderA,
    references: args.responderA,
    attachments: (args.anexos ?? []).map((a) => ({ filename: a.nomeArquivo, content: a.buffer })),
  });
}
