import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  // @node-rs/argon2 is a native N-API module; letting webpack bundle it
  // corrupts its named exports (hash/verify/Algorithm resolve to undefined
  // at runtime). Marking it external forces a plain require() instead.
  serverExternalPackages: ['@node-rs/argon2'],
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
