import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  // v11's dataCollection defaults attach incoming request bodies and user
  // IP/headers to server error events. This app's POST bodies can contain
  // encrypted-at-rest IBANs and auth credentials; letting a failed request
  // ship its raw body to a third-party error tracker would undo that
  // protection.
  dataCollection: { httpBodies: [], userInfo: false },
})
