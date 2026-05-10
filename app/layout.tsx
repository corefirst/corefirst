import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoreFirst — Global Bilingual Education",
  description: "Reconstructing Global Bilingual Education from First Principles via Core-First Language Theory (CFLT).",
  icons: {
    icon: "/corefirst-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
