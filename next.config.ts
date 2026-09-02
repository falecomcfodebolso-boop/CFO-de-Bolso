import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Extratos bancários (principalmente PDF) podem passar de 1MB, o
    // limite padrão de Server Actions — usado em /importar.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
