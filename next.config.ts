import type { NextConfig } from "next";

/**
 * Content-Security-Policy. Next inlines its bootstrap scripts, so without a
 * per-request nonce (which would make every page dynamic) script-src has to
 * allow inline — React's escaping is the XSS defence. What this adds on top:
 * no plugins, no <base> hijack, no framing, forms and fetches only to this
 * origin (so a script that did get in has nowhere to send data), and images
 * from anywhere over HTTPS (link previews, GIFs) or local uploads. Dev mode
 * needs eval for fast refresh; production never gets it.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  // The announce composer previews the email in a sandboxed srcdoc frame.
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // No upgrade-insecure-requests: HSTS already pins the site to HTTPS, and it
  // would break the plain-http test server.
].join("; ");

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
          { key: "Content-Security-Policy", value: csp },
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
