import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Resume PDFs go through a Server Action; default limit is 1 MB.
    // 4.5 MB is also the most a Vercel function will accept.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "www.google.com", pathname: "/s2/favicons" }],
  },
};

export default nextConfig;
