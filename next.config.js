/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: true,
  },
  webpack: (config, { isServer }) => {
    // Fix for Node.js built-in modules that aren't available in webpack bundling
    if (!isServer) {
      // Client-side: prevent bundling of Node.js internals
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '#async_hooks': false,
        'async_hooks': false,
      };
    } else {
      // Server-side: externalize p-limit if it's still being used anywhere
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push({
          'p-limit': 'commonjs p-limit',
        });
      }
    }
    return config;
  },
}

module.exports = nextConfig

