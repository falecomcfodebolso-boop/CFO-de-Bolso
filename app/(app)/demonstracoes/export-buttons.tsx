import { Download } from "lucide-react";

/** Botões de download de uma demonstração — geram o arquivo no servidor e o navegador baixa direto. */
export function ExportButtons({ hrefBase, query }: { hrefBase: string; query: Record<string, string> }) {
  const qs = new URLSearchParams(query).toString();
  return (
    <div className="flex items-center gap-2">
      <a
        href={`${hrefBase}?${qs}&formato=xlsx`}
        className="inline-flex items-center gap-1.5 text-sm rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
      >
        <Download className="h-3.5 w-3.5" />
        Excel
      </a>
      <a
        href={`${hrefBase}?${qs}&formato=pdf`}
        className="inline-flex items-center gap-1.5 text-sm rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
      >
        <Download className="h-3.5 w-3.5" />
        PDF
      </a>
    </div>
  );
}
