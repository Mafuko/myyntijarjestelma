import { test, expect } from '@playwright/test'

test('responses include core security headers', async ({ page }) => {
  const response = await page.goto('/login')
  const headers = response?.headers() ?? {}

  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
})
