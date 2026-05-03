/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/Plan7ArchitectPartner',
  assetPrefix: '/Plan7ArchitectPartner',
  images: {
    unoptimized: true, // Required for static export
  },
};

export default nextConfig;
