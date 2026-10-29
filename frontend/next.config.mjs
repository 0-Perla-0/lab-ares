/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: (process.env.ARES_DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((hostname) => hostname.trim())
    .filter(Boolean),
  async rewrites() {
    const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3000";

    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
