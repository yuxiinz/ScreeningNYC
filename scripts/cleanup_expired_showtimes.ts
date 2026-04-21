import 'dotenv/config'
import {
  deleteExpiredShowtimesBatch,
  disconnectPrisma,
} from '../lib/ingest/services/db-admin'

const DEFAULT_BATCH_SIZE = 1000

function parseBatchSize(): number {
  const arg = process.argv.slice(2).find((value) => value.startsWith('--batch-size='))
  if (!arg) return DEFAULT_BATCH_SIZE

  const raw = arg.split('=')[1]
  const value = Number.parseInt(raw || '', 10)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_BATCH_SIZE
  return value
}

async function main() {
  const batchSize = parseBatchSize()
  let totalDeleted = 0

  while (true) {
    const deleted = await deleteExpiredShowtimesBatch(batchSize)
    totalDeleted += deleted

    if (deleted < batchSize) break
  }

  console.log(`[cleanup] Expired showtimes deleted: ${totalDeleted}`)
}

main()
  .catch((error) => {
    console.error('[cleanup] Failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectPrisma()
  })
