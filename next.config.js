/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mark pdf-parse as external to prevent bundling issues (works with both Turbopack and webpack)
  serverComponentsExternalPackages: ['pdf-parse'],
  
  // Turbopack configuration (Next.js 16 default)
  // serverComponentsExternalPackages handles externalization for Turbopack
  turbopack: {},
  
  // Webpack configuration (fallback if --webpack flag is used)
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude pdf-parse from client-side bundling
      config.externals = config.externals || [];
      config.externals.push('pdf-parse');
    }
    return config;
  },
};

module.exports = nextConfig;

