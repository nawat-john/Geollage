import type { NextConfig } from "next";

// Set by the GitHub Pages deploy workflow so the site works from a project
// subpath (https://<user>.github.io/<repo>/) instead of the domain root.
// Left unset for local dev/build, which serves from "/".
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["three"],
  images: {
    unoptimized: true,
  },
  basePath,
};

export default nextConfig;
