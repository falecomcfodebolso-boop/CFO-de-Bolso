export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 text-slate-900 font-semibold text-lg">
            <span className="inline-block h-8 w-8 rounded-lg bg-slate-900 text-white grid place-items-center text-sm">
              CB
            </span>
            CFO de Bolso
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Contabilidade e carteira de investimentos, com IA no seu bolso.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
