import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/providers";

export const metadata: Metadata = {
  title: "AI Engineering Workspace | Collaborative AI Development Environment",
  description: "One Workspace. Every Developer. One Shared AI Brain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-canvas text-foreground antialiased selection:bg-brand-violet/30 selection:text-white">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

