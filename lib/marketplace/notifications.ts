import { sendEmail } from '@/lib/auth/email'
import { getReminderBaseUrl } from '@/lib/auth/env'
import { prisma } from '@/lib/prisma'
import { getOppositeMarketplacePostType } from '@/lib/marketplace/shared'
import { getMarketplaceDisplayName, getMarketplaceShowtimeLabel } from '@/lib/marketplace/selects'

export async function notifyMatchingMarketplacePosts(triggerPostId: number) {
  const triggerPost = await prisma.marketplacePost.findUnique({
    where: {
      id: triggerPostId,
    },
    select: {
      id: true,
      userId: true,
      type: true,
      status: true,
      quantity: true,
      priceCents: true,
      showtimeId: true,
      user: {
        select: {
          name: true,
        },
      },
      showtime: {
        select: {
          id: true,
          startTime: true,
          movie: {
            select: {
              id: true,
              title: true,
            },
          },
          theater: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  })

  if (!triggerPost || triggerPost.status !== 'ACTIVE') {
    return 0
  }

  const recipientType = getOppositeMarketplacePostType(triggerPost.type)
  const recipients = await prisma.marketplacePost.findMany({
    where: {
      showtimeId: triggerPost.showtimeId,
      status: 'ACTIVE',
      type: recipientType,
      userId: {
        not: triggerPost.userId,
      },
    },
    select: {
      id: true,
      user: {
        select: {
          email: true,
          name: true,
        },
      },
    },
  })

  if (recipients.length === 0) {
    return 0
  }

  const existingNotifications = await prisma.marketplaceMatchNotification.findMany({
    where: {
      triggerPostId,
      recipientPostId: {
        in: recipients.map((recipient) => recipient.id),
      },
    },
    select: {
      recipientPostId: true,
    },
  })
  const existingRecipientIds = new Set(
    existingNotifications.map((notification) => notification.recipientPostId)
  )

  const baseUrl = getReminderBaseUrl()
  const marketplaceUrl = `${baseUrl}/market/films/${triggerPost.showtime.movie.id}`
  const triggerLabel =
    triggerPost.type === 'SELL'
      ? `A new seller posted ${triggerPost.quantity} ticket${triggerPost.quantity === 1 ? '' : 's'}`
      : `A new buyer is looking for ${triggerPost.quantity} ticket${triggerPost.quantity === 1 ? '' : 's'}`
  const priceLabel =
    triggerPost.type === 'SELL' && typeof triggerPost.priceCents === 'number'
      ? ` for $${(triggerPost.priceCents / 100).toFixed(2)}`
      : ''
  const showtimeLabel = getMarketplaceShowtimeLabel(triggerPost.showtime.startTime)

  let notifiedMatchCount = 0

  for (const recipient of recipients) {
    if (existingRecipientIds.has(recipient.id)) {
      continue
    }

    try {
      const messageId = await sendEmail({
        to: recipient.user.email,
        subject: `New ${triggerPost.type} match for ${triggerPost.showtime.movie.title}`,
        html: `
          <div style="font-family: Helvetica Neue, Arial, sans-serif; color: #111;">
            <p>Hi ${getMarketplaceDisplayName(recipient.user.name)},</p>
            <p>${triggerLabel}${priceLabel} for <strong>${triggerPost.showtime.movie.title}</strong>.</p>
            <p>${showtimeLabel} at ${triggerPost.showtime.theater.name}.</p>
            <p>
              <a href="${marketplaceUrl}" style="display: inline-block; padding: 12px 18px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">
                Open marketplace
              </a>
            </p>
            <p>You still need to contact the other user directly inside Screening NYC to finish the trade.</p>
          </div>
        `,
        text: [
          `Hi ${getMarketplaceDisplayName(recipient.user.name)},`,
          '',
          `${triggerLabel}${priceLabel} for ${triggerPost.showtime.movie.title}.`,
          `${showtimeLabel} at ${triggerPost.showtime.theater.name}.`,
          '',
          marketplaceUrl,
          '',
          'You still need to contact the other user directly inside Screening NYC to finish the trade.',
        ].join('\n'),
      })

      await prisma.marketplaceMatchNotification.create({
        data: {
          triggerPostId,
          recipientPostId: recipient.id,
          sentToEmail: recipient.user.email,
          resendMessageId: messageId || undefined,
        },
      })

      notifiedMatchCount += 1
    } catch (error) {
      console.error('[marketplace][notify-match]', error, {
        recipientPostId: recipient.id,
        triggerPostId,
      })
    }
  }

  return notifiedMatchCount
}
