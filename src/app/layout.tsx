import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IPL Cleopatra | Administrasi Keuangan RT",
  description: "Portal resmi pembayaran dan transparansi keuangan kas warga RT 011 / RW 028 Cluster Cleopatra",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IPL Cleopatra",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased bg-slate-50 text-slate-900 selection:bg-emerald-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
