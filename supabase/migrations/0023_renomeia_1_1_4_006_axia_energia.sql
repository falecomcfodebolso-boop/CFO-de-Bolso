-- Corrige o nome da conta 1.1.4.006, cadastrada como "Eletrobrás
-- (XP/Bradesco)" mas que na verdade é a posição da Axia Energia SA
-- (confirmado pelo casamento de valor de face/setor/data de cupom feito na
-- migration 0022, e pela usuária). Atualiza tanto o Plano de Contas quanto
-- o cadastro do Ativo, que hoje têm nomes independentes um do outro.
update plano_de_contas
set name = 'Axia Energia SA (XP/Bradesco)'
where org_id = (select id from organizations where name ilike '%Personal Overseas%' limit 1)
  and code = '1.1.4.006';

update ativos
set nome = 'Axia Energia SA (XP/Bradesco)'
where org_id = (select id from organizations where name ilike '%Personal Overseas%' limit 1)
  and conta_code = '1.1.4.006';
