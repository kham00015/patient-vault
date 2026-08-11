import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow doctor-demo links via Cloudflare quick tunnel in dev
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: {
    // Scanned images can exceed the default ~10MB body limit before our 25MB check runs.
    proxyClientMaxBodySize: "30mb",
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
