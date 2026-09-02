import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CFO de Bolso",
  description: "Contabilidade multi-tenant e carteira de investimentos, com um CFO de bolso movido a IA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
