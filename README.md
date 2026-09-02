# CFO de Bolso — protótipo de SaaS

Protótipo funcional de um SaaS multi-tenant de contabilidade (Diário, Plano de
Contas, Razões, Balancete) e análise de carteira de investimentos (índices de
risco/concentração, agenda de vencimentos com alertas), com um assistente de
IA ("CFO de Bolso") que responde perguntas com base nos dados da própria
organização — nunca de outra.

Construído com **Next.js 16** (App Router, Server Actions) + **Supabase**
(Postgres + Auth + **Row Level Security**). O isolamento entre clientes
(tenants) é garantido no banco de dados, não só na aplicação — ver seção
[Segurança e RLS](#segurança-e-rls-o-que-foi-testado) abaixo.

## Stack

- Next.js 16 (App Router, Server Components/Actions), React 19, Tailwind CSS 4
- Supabase: Postgres + Auth (e-mail/senha) + Row Level Security nativo
- Anthropic API (Claude) para o CFO de Bolso — opcional; sem a chave, o chat roda em "modo demo"

## Estrutura do projeto

```
app/
  (auth)/           login, signup, criação de organização
  (app)/            área logada: dashboard, diario, plano-de-contas,
                     razoes, balancete, carteira, vencimentos, cfo-bolso
  api/cfo-bolso/    rota do chat (usa client com RLS do usuário, nunca service role)
  api/cron/         job de alertas de vencimento (usa service role, protegido por CRON_SECRET)
  privacidade/, termos/   páginas públicas
lib/
  supabase/         clients (browser, server, admin) + middleware de sessão
  accounting/       queries de saldo/razão (via views SQL)
  portfolio/        cálculo de índices de carteira (HHI, ROA, K estimado etc.)
  cfo-bolso/        montagem do contexto financeiro enviado ao modelo
  org.ts            resolução de organização atual + papel do usuário
supabase/
  migrations/0001_schema.sql   schema completo com RLS (rode isto no seu projeto Supabase)
scripts/
  seed.mjs          popula uma organização de EXEMPLO com dados fictícios
```

## Como rodar (passo a passo)

### 1. Crie um projeto no Supabase

Em https://supabase.com/dashboard, crie um novo projeto. Anote a **Project URL**,
a **anon key** e a **service_role key** (Project Settings → API).

### 2. Aplique o schema

No SQL Editor do painel do Supabase, cole e rode o conteúdo de
`supabase/migrations/0001_schema.sql`. Isso cria todas as tabelas, funções,
triggers e políticas de RLS. (Alternativamente, use a Supabase CLI:
`supabase db push` apontando para este diretório de migrations.)

### 3. Configure as variáveis de ambiente

```bash
cp .env.local.example .env.local
```

Preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` com os valores do seu projeto. `ANTHROPIC_API_KEY`
é opcional (sem ela, o CFO de Bolso funciona em modo demo, mostrando o
contexto que seria enviado ao modelo). `CRON_SECRET` é um valor aleatório seu.

### 4. Instale as dependências e rode localmente

```bash
npm install
npm run dev
```

Acesse http://localhost:3000, crie uma conta em `/signup` e depois crie sua
organização em `/signup/organizacao`.

### 5. (Opcional) Popule uma organização de exemplo

```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/seed.mjs seu-email@exemplo.com "SuaSenha123!"
```

Isso cria (ou reaproveita) o usuário informado e uma organização "Exemplo
Holdings Ltd" com plano de contas, lançamentos, ativos e configuração de
alerta já preenchidos, com números fictícios/redondos.

## Deploy em produção

- **App (Next.js):** deploy na Vercel (ou qualquer host Node) apontando para
  este diretório. Configure as mesmas variáveis de ambiente do `.env.local`
  nas configurações do projeto.
- **Alertas de vencimento:** configure um agendador externo (Vercel Cron,
  cron-job.org, GitHub Actions, etc.) para chamar
  `GET https://seu-dominio/api/cron/vencimentos` periodicamente (sugestão:
  a cada hora), enviando o header `Authorization: Bearer <CRON_SECRET>`.
  A rota hoje conta quantos alertas disparariam; plugue seu provedor de
  push/e-mail no ponto marcado com `TODO` em
  `app/api/cron/vencimentos/route.ts`.

## Segurança e RLS: o que foi testado

Antes de escrever qualquer código de UI, o schema SQL (`supabase/migrations/0001_schema.sql`)
foi validado rodando um Postgres local de verdade (não é só leitura de código):

1. **Isolamento entre organizações:** usuário B, criando sua própria organização,
   não consegue ler nenhuma linha (`lancamentos`, `plano_de_contas`, views de
   saldo) pertencente à organização do usuário A, e uma tentativa de `INSERT`
   forjando o `org_id` de A é rejeitada pelo Postgres com
   `new row violates row-level security policy`.
2. **Papéis dentro da mesma organização:** um membro convidado como `viewer`
   consegue *ler* os lançamentos da organização, mas uma tentativa de
   `INSERT`/`UPDATE` é rejeitada — só `owner`/`admin`/`accountant` têm
   permissão de escrita (via a função `has_write_role`).
3. **Gestão de membros restrita a owner/admin:** convidar/remover membros da
   organização só é permitido a quem já é `owner`/`admin` — corrigido um bug
   real de **recursão infinita de política** (`infinite recursion detected in
   policy for relation memberships`) durante os testes, resolvido com uma
   função auxiliar `SECURITY DEFINER` (`is_org_admin`) que evita a política de
   `memberships` reconsultar a própria tabela sob o role do usuário.
4. **Partida dobrada obrigatória:** um trigger de constraint (deferrable)
   rejeita, no commit da transação, qualquer lançamento cuja soma de débitos
   seja diferente da soma de créditos — testado tanto via `INSERT` direto
   quanto via a função `create_lancamento`.
5. **Views de razão/balancete respeitam RLS:** `v_saldo_contas` e
   `v_movimento_contas` são criadas com `security_invoker = true`, então
   herdam as mesmas policies das tabelas base — testado que o usuário B
   consegue ler suas próprias views com `count() = 0` para a org de A.

O código da aplicação (`lib/org.ts`, `lib/supabase/*`) segue os mesmos
princípios: toda leitura/escrita usa o client autenticado do usuário (chave
anon + sessão), nunca a service role — a única exceção documentada é o job
de alertas de vencimento (`app/api/cron/vencimentos/route.ts`), que
deliberadamente precisa varrer todas as organizações e por isso é protegido
por um segredo (`CRON_SECRET`) e nunca é chamado a partir do navegador.

## Limitações conhecidas deste protótipo

- O build foi validado (`npm run build` e `npm run lint` passam limpos) e o
  schema foi testado com um Postgres real, mas o fluxo completo de
  autenticação/UI não foi testado ponta a ponta contra um projeto Supabase
  real dentro deste ambiente (não há acesso a um projeto Supabase de
  produção a partir daqui) — recomenda-se testar o fluxo de cadastro/login
  assim que configurar seu próprio projeto.
- O cálculo de custo de capital (K) na tela de Carteira usa parâmetros de
  exemplo fixos no código (`app/(app)/carteira/page.tsx`) — ajuste-os ou
  transforme-os em configuração por organização conforme sua necessidade.
- O disparo real de notificações push/e-mail no job de vencimentos está
  marcado como `TODO` — o job já identifica corretamente quais ativos
  deveriam alertar, falta plugar o provedor de notificação escolhido.
- Termos de Uso e Política de Privacidade são modelos genéricos — precisam
  de revisão jurídica antes de uso comercial real.
