import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // standalone — самодостаточная сборка для Docker (node server.js без node_modules целиком)
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
