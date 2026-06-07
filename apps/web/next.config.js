/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@asciidocollab/shared',
    '@dicebear/core',
    '@dicebear/collection',
    '@dicebear/adventurer',
    '@dicebear/adventurer-neutral',
    '@dicebear/bottts',
    '@dicebear/bottts-neutral',
    '@dicebear/fun-emoji',
    '@dicebear/identicon',
    '@dicebear/initials',
    '@dicebear/lorelei',
    '@dicebear/pixel-art',
    '@dicebear/shapes',
  ],
};

module.exports = nextConfig;
