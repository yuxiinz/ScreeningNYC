import 'dotenv/config'

import { prisma } from '../lib/prisma'
import { runWatchlistReminderJob } from '../lib/watchlist-reminders/service'

function parseBooleanFlag(flag: string) {
  return process.argv.slice(2).includes(flag)
}

function parseNow(): Date | undefined {
  const arg = process.argv.slice(2).find((value) => value.startsWith('--now='))
  if (!arg) return undefined

  const raw = arg.split('=')[1]
  const parsed = new Date(raw || '')

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --now value: ${raw}`)
  }

  return parsed
}

function parseMode(): 'auto' | 'summary' | 'transition' {
  const arg = process.argv.slice(2).find((value) => value.startsWith('--mode='))
  if (!arg) return 'auto'

  const raw = (arg.split('=')[1] || '').trim().toLowerCase()

  if (raw === 'summary' || raw === 'transition' || raw === 'auto') {
    return raw
  }

  throw new Error(`Invalid --mode value: ${raw}`)
}

async function main() {
  const result = await runWatchlistReminderJob({
    dryRun: parseBooleanFlag('--dry-run'),
    force: parseBooleanFlag('--force'),
    now: parseNow(),
    mode: parseMode(),
  })

  console.log(
    `[watchlist-reminders] mode=${result.executedMode} dryRun=${result.dryRun} initialized=${result.initializedWatchlistItems} transitionCandidates=${result.transitionCandidates} transitionEmailsSent=${result.transitionEmailsSent} transitionItemsDelivered=${result.transitionItemsDelivered} summaryCandidates=${result.summaryCandidates} summaryEmailsSent=${result.summaryEmailsSent}${result.skippedReason ? ` reason="${result.skippedReason}"` : ''}`
  )
}

main()
  .catch((error) => {
    console.error('[watchlist-reminders] Failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
