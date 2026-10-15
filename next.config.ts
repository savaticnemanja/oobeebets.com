import type { NextConfig } from "next";

// Content-Security-Policy is set by nginx, per site, not here: see
// /etc/nginx/conf.d/csp.conf on the server (enforced, with violation
// reports to nemanjas.dev/csp-report). One policy in one place — a second
// copy here would keep blocking whatever that one is loosened to allow.

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the Docker runtime stage can ship
  // without node_modules. See Dockerfile.
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  experimental: {
    // bcryptjs + postgres are server-only; keep them out of the client graph.
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
