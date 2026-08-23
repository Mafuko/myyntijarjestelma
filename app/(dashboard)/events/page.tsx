import { auth } from '@/lib/auth'

export default async function EventsPage() {
  const session = await auth()
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Events</h1>
      <p>Signed in as {session?.user?.email}</p>
    </div>
  )
}
