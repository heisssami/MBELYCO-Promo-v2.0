/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
}

module.exports = nextConfig
