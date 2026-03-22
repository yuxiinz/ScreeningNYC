// lib/ingest/core/http.ts

import axios from 'axios'

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
}

export async function fetchHtml(url: string): Promise<string> {
  const res = await axios.get<string>(url, {
    timeout: 20000,
    headers: DEFAULT_HEADERS,
    responseType: 'text',
  })

  return res.data
}