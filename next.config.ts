import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
