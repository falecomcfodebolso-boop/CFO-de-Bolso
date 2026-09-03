-- =====================================================================
-- DETALHAMENTO PAPEL A PAPEL PARA CÁLCULO DE ACRUO (Ajustes)
-- =====================================================================
-- Para reproduzir a visão papel-a-papel que a usuária mantém em planilha
-- (valor face, taxa, datas de cupom, categoria de acruo) dentro da tela
-- Ajustes, cada Ativo passa a carregar os dados necessários para o
-- cálculo interno de juros acruados (regime de competência, 30/360) e
-- o vínculo com a(s) conta(s) contábil(is) de acruo/receita do seu
-- grupo — que pode ser uma conta dedicada (ex: um CLN específico) ou um
-- pool compartilhado por vários ativos (várias contas separadas por
-- vírgula em conta_acruo_code/conta_receita_code).
alter table ativos
  add column if not exists valor_face numeric(18,2),
  add column if not exists categoria_acruo text,
  add column if not exists tipo_taxa text,
  add column if not exists indice_referencia text,
  add column if not exists spread_taxa numeric(9,6),
  add column if not exists taxa_referencia_atual numeric(9,6),
  add column if not exists data_pagamento_anterior date,
  add column if not exists data_inicio_acruo date,
  add column if not exists pendente_custodiante boolean not null default false,
  add column if not exists conta_acruo_code text,
  add column if not exists conta_receita_code text,
  add column if not exists grupo_acruo_nome text;

alter table ativos
  add constraint ativos_categoria_acruo_check
    check (categoria_acruo is null or categoria_acruo in (
      'periodico', 'continuo', 'mercado', 'defaulted', 'desconto', 'vencido'
    ));

alter table ativos
  add constraint ativos_tipo_taxa_check
    check (tipo_taxa is null or tipo_taxa in ('fixa', 'flutuante'));

comment on column ativos.categoria_acruo is
  'periodico: cronograma de cupom normal, acrua desde data_pagamento_anterior. '
  'continuo: sem cronograma periódico (ex. alguns CLNs) — acrua desde data_inicio_acruo, '
  'mas o valor reconhecido é sempre o do extrato do custodiante (não há cálculo interno independente). '
  'mercado/defaulted/desconto/vencido: não gera juros acruado (sempre zero).';
comment on column ativos.conta_acruo_code is
  'Conta(s) do Plano de Contas (Ativo) onde o acruo deste papel é reconhecido — '
  'pode ser compartilhada por vários ativos do mesmo grupo (separadas por vírgula).';
comment on column ativos.conta_receita_code is
  'Conta(s) de Receita correspondente(s) à(s) conta_acruo_code.';
comment on column ativos.grupo_acruo_nome is
  'Rótulo do grupo de acruo para agrupar a exibição na tela Ajustes (ex: "XP/Bradesco").';
