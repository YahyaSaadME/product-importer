import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product Importer",
  description: "CSV product import and webhook management console"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
