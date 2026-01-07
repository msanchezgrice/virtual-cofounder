/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Redirect /overview to /dashboard (if users try the old URL)
      {
        source: '/overview',
        destination: '/dashboard',
        permanent: true,
      },
      // Redirect /app to /dashboard (alternative entry point)
      {
        source: '/app',
        destination: '/dashboard',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
