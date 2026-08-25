import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Myyntijärjestelmä</h1>
      <p className="max-w-md text-muted-foreground">
        Hallinnoi pihakirppis-tapahtumien myyntiä, hinnastoja ja kassaa yhdessä paikassa.
      </p>
      <Link href="/login" className={buttonVariants({ size: 'lg' })}>
        Log in
      </Link>
    </div>
  )
}
