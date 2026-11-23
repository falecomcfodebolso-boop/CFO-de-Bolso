-- Marca quando o relatório gerado pela automação foi baixado para o computador
-- (scripts/baixar-relatorios.mjs, agendado no Windows) — evita baixar de novo.
alter table automacao_execucoes add column baixado_em timestamptz;
