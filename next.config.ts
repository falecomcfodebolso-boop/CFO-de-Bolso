import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Extratos bancários (principalmente PDF) podem passar de 1MB, o
    // limite padrão de Server Actions — usado em /importar.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // "pdf-parse" (via pdfjs-dist) declara no seu package.json um export
  // condicional "browser" que aponta pra build feita pra navegador,
  // dependente de DOMMatrix/ImageData/Path2D. Quando o Next empacota essa
  // dependência (bundling normal de Server Actions/Route Handlers), o
  // bundler acaba resolvendo essa condição "browser" em vez de
  // "require"/"node" — e o carregamento do módulo quebra em runtime com
  // "ReferenceError: DOMMatrix is not defined", mesmo rodando em Node.js
  // puro na Vercel. Colocar o pacote aqui faz o Next usar o require()
  // nativo do Node para ele, que resolve a condição certa.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // pdfjs-dist tenta rodar sua leitura de PDF num "worker": no Node.js, sem
  // Worker de verdade, ele cai num modo "fake worker" que importa o próprio
  // arquivo do worker (pdf.worker.mjs) dinamicamente, em runtime, a partir
  // de um caminho montado com import.meta.url. Como esse import não é
  // estático, o rastreador de arquivos da Vercel não detecta essa
  // dependência sozinho e não inclui o arquivo no pacote da função
  // serverless — daí o "Cannot find module .../pdf.worker.mjs" em
  // produção (mesmo funcionando local). Isso força a inclusão manual.
  outputFileTracingIncludes: {
    "/importar": ["./node_modules/pdfjs-dist/legacy/build/**/*"],
  },
};

export default nextConfig;
