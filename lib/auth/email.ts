import { authEnv, getAppBaseUrl, isMagicLinkConfigured } from './env'

type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

type ResendEmailResponse = {
  id?: string
  error?: {
    message?: string
  }
}

function maskEmailAddress(email: string) {
  const [localPart = '', domain = ''] = email.split('@')

  if (!localPart || !domain) {
    return '[invalid-email]'
  }

  const visibleLocalPart =
    localPart.length <= 2
      ? `${localPart[0] || '*'}*`
      : `${localPart.slice(0, 2)}***`

  return `${visibleLocalPart}@${domain}`
}

export async function sendEmail(params: SendEmailInput) {
  if (!isMagicLinkConfigured()) {
    throw new Error('Email delivery is not configured.')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authEnv.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: authEnv.emailFrom,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  })

  const payload = (await response.json()) as ResendEmailResponse

  if (!response.ok) {
    const message = payload.error?.message || 'Failed to send email.'

    console.error('[auth][email][send-failed]', {
      to: maskEmailAddress(params.to),
      subject: params.subject,
      status: response.status,
      message,
    })

    throw new Error(message)
  }

  const messageId = payload.id || null

  if (process.env.NODE_ENV !== 'production') {
    console.log('[auth][email][sent]', {
      to: maskEmailAddress(params.to),
      subject: params.subject,
      messageId,
    })
  }

  return messageId
}

export async function sendPasswordVerificationEmail(params: {
  to: string
  name?: string | null
  verifyUrl: string
}) {
  const host = new URL(getAppBaseUrl()).host
  const greeting = params.name ? `Hi ${params.name},` : 'Hi,'

  return sendEmail({
    to: params.to,
    subject: `Verify your Screening NYC email`,
    html: `
      <div style="font-family: Helvetica Neue, Arial, sans-serif; color: #111;">
        <p>${greeting}</p>
        <p>Finish setting up your password login for Screening NYC by verifying your email address.</p>
        <p>
          <a href="${params.verifyUrl}" style="display: inline-block; padding: 12px 18px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">
            Verify email
          </a>
        </p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p>${params.verifyUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p>${host}</p>
      </div>
    `,
    text: [
      greeting,
      '',
      'Finish setting up your password login for Screening NYC by verifying your email address.',
      '',
      params.verifyUrl,
      '',
      'This link will expire in 24 hours.',
      host,
    ].join('\n'),
  })
}
