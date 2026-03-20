import { scrapeFilmForumShowtimes } from "@/lib/ingest/adapters/filmforum_adapter"

async function main() {
  const rows = await scrapeFilmForumShowtimes({
    sourceUrl: "https://filmforum.org",
  })

  console.log("Total rows:", rows.length)

  // 打印前 5 条看看
  console.log(rows.slice(0, 5))
}

main().catch(console.error)