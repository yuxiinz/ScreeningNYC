import axios from 'axios';
import * as cheerio from 'cheerio';

export interface RawShowtime {
  movieTitle: string;
  startTimeRaw: string;
  ticketUrl?: string;
}

export async function fetchMetrograph(): Promise<RawShowtime[]> {
  const url = 'https://metrograph.com/calendar/';
  const { data: html } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0...' }
  });
  
  const $ = cheerio.load(html);
  const results: RawShowtime[] = [];

  // Metrograph 结构：通常场次在 .calendar-slot 或类似容器里
  $('.calendar-slot, .film-display').each((_, el) => {
    const title = $(el).find('.film-title, h3').text().trim();
    const time = $(el).find('.showtime-time, .time').text().trim();
    const link = $(el).find('a[href*="ticket"]').attr('href');

    if (title && time) {
      results.push({ movieTitle: title, startTimeRaw: time, ticketUrl: link });
    }
  });

  return results;
}