import { hash, verify, type Algorithm } from '@node-rs/argon2'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

export async function hashPassword(password: string): Promise<string> {
  // Algorithm.Argon2id = 2 (per node_modules/@node-rs/argon2/index.d.ts). Algorithm is an
  // ambient const enum; isolatedModules (required by Next.js/SWC) forbids importing its
  // values directly, only its type, so the literal value is asserted here instead.
  return hash(password, { algorithm: 2 as Algorithm })
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return verify(hash, password)
}

const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const key = process.env.PII_ENCRYPTION_KEY
  if (!key) throw new Error('PII_ENCRYPTION_KEY is not set')
  const buf = Buffer.from(key, 'base64')
  if (buf.length !== 32) throw new Error('PII_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return buf
}

export function encryptIban(iban: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(iban, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64')
}

export function decryptIban(ciphertextB64: string): string {
  const key = getEncryptionKey()
  const raw = Buffer.from(ciphertextB64, 'base64')
  const iv = raw.subarray(0, IV_LENGTH)
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
