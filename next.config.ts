import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimize for production
  poweredByHeader: false,
  
  // Enable standalone output for Railway deployment
  output: 'standalone',
};

export default nextConfig;
