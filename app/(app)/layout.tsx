import {
  LayoutDashboard,
  BookOpenCheck,
  Upload,
  ListTree,
  ScrollText,
  Scale,
  LineChart,
  BellRing,
  MessageCircle,
  FileBarChart,
  Landmark,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { logoutAction, switchOrgAction } from "../(auth)/actions";
import { NavLinks, type NavItem } from "./nav-links";

const ICON_CLASS = "h-3.5 w-3.5";

function montarNav(ehBrasilReais: boolean): NavItem[] {
  const nav: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className={ICON_CLASS} /> },
    { href: "/diario", label: "Diário", icon: <BookOpenCheck className={ICON_CLASS} /> },
    { href: "/importar", label: "Importar", icon: <Upload className={ICON_CLASS} /> },
    { href: "/plano-de-contas", label: "Plano de Contas", icon: <ListTree className={ICON_CLASS} /> },
    { href: "/razoes", label: "Razões", icon: <ScrollText className={ICON_CLASS} /> },
    { href: "/balancete", label: "Balancete", icon: <Scale className={ICON_CLASS} /> },
    { href: "/demonstracoes", label: "Demonstrações", icon: <FileBarChart className={ICON_CLASS} /> },
    { href: "/carteira", label: "Carteira", icon: <LineChart className={ICON_CLASS} /> },
    { href: "/vencimentos", label: "Vencimentos", icon: <BellRing className={ICON_CLASS} /> },
  ];
  if (ehBrasilReais) {
    nav.push({ href: "/obrigacoes-fiscais", label: "Obrigações Fiscais", icon: <Landmark className={ICON_CLASS} /> });
  }
  nav.push({ href: "/cfo-bolso", label: "CFO de Bolso", icon: <MessageCircle className={ICON_CLASS} /> });
  nav.push({ href: "/configuracoes", label: "Configurações", icon: <Settings className={ICON_CLASS} /> });
  return nav;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, memberships, currentOrgId, currentMembership } = await requireOrgContext();
  const NAV = montarNav(currentMembership.organizations?.base_currency === "BRL");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14 gap-4">
          <Link href="/dashboard" className="font-semibold text-slate-900 flex items-center gap-2 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- ícone estático simples, não precisa de otimização do next/image */}
            <img src="/logo.svg" alt="" className="h-7 w-7 rounded-lg" />
            <span className="hidden sm:inline">CFO de Bolso</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {memberships.length > 1 ? (
              <form action={switchOrgAction} className="min-w-0">
                <select
                  name="org_id"
                  defaultValue={currentOrgId}
                  onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  className="text-sm border border-slate-300 rounded-md px-2 py-1 max-w-[9rem] sm:max-w-[14rem] truncate"
                >
                  {memberships.map((m) => (
                    <option key={m.org_id} value={m.org_id}>
                      {m.organizations?.name}
                    </option>
                  ))}
                </select>
              </form>
            ) : (
              <span className="text-sm text-slate-500 hidden sm:inline truncate max-w-[14rem]">
                {currentMembership.organizations?.name}
              </span>
            )}
            <span className="text-xs uppercase tracking-wide bg-slate-100 text-slate-600 rounded-full px-2 py-1 shrink-0">
              {currentMembership.role}
            </span>
            <span className="text-sm text-slate-500 hidden lg:inline truncate max-w-[12rem]">{user.email}</span>
            <form action={logoutAction} className="shrink-0">
              <button className="text-sm text-slate-500 hover:text-slate-900">Sair</button>
            </form>
          </div>
        </div>

        <nav className="border-t border-slate-100 bg-slate-50/60">
          <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 overflow-x-auto py-1.5">
            <NavLinks items={NAV} variant="compact" />
          </div>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
