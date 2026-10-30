import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // standalone — самодостаточная сборка для Docker; на Vercel не нужна (там своя упаковка функций)
  output: process.env.VERCEL ? undefined : "standalone",
  // ioredis — нативный Node-клиент, не бандлим его в серверные чанки
  serverExternalPackages: ["ioredis"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
