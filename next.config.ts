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
};

export default nextConfig;
