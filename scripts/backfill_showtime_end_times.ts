import 'dotenv/config'
import {
  backfillMissingShowtimeEndTimesBatch,
  deleteExpiredShowtimesBatch,
  disconnectPrisma,
} from '../lib/ingest/services/persist_service'

const BACKFILL_BATCH_SIZE = 500
const CLEANUP_BATCH_SIZE = 1000

async function runBackfill() {
  let totalUpdated = 0

  while (true) {
    const updated = await backfillMissingShowtimeEndTimesBatch(BACKFILL_BATCH_SIZE)
    totalUpdated += updated

    if (updated < BACKFILL_BATCH_SIZE) break
  }

  return totalUpdated
}

async function runCleanup() {
  let totalDeleted = 0

  while (true) {
    const deleted = await deleteExpiredShowtimesBatch(CLEANUP_BATCH_SIZE)
    totalDeleted += deleted

    if (deleted < CLEANUP_BATCH_SIZE) break
  }

  return totalDeleted
}

async function main() {
  const updated = await runBackfill()
  const deleted = await runCleanup()

  console.log(`[backfill] Missing endTime filled: ${updated}`)
  console.log(`[backfill] Expired showtimes deleted: ${deleted}`)
}

main()
  .catch((error) => {
    console.error('[backfill] Failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectPrisma()
  })
