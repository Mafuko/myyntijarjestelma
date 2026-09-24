import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { auth } from '@/lib/auth'
import { getSalesSnapshot } from '@/lib/services/sales-dashboard'

const POLL_INTERVAL_MS = 2000

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()

  const initial = await getSalesSnapshot(session, eventId)
  if (!initial.ok) {
    const status = initial.error.code === 'UNAUTHENTICATED' ? 401 : 403
    return new Response(JSON.stringify({ error: initial.error.message }), { status })
  }

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      function send(data: unknown) {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      function stop() {
        if (closed) return
        closed = true
        clearInterval(interval)
        controller.close()
      }

      send(initial.data)

      const interval = setInterval(async () => {
        // Re-check auth/access on every tick rather than reusing the session
        // captured at connection open, so a mid-connection revocation (e.g. a
        // tokenVersion bump from PII deletion, or an admin removing the
        // caller's EventMembership) cuts the stream within one poll interval
        // instead of only at the next reconnect.
        try {
          const currentSession = await auth()
          const snapshot = await getSalesSnapshot(currentSession, eventId)
          if (snapshot.ok) {
            send(snapshot.data)
          } else {
            stop()
          }
        } catch (err) {
          Sentry.captureException(err)
          // Vercel can freeze/end this serverless invocation immediately
          // after stop() closes the response stream; without an explicit
          // flush, the captured event may never actually be sent.
          await Sentry.flush(2000).catch(() => {})
          stop()
        }
      }, POLL_INTERVAL_MS)

      request.signal.addEventListener('abort', stop)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
