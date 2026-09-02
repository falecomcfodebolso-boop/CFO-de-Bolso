import { requireOrgContext } from "@/lib/org";
import { ChatWidget } from "./chat-widget";

export default async function CfoBolsoPage() {
  await requireOrgContext();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">CFO de Bolso</h1>
        <p className="text-sm text-slate-500">
          Assistente com IA que responde com base nos dados contábeis e da carteira desta organização — nunca de outra.
        </p>
      </div>
      <ChatWidget initialMessages={[]} />
    </div>
  );
}
