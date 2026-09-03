"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginAction, resendConfirmationAction, type ActionState, type ResendActionState } from "../actions";

function CheckEmailBanner({ hide }: { hide: boolean }) {
  const searchParams = useSearchParams();
  const acabouDeCriarConta = searchParams.get("check_email") === "1";

  if (!acabouDeCriarConta || hide) return null;

  return (
    <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 mb-4">
      Conta criada! Enviamos um e-mail de confirmação — clique no link dele antes de entrar aqui
      (confira também a caixa de spam).
    </p>
  );
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    loginAction,
    null
  );
  const [resendState, resendAction, resendPending] = useActionState<ResendActionState, FormData>(
    resendConfirmationAction,
    null
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-4">Entrar</h1>

      <Suspense fallback={null}>
        <CheckEmailBanner hide={!!state?.error} />
      </Suspense>

      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            E-mail
          </label>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Senha
          </label>
          <input
            name="password"
            type="password"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>

      {state?.emailNaoConfirmado && (
        <form action={resendAction} className="mt-3">
          <input type="hidden" name="email" value={state.emailNaoConfirmado} />
          {resendState?.enviado ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              Reenviamos o e-mail de confirmação para {state.emailNaoConfirmado}.
            </p>
          ) : (
            <>
              <button
                type="submit"
                disabled={resendPending}
                className="w-full text-sm text-slate-700 underline disabled:opacity-60"
              >
                {resendPending ? "Reenviando..." : "Reenviar e-mail de confirmação"}
              </button>
              {resendState?.error && (
                <p className="text-sm text-red-600 mt-2">{resendState.error}</p>
              )}
            </>
          )}
        </form>
      )}

      <p className="text-sm text-slate-500 mt-4 text-center">
        Ainda não tem conta?{" "}
        <Link href="/signup" className="text-slate-900 font-medium underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
