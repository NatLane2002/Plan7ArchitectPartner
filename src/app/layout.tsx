import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArchDraft Universal — Professional CAD Pre-Processor",
  description:
    "Generate production-ready, industry-standard DXF floor plans from natural language. AI-powered geometry engine with universal CAD compatibility for AutoCAD, Revit, Chief Architect, and SketchUp.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
