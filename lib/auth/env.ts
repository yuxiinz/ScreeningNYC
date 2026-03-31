const isProduction = process.env.NODE_ENV === 'production'
const defaultSiteUrl = 'https://www.screeningnyc.com'

function stripTrailingSlash(input: string) {
  return input.replace(/\/+$/, '')
}

const fallbackBaseUrl = 'http://localhost:3000'

function isLocalHostUrl(input?: string) {
  if (!input) return false

  try {
    const host = new URL(input).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
  } catch {
    return false
  }
}

export const authEnv = {
  secret:
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    (isProduction ? undefined : 'screeningnyc-dev-auth-secret'),
  googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID,
  googleClientSecret:
    process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET,
  resendApiKey: process.env.RESEND_API_KEY || process.env.AUTH_RESEND_KEY,
  emailFrom: process.env.EMAIL_FROM,
  baseUrl: stripTrailingSlash(
    process.env.APP_BASE_URL ||
      process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      fallbackBaseUrl
  ),
}

export function isGoogleAuthConfigured() {
  return Boolean(authEnv.googleClientId && authEnv.googleClientSecret)
}

export function isMagicLinkConfigured() {
  return Boolean(authEnv.resendApiKey && authEnv.emailFrom)
}

export function getAppBaseUrl() {
  return authEnv.baseUrl
}

export function getReminderBaseUrl() {
  if (process.env.REMINDER_BASE_URL) {
    return stripTrailingSlash(process.env.REMINDER_BASE_URL)
  }

  const publicBaseUrl = [
    process.env.APP_BASE_URL,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
  ].find((value) => value && !isLocalHostUrl(value))

  return stripTrailingSlash(publicBaseUrl || defaultSiteUrl)
}

export function getAuthFeatureFlags() {
  return {
    google: isGoogleAuthConfigured(),
    magicLink: isMagicLinkConfigured(),
  }
}
