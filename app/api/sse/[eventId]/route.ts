import { NextRequest } from 'next/server'
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

      send(initial.data)

      const interval = setInterval(async () => {
        const snapshot = await getSalesSnapshot(session, eventId)
        if (snapshot.ok) send(snapshot.data)
      }, POLL_INTERVAL_MS)

      request.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(interval)
        controller.close()
      })
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
