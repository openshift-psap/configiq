/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: [
    "@patternfly/react-core",
    "@patternfly/react-charts",
    "@patternfly/react-icons",
    "@patternfly/react-table",
  ],
};

module.exports = nextConfig;
