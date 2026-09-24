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
};

export default nextConfig;
