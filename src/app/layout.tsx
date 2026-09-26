import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://avito-simulator.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: "Resale — Симулятор ресейла",
  description:
    "Симулятор ресейла: живой рынок с ИИ-продавцами, торг в чатах, банк, налоги, аукцион и ремонт — всё как в жизни. Скупай дёшево, продавай дорого!",
  keywords: ["resale", "ресейл", "симулятор", "перепродажа", "игра", "экономика", "телеграм миниапп"],
  applicationName: "Resale",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: BASE_URL,
    siteName: "Resale",
    title: "Resale — Симулятор ресейла",
    description:
      "Живой рынок, ИИ-торговцы, банк, налоги, аукцион и ремонт — скупай дёшево, продавай дорого!",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Resale — Симулятор ресейла" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Resale — Симулятор ресейла",
    description:
      "Живой рынок, ИИ-торговцы, банк, налоги, аукцион и ремонт — скупай дёшево, продавай дорого!",
    images: ["/og.jpg"],
  },
  other: {
    "format-detection": "telephone=no",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#050d09",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" async />
        {/* Логотипы приложений: скачиваем заранее — иконки на дом-экране рисуются мгновенно */}
        {['avito', 'bank', 'taxes', 'browser', 'settings', 'repair', 'auction', 'career', 'delivery', 'leaderboard'].map(
          (n) => (
            <link key={n} rel="preload" as="image" href={`/img/apps/${n}.png?v=2`} fetchPriority="high" />
          ),
        )}
      </head>
      <body className="antialiased bg-neutral-950 text-neutral-900 overscroll-none">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
