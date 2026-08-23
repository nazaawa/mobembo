import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 est un module natif : il doit rester externe au bundle
  // serveur plutôt que d'être traité par Turbopack.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
