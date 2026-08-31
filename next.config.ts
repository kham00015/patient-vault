import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow doctor-demo links via Cloudflare quick tunnel in dev
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: {
    // Scanned images / 20-min AI Listen PCM can exceed the default body limit.
    proxyClientMaxBodySize: "45mb",
    serverActions: {
      bodySizeLimit: "45mb",
    },
  },
};

export default nextConfig;
