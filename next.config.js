/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/admin',
          destination: '/index.html',
        },
        {
          source: '/admin/',
          destination: '/index.html',
        },
        {
          source: '/',
          destination: '/login.html',
        },
      ],
    };
  },
};

module.exports = nextConfig;
