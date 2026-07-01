import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow doctor-demo links via Cloudflare quick tunnel in dev
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
