import { describe, it, expect } from 'vitest'

const VALID_MIN_ROLES = ['SELLER', 'STAFF', 'ADMIN']

describe('release-notes.json content', () => {
  it('has entries with a well-formed date, sorted most-recent-first, and complete translations', async () => {
    const notes = (await import('@/messages/release-notes.json')).default as Array<{
      date: string
      minRole?: string
      en: string
      fi: string
    }>

    expect(notes.length).toBeGreaterThan(0)

    for (const note of notes) {
      expect(note.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(typeof note.en).toBe('string')
      expect(note.en.length).toBeGreaterThan(0)
      expect(typeof note.fi).toBe('string')
      expect(note.fi.length).toBeGreaterThan(0)
      if (note.minRole !== undefined) {
        expect(VALID_MIN_ROLES).toContain(note.minRole)
      }
    }

    for (let i = 0; i < notes.length - 1; i++) {
      expect(notes[i].date > notes[i + 1].date).toBe(true)
    }
  })
})
