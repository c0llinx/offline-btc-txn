/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { appDir: true },
  env: {
    __COLD__: process.env.__COLD__ === 'true' ? 'true' : 'false',
  },
};
module.exports = nextConfig;
