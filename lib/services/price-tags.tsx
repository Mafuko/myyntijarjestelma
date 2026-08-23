import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import bwipjs from 'bwip-js/node'
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type MinimalSession = { user?: { id?: string | null } | null } | null

export type PriceTagData = {
  id: string
  name: string
  price: string
  sellerAlias: string
  isAgeRestricted: boolean
  barcodeValue: string
}

function generateBarcodeValue(): string {
  return randomBytes(6).toString('hex').toUpperCase()
}

async function assignBarcodeIfMissing(itemId: string): Promise<string> {
  const item = await prisma.item.findUniqueOrThrow({ where: { id: itemId } })
  if (item.barcodeValue) return item.barcodeValue

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateBarcodeValue()
    try {
      const updated = await prisma.item.update({ where: { id: itemId }, data: { barcodeValue: candidate } })
      return updated.barcodeValue!
    } catch (err: any) {
      if (err.code === 'P2002') continue
      throw err
    }
  }
  throw new Error('Failed to generate a unique barcode after 5 attempts')
}

export async function generatePriceTagData(
  session: MinimalSession,
  eventId: string,
  itemIds: string[]
): Promise<Result<PriceTagData[]>> {
  const authz = await requireEventAccess(session, eventId, ['SELLER', 'ADMIN'])
  if (!authz.ok) return authz

  const items = await prisma.item.findMany({ where: { id: { in: itemIds }, eventId } })
  if (items.length === 0) {
    return { ok: false, error: { code: 'NO_ITEMS', message: 'No items found for the given ids' } }
  }

  const isManager = authz.role === 'ADMIN' || authz.role === 'OWNER'
  for (const item of items) {
    if (!isManager && item.sellerId !== authz.userId) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'You can only generate tags for your own items' } }
    }
  }

  const results: PriceTagData[] = []
  for (const item of items) {
    const barcodeValue = await assignBarcodeIfMissing(item.id)
    const membership = await prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId: item.sellerId, eventId } },
    })
    results.push({
      id: item.id,
      name: item.name,
      price: item.price.toString(),
      sellerAlias: membership?.sellerAlias ?? 'Unknown',
      isAgeRestricted: item.isAgeRestricted,
      barcodeValue,
    })
  }

  return { ok: true, data: results }
}

async function renderBarcodePng(value: string): Promise<string> {
  const png = await bwipjs.toBuffer({ bcid: 'code128', text: value, scale: 3, height: 10, includetext: false })
  return `data:image/png;base64,${png.toString('base64')}`
}

const styles = StyleSheet.create({
  page: { padding: 16, flexDirection: 'row', flexWrap: 'wrap' },
  tag: { width: 180, height: 100, border: '1pt solid #000', margin: 4, padding: 6, justifyContent: 'space-between' },
  name: { fontSize: 10, fontWeight: 700 },
  price: { fontSize: 14, fontWeight: 700 },
  meta: { fontSize: 8 },
  barcode: { width: 150, height: 30 },
  code: { fontSize: 8, textAlign: 'center' },
})

export async function renderPriceTagsPdf(tags: PriceTagData[]): Promise<Buffer> {
  const withImages = await Promise.all(
    tags.map(async (tag) => ({ ...tag, barcodeImage: await renderBarcodePng(tag.barcodeValue) }))
  )

  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        {withImages.map((tag) => (
          <View key={tag.id} style={styles.tag}>
            <Text style={styles.name}>{tag.name}</Text>
            <Text style={styles.price}>{tag.price} €</Text>
            <Text style={styles.meta}>
              {tag.sellerAlias}
              {tag.isAgeRestricted ? ' — K-18' : ''}
            </Text>
            <Image src={tag.barcodeImage} style={styles.barcode} />
            <Text style={styles.code}>{tag.barcodeValue}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}
