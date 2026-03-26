import { compare, hash } from 'bcryptjs'

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_BYTES = 72

export async function hashPassword(password: string) {
  return hash(password, 12)
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash)
}

export function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }

  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `Password must be ${MAX_PASSWORD_BYTES} bytes or fewer.`
  }

  return null
}
