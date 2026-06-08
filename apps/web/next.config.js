/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@asciidocollab/shared',
    '@dicebear/core',
    '@dicebear/styles',
  ],
};

module.exports = nextConfig;
