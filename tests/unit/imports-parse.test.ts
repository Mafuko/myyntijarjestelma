import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseImportFile } from '@/lib/services/imports'

describe('parseImportFile', () => {
  it('parses a CSV file into row records keyed by header', async () => {
    const csv = 'Tavara,Hinta,Tyyppi,K-18\nManga Vol. 1,5,Kirjat ja lehdet,\nHorror DVD,8,Elektroniikka,x\n'
    const result = await parseImportFile('items.csv', Buffer.from(csv, 'utf-8'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows).toHaveLength(2)
    expect(result.data.rows[0]).toMatchObject({ Tavara: 'Manga Vol. 1', Hinta: '5' })
  })

  it('parses an XLSX file into row records keyed by header', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Items')
    sheet.addRow(['Tavara', 'Hinta', 'Tyyppi', 'K-18'])
    sheet.addRow(['Manga Vol. 1', 5, 'Kirjat ja lehdet', ''])
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const result = await parseImportFile('items.xlsx', buffer)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows).toHaveLength(1)
    expect(result.data.rows[0].Tavara).toBe('Manga Vol. 1')
  })

  it('rejects a file over the size limit', async () => {
    const oversized = Buffer.alloc(3 * 1024 * 1024, 'a')
    const result = await parseImportFile('items.csv', oversized)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('FILE_TOO_LARGE')
  })

  it('rejects a file with more than the max row count', async () => {
    const header = 'Tavara,Hinta,Tyyppi,K-18\n'
    const rows = Array.from({ length: 1001 }, (_, i) => `Item ${i},1,Muu,`).join('\n')
    const result = await parseImportFile('items.csv', Buffer.from(header + rows, 'utf-8'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('TOO_MANY_ROWS')
  })
})
