import Link from "next/link";
import {
  BookOpenCheck,
  Upload,
  LineChart,
  BellRing,
  MessageCircle,
  Sparkles,
  ShieldCheck,
  Building2,
  Lock,
  CheckCircle2,
  TrendingUp,
  Calculator,
  Percent,
} from "lucide-react";

const FEATURES = [
  {
    icon: BookOpenCheck,
    title: "Diário, Plano de Contas e Razões",
    description:
      "Escrituração contábil de verdade, em partida dobrada, com balancete e razão por conta — sem depender de planilha.",
  },
  {
    icon: Upload,
    title: "Importação de extratos",
    description:
      "Suba extratos em OFX, CSV, XLS ou PDF. O CFO de Bolso sugere a classificação contábil de cada transação — você só revisa e confirma.",
  },
  {
    icon: LineChart,
    title: "Carteira e índices de risco",
    description:
      "Concentração (HHI), taxa média ponderada e custo de capital estimado da sua carteira de investimentos, sempre atualizados.",
  },
  {
    icon: BellRing,
    title: "Agenda de vencimentos",
    description: "Alertas configuráveis para vencimento de ativos, com antecedência definida por você.",
  },
  {
    icon: Sparkles,
    title: "Estruturação inicial com IA",
    description:
      "Empresa nova ou sem contabilidade organizada? Descreva o negócio e o CFO de Bolso sugere um plano de contas completo para começar.",
  },
  {
    icon: MessageCircle,
    title: "CFO de Bolso — chat com IA",
    description:
      "Pergunte sobre seus números em português claro. As respostas usam só os dados da sua própria organização — nunca de outra.",
  },
];

const SEGURANCA = [
  {
    icon: Building2,
    title: "Isolamento real entre organizações",
    description:
      "Cada organização-cliente tem seus dados isolados por Row Level Security (RLS) diretamente no banco de dados — não é só uma checagem na tela.",
  },
  {
    icon: Lock,
    title: "Controle de acesso por papel",
    description:
      "Owner, admin, contador ou visualizador: cada papel tem exatamente as permissões de leitura/escrita que deveria ter, e nada além disso.",
  },
  {
    icon: ShieldCheck,
    title: "Partida dobrada garantida",
    description:
      "Todo lançamento é validado no banco: débitos e créditos precisam bater, sempre — não existe lançamento desbalanceado.",
  },
];

/** Gráfico decorativo estilo "terminal de bolsa" — puramente ilustrativo, sem dados reais. */
function StockChartDecoration() {
  const candles = [
    { x: 8, h: 22, up: true },
    { x: 24, h: 34, up: true },
    { x: 40, h: 16, up: false },
    { x: 56, h: 40, up: true },
    { x: 72, h: 26, up: false },
    { x: 88, h: 46, up: true },
    { x: 104, h: 30, up: false },
    { x: 120, h: 52, up: true },
    { x: 136, h: 38, up: false },
    { x: 152, h: 60, up: true },
    { x: 168, h: 48, up: false },
    { x: 184, h: 68, up: true },
  ];
  const baseline = 150;

  return (
    <div className="relative rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-emerald-950/30">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-500/80" />
          <span className="h-2 w-2 rounded-full bg-amber-400/80" />
          <span className="h-2 w-2 rounded-full bg-emerald-500/80" />
        </div>
        <span className="text-[11px] font-mono text-slate-500">carteira.cfodebolso</span>
      </div>

      <svg viewBox="0 0 200 160" className="w-full h-auto">
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1={0}
            x2={200}
            y1={20 + i * 32}
            y2={20 + i * 32}
            stroke="#1e293b"
            strokeDasharray="3 4"
            strokeWidth={1}
          />
        ))}
        {candles.map((c, i) => (
          <rect
            key={i}
            x={c.x}
            y={baseline - c.h}
            width={8}
            height={c.h}
            rx={1.5}
            fill={c.up ? "#10b981" : "#f43f5e"}
            opacity={0.9}
          />
        ))}
        <polyline
          points={candles.map((c) => `${c.x + 4},${baseline - c.h - 6}`).join(" ")}
          fill="none"
          stroke="#34d399"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.8}
        />
        <circle cx={candles[candles.length - 1].x + 4} cy={baseline - candles[candles.length - 1].h - 6} r={3.5} fill="#34d399">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-[11px] text-slate-500">Retorno 12m</p>
          <p className="text-sm font-semibold text-emerald-400">+18,4%</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-500">Concentração (HHI)</p>
          <p className="text-sm font-semibold text-slate-200">0,21</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-500">Custo de capital</p>
          <p className="text-sm font-semibold text-slate-200">9,8% a.a.</p>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-slate-600 text-center">Ilustrativo — não representa dados reais</p>
    </div>
  );
}

