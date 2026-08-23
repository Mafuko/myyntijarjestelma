import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type MinimalSession = { user?: { id?: string | null } | null } | null

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024
const MAX_ROWS = 1000

export type RawImportRow = Record<string, string>

export async function parseImportFile(fileName: string, fileBuffer: Buffer): Promise<Result<{ rows: RawImportRow[] }>> {
  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: { code: 'FILE_TOO_LARGE', message: 'File exceeds the 2 MB limit' } }
  }

  const isXlsx = fileName.toLowerCase().endsWith('.xlsx')
  let rows: RawImportRow[]

  if (isXlsx) {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(fileBuffer)
    const sheet = workbook.worksheets[0]
    if (!sheet) {
      return { ok: false, error: { code: 'EMPTY_FILE', message: 'No worksheet found' } }
    }

    const headerRow = sheet.getRow(1).values as unknown[]
    const headers = headerRow.slice(1).map((h) => String(h ?? '').trim())
    rows = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const values = row.values as unknown[]
      const record: RawImportRow = {}
      headers.forEach((header, i) => {
        record[header] = String(values[i + 1] ?? '').trim()
      })
      rows.push(record)
    })
  } else {
    const parsed = Papa.parse<RawImportRow>(fileBuffer.toString('utf-8'), { header: true, skipEmptyLines: true })
    if (parsed.errors.length > 0) {
      return { ok: false, error: { code: 'PARSE_ERROR', message: parsed.errors[0].message } }
    }
    rows = parsed.data.map((row) => {
      const trimmed: RawImportRow = {}
      for (const [key, value] of Object.entries(row)) trimmed[key.trim()] = String(value ?? '').trim()
      return trimmed
    })
  }

  if (rows.length > MAX_ROWS) {
    return { ok: false, error: { code: 'TOO_MANY_ROWS', message: `File has more than ${MAX_ROWS} rows` } }
  }

  return { ok: true, data: { rows } }
}

const importRowSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.coerce.number().positive().max(100000),
  categoryName: z.string().min(1),
  isAgeRestricted: z.boolean(),
})

const HEADER_ALIASES: Record<string, 'name' | 'price' | 'categoryName' | 'isAgeRestricted'> = {
  tavara: 'name',
  nimi: 'name',
  name: 'name',
  hinta: 'price',
  price: 'price',
  tyyppi: 'categoryName',
  kategoria: 'categoryName',
  category: 'categoryName',
  'k-18': 'isAgeRestricted',
  k18: 'isAgeRestricted',
}

function normalizeRow(raw: RawImportRow): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const canonical = HEADER_ALIASES[key.trim().toLowerCase()]
    if (canonical) normalized[canonical] = value
  }
  return normalized
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false
  return ['true', '1', 'x', 'kyllä', 'yes'].includes(value.trim().toLowerCase())
}

export type RowError = { row: number; field: string; message: string }
export type ValidatedRow = { name: string; price: number; categoryId: string; isAgeRestricted: boolean }

export async function validateImportRows(
  eventId: string,
  rawRows: RawImportRow[]
): Promise<{ validRows: ValidatedRow[]; rowErrors: RowError[] }> {
  const categories = await prisma.category.findMany({ where: { eventId } })
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))

  const validRows: ValidatedRow[] = []
  const rowErrors: RowError[] = []

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2
    const normalized = normalizeRow(raw)
    const parsed = importRowSchema.safeParse({
      name: normalized.name,
      price: normalized.price,
      categoryName: normalized.categoryName,
      isAgeRestricted: parseBoolean(normalized.isAgeRestricted),
    })

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        rowErrors.push({ row: rowNumber, field: String(issue.path[0] ?? 'unknown'), message: issue.message })
      }
      return
    }

    const categoryId = categoryByName.get(parsed.data.categoryName.toLowerCase())
    if (!categoryId) {
      rowErrors.push({ row: rowNumber, field: 'categoryName', message: `Unknown category "${parsed.data.categoryName}"` })
      return
    }

    validRows.push({ name: parsed.data.name, price: parsed.data.price, categoryId, isAgeRestricted: parsed.data.isAgeRestricted })
  })

  return { validRows, rowErrors }
}

export async function commitImport(
  session: MinimalSession,
  eventId: string,
  rows: ValidatedRow[]
): Promise<Result<{ createdCount: number }>> {
  const authz = await requireEventAccess(session, eventId, ['SELLER'])
  if (!authz.ok) return authz

  if (rows.length === 0) {
    return { ok: false, error: { code: 'NO_ROWS', message: 'No valid rows to import' } }
  }

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  if (new Date() > event.itemEditCutoffDate) {
    return { ok: false, error: { code: 'CUTOFF_PASSED', message: 'The item edit cutoff date has passed' } }
  }

  // createMany compiles to a single INSERT statement — atomic by construction,
  // so a failure partway through never leaves a partial batch committed.
  await prisma.item.createMany({
    data: rows.map((row) => ({
      eventId,
      sellerId: authz.userId,
      name: row.name,
      price: row.price,
      categoryId: row.categoryId,
      isAgeRestricted: row.isAgeRestricted,
    })),
  })

  return { ok: true, data: { createdCount: rows.length } }
}
