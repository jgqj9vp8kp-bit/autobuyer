import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // standalone — самодостаточная сборка для Docker; на Vercel не нужна (там своя упаковка функций)
  output: process.env.VERCEL ? undefined : "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
