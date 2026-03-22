# 🎬 ScreeningNYC

**ScreeningNYC** is a full-stack web application that aggregates film screenings from independent theaters across New York City, helping users discover showtimes, explore films, and navigate cinema experiences in one place.

---

## ✨ Features

* 🎥 **Film Aggregation**

  * Collects real-time showtimes from NYC independent theaters (Metrograph, Film Forum, IFC Center, Quad, MoMA)
  * Normalizes data into a unified format

* 📅 **Date-based Browsing**

  * View all screenings for a selected date
  * Quickly switch between days

* 🎭 **Theater Filtering**

  * Filter showtimes by selected theaters
  * Dynamic UI filtering without reload

* 🗺️ **Map View**

  * Interactive map showing theater locations
  * Click a theater → view filtered screenings

* 🎞️ **Movie Detail Pages**

  * Show film metadata and all available showtimes
  * Future: TMDB enrichment (poster, cast, rating)

* ⚡ **Performance Optimized**

  * Cached queries and efficient Prisma relations
  * Sub-150ms response time (target)

---

## 🏗️ Tech Stack

### Frontend

* **Next.js (App Router)**
* React (Client + Server Components)
* TypeScript

### Backend

* Next.js API Routes
* Prisma ORM

### Database

* PostgreSQL

### Data Ingestion

* Custom scrapers (Cheerio / Fetch)
* Scheduled ingestion pipeline (cron / queue)

### External APIs 

* TMDB API for movie metadata enrichment

---

## 📂 Project Structure

```
screeningnyc/
├── app/
│   ├── page.tsx                # Homepage (films)
│   ├── date/                   # Date-based browsing
│   ├── map/                    # Map view
│   └── movie/[id]/             # Movie detail page
│
├── components/
│   ├── Header.tsx
│   ├── DateSelector.tsx
│   ├── TheaterFilter.tsx
│   └── MapClientWrapper.tsx
│
├── lib/
│   ├── prisma.ts
│   └── ingest/
│       ├── adapters/           # Theater-specific scrapers
│       ├── config/             # Theater metadata (lat/lng)
│       └── utils/              # Shared parsing logic
│
├── scripts/
│   └── ingest_theater.ts       # Run ingestion pipeline
│
├── prisma/
│   └── schema.prisma
│
└── .env
```

---

## ⚙️ Setup & Installation

### 1. Clone the repo

```bash
git clone https://github.com/your-username/screeningnyc.git
cd screeningnyc
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file:

```env
DATABASE_URL="your_postgres_url"
```

---

### 4. Setup database

```bash
npx prisma migrate dev
```

---

### 5. Run ingestion (fetch theater data)

```bash
npm run ingest:theater
```

---

### 6. Start development server

```bash
npm run dev
```

Open:

```
http://localhost:3000
```

---

## 🔄 Data Pipeline

1. Scrapers fetch showtimes from theater websites
2. Data is parsed and normalized
3. Stored via Prisma into PostgreSQL
4. Frontend queries database for rendering

---

## 🧠 Design Highlights

* **Modular Scraper Architecture**

  * Each theater has its own adapter
  * Easy to extend for new theaters

* **Separation of Concerns**

  * Scraping, parsing, storage, and UI clearly separated

* **Scalable Data Model**

  * Movie ↔ Showtime ↔ Theater relational design

---

## 🚀 Roadmap

* [ ] TMDB integration (poster, ratings, cast)
* [ ] User accounts & favorites
* [ ] Ticket linking / price tracking
* [ ] Background job queue (Redis + workers)
* [ ] Real-time updates / caching layer
* [ ] Mobile UI optimization


---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

## 💡 Inspiration

Independent theaters in NYC often have fragmented information across different websites.
ScreeningNYC aims to unify and simplify the discovery experience for film lovers.

