import Papa from 'papaparse'
import ExcelJS from 'exceljs'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

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
