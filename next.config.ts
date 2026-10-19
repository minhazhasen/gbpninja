import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` gets its own folder so running `npm run build` (e.g. as a pre-commit check)
  // never overwrites the running dev server's assets and breaks its CSS.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
