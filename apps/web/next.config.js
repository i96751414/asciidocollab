/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@asciidocollab/asciidoc-core',
    '@asciidocollab/shared',
    '@dicebear/core',
    '@dicebear/styles',
  ],
};

module.exports = nextConfig;
