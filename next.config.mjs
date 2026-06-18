/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Server Actions validate the request Origin against the forwarded Host.
  // Behind custom domains and the apex -> www redirect (mcc-btp.app -> www.mcc-btp.app),
  // those can differ from the deployment URL, which makes Next reject the action
  // (e.g. the activity "email log" Server Action silently fails on mcc-btp.app).
  // Allow every production/preview host the app is served from.
  experimental: {
    serverActions: {
      allowedOrigins: [
        "mcc-btp.app",
        "www.mcc-btp.app",
        "mcc-btp.ipostrad.app",
        "*.ipostrad.app",
        "*.vercel.app",
      ],
    },
  },
}

export default nextConfig
