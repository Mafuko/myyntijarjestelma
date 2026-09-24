import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs/config';

const nextConfig: NextConfig = {
  // @node-rs/argon2 is a native N-API module; letting webpack bundle it
  // corrupts its named exports (hash/verify/Algorithm resolve to undefined
  // at runtime). Marking it external forces a plain require() instead.
  serverExternalPackages: ['@node-rs/argon2'],
};

const withNextIntl = createNextIntlPlugin();

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // Routes client-side error reports through this same-origin path instead
  // of Sentry's ingest domain directly, so middleware.ts's `connect-src
  // 'self'` CSP doesn't need loosening for third-party error reporting.
  tunnelRoute: '/monitoring',
});
