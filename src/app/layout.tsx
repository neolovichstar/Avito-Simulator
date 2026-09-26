import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Resale — Симулятор ресейла",
  description:
    "Симулятор ресейла: живой рынок с ИИ-продавцами, торг в чатах, банк, налоги, аукцион и ремонт — всё как в жизни. Скупай дёшево, продавай дорого!",
  keywords: ["resale", "ресейл", "симулятор", "перепродажа", "игра", "экономика", "телеграм миниапп"],
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
