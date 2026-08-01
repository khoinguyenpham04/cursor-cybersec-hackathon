import type { NextConfig } from "next";

// The Flue agent server (../agent). `npm run dev` there serves on :5173;
// a production build (`node dist/server.mjs`) defaults to :3000.
const FLUE_SERVER_URL = process.env.FLUE_SERVER_URL ?? "http://localhost:5173";

const nextConfig: NextConfig = {
  rewrites() {
    // Same-origin proxy for the browser: /api/agents/* → Flue's /agents/*.
    // Keeps the SSE stream on one origin so no CORS setup is needed.
    return [
      {
        source: "/api/agents/:path*",
        destination: `${FLUE_SERVER_URL}/agents/:path*`,
      },
    ];
  },
};

export default nextConfig;
