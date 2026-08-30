import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages : ["pdf-parse", "@napi-rs/canvas"],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
