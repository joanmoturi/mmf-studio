import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MMF Studio | Your path, in perspective",
  description: "Private, local-first investment projections and financial freedom planning.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
