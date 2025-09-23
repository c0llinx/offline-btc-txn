import webpack from 'webpack';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@offline/server-api'],
  reactStrictMode: true,
  webpack: (config) => {
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      })
    );
    return config;
  },
};
export default nextConfig;
