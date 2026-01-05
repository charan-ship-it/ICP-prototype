/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack configuration (Next.js 16 default)
  turbopack: {
    // Empty config to silence the warning - Turbopack handles externals automatically
  },
  
  // Webpack configuration (fallback if --webpack flag is used)
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude pdf-parse from client-side bundling
      config.externals = config.externals || [];
      config.externals.push('pdf-parse');
    }
    
    // Improve build performance
    config.optimization = {
      ...config.optimization,
      moduleIds: 'deterministic',
    };
    
    return config;
  },
  
  // Performance optimizations
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

module.exports = nextConfig;
