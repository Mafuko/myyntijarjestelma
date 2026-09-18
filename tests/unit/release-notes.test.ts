import { describe, it, expect } from 'vitest'
import { selectVisibleNote, type ReleaseNote } from '@/lib/services/release-notes'

const notes: ReleaseNote[] = [
  { date: '2026-09-18', minRole: 'STAFF', en: 'Staff note', fi: 'Henkilökunnan tiedote' },
  { date: '2026-09-11', en: 'General note', fi: 'Yleinen tiedote' },
]

describe('selectVisibleNote', () => {
  it('returns the newest entry visible to a SELLER when the newest overall is STAFF-only', () => {
    const result = selectVisibleNote(notes, 'SELLER', null)
    expect(result?.date).toBe('2026-09-11')
  })

  it('returns the newest entry (including STAFF-only ones) for a STAFF role', () => {
    const result = selectVisibleNote(notes, 'STAFF', null)
    expect(result?.date).toBe('2026-09-18')
  })

  it('returns null once the visible-latest date matches lastSeenDate', () => {
    const result = selectVisibleNote(notes, 'SELLER', '2026-09-11')
    expect(result).toBeNull()
  })

  it('returns the newer visible entry again if lastSeenDate is an older, already-dismissed one', () => {
    const result = selectVisibleNote(notes, 'STAFF', '2026-09-11')
    expect(result?.date).toBe('2026-09-18')
  })

  it('returns null for an empty notes array', () => {
    expect(selectVisibleNote([], 'ADMIN', null)).toBeNull()
  })
})
