/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'planetarycomputer.microsoft.com',
      },
      {
        protocol: 'https',
        hostname: '**.tile.openstreetmap.org',
      },
      {
        protocol: 'https',
        hostname: 'sentinel2l2a01.blob.core.windows.net',
      },
      {
        protocol: 'https',
        hostname: '**.blob.core.windows.net',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://orbitalquery-backend.onrender.com/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
