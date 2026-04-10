import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Memory Machine v3",
  description: "Personal project management and context — v3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
