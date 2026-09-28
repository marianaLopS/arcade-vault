import type { NextConfig } from "next";
// Headers de seguridad (SPEC 15). CSP y HSTS quedan para otra spec.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];
const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.*"],
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
};
export default nextConfig;
