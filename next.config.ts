import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "github.com" },
    ],
  },
  typedRoutes: false,
  async redirects() {
    // One-version aliases for the paper-era URLs.
    return [
      { source: "/papers", destination: "/", permanent: true },
      { source: "/papers/:id", destination: "/posts/:id", permanent: true },
      { source: "/categories", destination: "/domains", permanent: true },
      { source: "/categories/:slug", destination: "/domains/:slug", permanent: true },
      { source: "/authors/:login", destination: "/u/:login", permanent: true },
      { source: "/authors", destination: "/rankings", permanent: true },
    ];
  },
};

export default nextConfig;