/** Calculadora decorativa — mockup estático do simulador de carteira, sem interatividade. */
function CalculatorMockup() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-emerald-950/30 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 grid place-items-center">
          <Calculator className="h-4 w-4 text-emerald-400" />
        </div>
        <span className="text-sm font-semibold text-slate-200">Simulador de carteira</span>
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="text-slate-500">Valor investido</span>
          <span className="font-mono text-slate-200">R$ 500.000</span>
        </div>
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="text-slate-500">Taxa média</span>
          <span className="font-mono text-slate-200 flex items-center gap-1">
            12,5% a.a. <Percent className="h-3 w-3 text-slate-500" />
          </span>
        </div>
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="text-slate-500">Prazo</span>
          <span className="font-mono text-slate-200">5 anos</span>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-emerald-300">Retorno estimado</span>
        <span className="text-lg font-semibold text-emerald-400 flex items-center gap-1">
          <TrendingUp className="h-4 w-4" />
          R$ 894.300
        </span>
      </div>
      <p className="mt-3 text-[10px] text-slate-600 text-center">
        Exemplo ilustrativo — sua carteira real é calculada a partir dos seus próprios dados
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- ícone estático simples */}
            <img src="/logo.svg" alt="" className="h-8 w-8 rounded-lg" />
            CFO de Bolso
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-slate-400 hover:text-white px-3 py-2">
              Entrar
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-emerald-500 text-slate-950 text-sm font-medium px-4 py-2 hover:bg-emerald-400"
            >
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1 mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            Contabilidade + carteira + IA, num só lugar
          </span>
          <h1 className="text-4xl sm:text-5xl font-semibold text-white tracking-tight text-balance">
            A contabilidade da sua empresa, com um CFO no seu bolso
          </h1>
          <p className="mt-5 text-lg text-slate-400 max-w-xl text-balance">
            Diário, Plano de Contas e Razões em partida dobrada, análise de carteira com índices de risco, agenda
            de vencimentos e um assistente de IA que responde sobre os seus números.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-emerald-500 text-slate-950 text-sm font-medium px-6 py-3 hover:bg-emerald-400"
            >
              Criar conta grátis
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-slate-700 bg-slate-900 text-slate-200 text-sm font-medium px-6 py-3 hover:bg-slate-800"
            >
              Já tenho conta
            </Link>
          </div>
        </div>
        <StockChartDecoration />
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 grid place-items-center mb-3">
                <f.icon className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-white">{f.title}</h3>
              <p className="text-sm text-slate-400 mt-1.5">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-800 bg-slate-900/40">
        <div className="max-w-6xl mx-auto px-4 py-16 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-2xl font-semibold text-white">Simule sua carteira antes mesmo de importar dados</h2>
            <p className="text-sm text-slate-400 mt-2 max-w-md">
              Depois de conectar sua carteira real, o CFO de Bolso calcula retorno, concentração (HHI) e custo de
              capital automaticamente — o exemplo ao lado é apenas ilustrativo.
            </p>
          </div>
          <CalculatorMockup />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold text-white">Segurança não é uma opção — é a base</h2>
          <p className="text-sm text-slate-400 mt-2">
            O isolamento entre organizações roda no banco de dados, não só na tela. Mesmo que a aplicação
            errasse, o Postgres barraria o acesso indevido.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-5 mt-8">
          {SEGURANCA.map((s) => (
            <div key={s.title} className="flex gap-3">
              <s.icon className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-white">{s.title}</h3>
                <p className="text-sm text-slate-400 mt-1">{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16 text-center border-t border-slate-800">
        <h2 className="text-2xl font-semibold text-white">Comece em minutos</h2>
        <ul className="mt-6 space-y-2 text-sm text-slate-400 max-w-md mx-auto text-left">
          {[
            "Crie sua conta e sua organização",
            "Monte o Plano de Contas manualmente ou peça ao CFO de Bolso para sugerir",
            "Importe extratos ou lance manualmente no Diário",
            "Acompanhe carteira, vencimentos e converse com o CFO de Bolso",
          ].map((step) => (
            <li key={step} className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              {step}
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <Link
            href="/signup"
            className="rounded-md bg-emerald-500 text-slate-950 text-sm font-medium px-6 py-3 hover:bg-emerald-400"
          >
            Criar conta grátis
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- ícone estático simples */}
            <img src="/logo.svg" alt="" className="h-5 w-5 rounded-md" />
            CFO de Bolso
          </div>
          <div className="flex items-center gap-4">
            <Link href="/termos" className="underline hover:text-slate-300">
              Termos de Uso
            </Link>
            <Link href="/privacidade" className="underline hover:text-slate-300">
              Política de Privacidade
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
