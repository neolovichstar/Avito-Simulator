import type { NextConfig } from "next";

// На Vercel standalone не нужен (Vercel пакует функции сам) — там обычный output,
// он заметно компактнее. Standalone оставляем только для локального самохоста
// (scripts "start" в песочнице использует .next/standalone/server.js).
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: "standalone" as const }),
  // Не тащить в serverless-бандлы QA-артефакты и локальные файлы БД
  outputFileTracingExcludes: {
    '*': [
      './shots/**',
      './upload/**',
      './tool-results/**',
      './agent-ctx/**',
      './prisma/*.db',
      './db/**',
    ],
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // убрать плавающую кнопку dev-tools («N») — она портила скриншоты ОС
  devIndicators: false,
  async headers() {
    return [
      {
        // Логотипы и фото — неизменяемые ассеты: кэшируем надолго, чтобы в
        // WebView Telegram иконки не пропадали/не мигали на медленной сети
        source: '/img/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },
};

export default nextConfig;
