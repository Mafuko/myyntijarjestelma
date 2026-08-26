import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }) }))
vi.mock('@/lib/services/items', () => ({
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  createItemBatch: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('createItem action', () => {
  it('coerces the isAgeRestricted checkbox and forwards to the service', async () => {
    const { createItem: createItemAction } = await import('@/actions/items')
    const { createItem: createItemService } = await import('@/lib/services/items')
    vi.mocked(createItemService).mockResolvedValueOnce({ ok: true, data: { itemId: 'item-1' } })

    const formData = new FormData()
    formData.set('name', 'Manga Vol. 1')
    formData.set('price', '5')
    formData.set('categoryId', 'cat-1')
    formData.set('isAgeRestricted', 'on')

    const result = await createItemAction('evt-1', formData)

    expect(result.ok).toBe(true)
    expect(createItemService).toHaveBeenCalledWith(
      { user: { id: 'user-1' } },
      'evt-1',
      expect.objectContaining({ name: 'Manga Vol. 1', isAgeRestricted: true })
    )
  })

  it('treats an absent checkbox as false', async () => {
    const { createItem: createItemAction } = await import('@/actions/items')
    const { createItem: createItemService } = await import('@/lib/services/items')
    vi.mocked(createItemService).mockResolvedValueOnce({ ok: true, data: { itemId: 'item-2' } })

    const formData = new FormData()
    formData.set('name', 'Manga Vol. 2')
    formData.set('price', '5')
    formData.set('categoryId', 'cat-1')

    await createItemAction('evt-1', formData)

    expect(createItemService).toHaveBeenCalledWith(
      { user: { id: 'user-1' } },
      'evt-1',
      expect.objectContaining({ isAgeRestricted: false })
    )
  })
})

describe('createItemBatch action', () => {
  it('coerces the isAgeRestricted checkbox and forwards to the service', async () => {
    const { createItemBatch: createItemBatchAction } = await import('@/actions/items')
    const { createItemBatch: createItemBatchService } = await import('@/lib/services/items')
    vi.mocked(createItemBatchService).mockResolvedValueOnce({ ok: true, data: { itemIds: ['item-1', 'item-2'] } })

    const formData = new FormData()
    formData.set('baseName', 'Naruto')
    formData.set('startVolume', '1')
    formData.set('endVolume', '2')
    formData.set('price', '5')
    formData.set('categoryId', 'cat-1')
    formData.set('isAgeRestricted', 'on')
    formData.set('mode', 'series')

    const result = await createItemBatchAction('evt-1', formData)

    expect(result.ok).toBe(true)
    expect(createItemBatchService).toHaveBeenCalledWith(
      { user: { id: 'user-1' } },
      'evt-1',
      expect.objectContaining({ baseName: 'Naruto', mode: 'series', isAgeRestricted: true })
    )
  })

  it('treats an absent checkbox as false', async () => {
    const { createItemBatch: createItemBatchAction } = await import('@/actions/items')
    const { createItemBatch: createItemBatchService } = await import('@/lib/services/items')
    vi.mocked(createItemBatchService).mockResolvedValueOnce({ ok: true, data: { itemIds: ['item-1'] } })

    const formData = new FormData()
    formData.set('baseName', 'Naruto')
    formData.set('startVolume', '1')
    formData.set('endVolume', '4')
    formData.set('price', '15')
    formData.set('categoryId', 'cat-1')
    formData.set('mode', 'bundle')

    await createItemBatchAction('evt-1', formData)

    expect(createItemBatchService).toHaveBeenCalledWith(
      { user: { id: 'user-1' } },
      'evt-1',
      expect.objectContaining({ isAgeRestricted: false, mode: 'bundle' })
    )
  })
})
