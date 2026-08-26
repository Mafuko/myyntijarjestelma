import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { CreateEventForm } from './CreateEventForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function NewEventPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })
  if (!user.isOwner) redirect('/events')

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Create event</CardTitle>
      </CardHeader>
      <CardContent>
        <CreateEventForm />
      </CardContent>
    </Card>
  )
}
