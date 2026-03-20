import { prisma } from '../lib/prisma'; 

async function main() {
  console.log("Cleaning old data ... ");
  // 注意删除顺序：先删有外键依赖的 (Showtime)，再删被依赖的
  await prisma.showtime.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.theater.deleteMany();
  await prisma.format.deleteMany();

  console.log("Creating format ...");
  const digital = await prisma.format.create({
    data: {
      name: "Digital",
      description: "Standard digital screening",
    },
  });

  const imax = await prisma.format.create({
    data: {
      name: "IMAX",
      description: "IMAX screening",
    },
  });

  console.log("Creating theaters ...");
  const metrograph = await prisma.theater.create({
    data: {
      name: "Metrograph",
      address: "7 Ludlow St, New York, NY 10002",
      latitude: 40.7182,
      longitude: -73.9881,
      borough: "Manhattan",
      officialSiteUrl: "https://metrograph.com",
    },
  });

  const filmForum = await prisma.theater.create({
    data: {
      name: "Film Forum",
      address: "209 W Houston St, New York, NY 10014",
      latitude: 40.7285,
      longitude: -74.0047,
      borough: "Manhattan",
      officialSiteUrl: "https://filmforum.org",
    },
  });

  console.log("Creating movies ...");
  const movie1 = await prisma.movie.create({
    data: {
      title: "In the Mood for Love",
      originalTitle: "花样年华",
      overview: "Two neighbors form a bond that grows into a delicate and restrained romance.",
      posterUrl: "https://image.tmdb.org/t/p/w500/sample1.jpg",
      doubanUrl: "https://movie.douban.com",
      letterboxdUrl: "https://letterboxd.com",
      genresText: "Drama, Romance",
      directorText: "Wong Kar Wai",
    },
  });

  const movie2 = await prisma.movie.create({
    data: {
      title: "Perfect Days",
      overview: "A quiet and reflective portrait of daily life in Tokyo.",
      posterUrl: "https://image.tmdb.org/t/p/w500/sample2.jpg",
      doubanUrl: "https://movie.douban.com",
      letterboxdUrl: "https://letterboxd.com",
      genresText: "Drama",
      directorText: "Wim Wenders",
    },
  });

  console.log("Creating showtimes ...");
  await prisma.showtime.createMany({
    data: [
      {
        movieId: movie1.id,
        theaterId: metrograph.id,
        formatId: digital.id,
        startTime: new Date("2026-03-19T19:00:00-04:00"),
        ticketUrl: "https://metrograph.com",
        sourceName: "Metrograph",
        sourceUrl: "https://metrograph.com",
      },
      {
        movieId: movie1.id,
        theaterId: filmForum.id,
        formatId: digital.id,
        startTime: new Date("2026-03-20T20:30:00-04:00"),
        ticketUrl: "https://filmforum.org",
        sourceName: "Film Forum",
        sourceUrl: "https://filmforum.org",
      },
      {
        movieId: movie2.id,
        theaterId: metrograph.id,
        formatId: imax.id,
        startTime: new Date("2026-03-21T18:00:00-04:00"),
        ticketUrl: "https://metrograph.com",
        sourceName: "Metrograph",
        sourceUrl: "https://metrograph.com",
      },
    ],
  });

  console.log("✅ All seed data in Neon！");

  const movie = await prisma.movie.findFirst({
    where: { title: { contains: 'In the Mood for Love' } }
  });

  // 2. 找到或创建两个影院
  const theater1 = await prisma.theater.findFirst({ where: { name: 'Metrograph' } });
  const theater2 = await prisma.theater.findFirst({ where: { name: 'Film Forum' } });

  if (!movie || !theater1 || !theater2) {
    console.log("缺少电影或影院数据，请先确保基础数据已 Seed");
    return;
  }

  // 3. 定义 3月19日的场次时间点 (纽约时间)
  const dateStr = "2026-03-19";
  
  // Metrograph 的 4 场 (14:00, 17:00, 20:00, 23:00)
  const times1 = ["14:00", "17:00", "20:00", "23:00"];
  // Film Forum 的 4 场 (15:30, 18:30, 21:30, 00:30)
  const times2 = ["15:30", "18:30", "21:30", "00:30"];

  console.log(`正在为 ${movie.title} 注入密集场次测试数据...`);

  // 注入 Metrograph 场次
  for (const t of times1) {
    await prisma.showtime.upsert({
      where: {
        theaterId_startTime_movieId_formatId: {
          theaterId: theater1.id,
          movieId: movie.id,
          startTime: new Date(`${dateStr}T${t}:00Z`),
          formatId: 1, // 假设 1 是 35mm 或 Digital
        }
      },
      update: {},
      create: {
        movieId: movie.id,
        theaterId: theater1.id,
        startTime: new Date(`${dateStr}T${t}:00Z`),
        ticketUrl: `https://metrograph.com/tickets/${t.replace(':', '')}`,
      }
    });
  }

  // 注入 Film Forum 场次
  for (const t of times2) {
    await prisma.showtime.upsert({
      where: {
        theaterId_startTime_movieId_formatId: {
          theaterId: theater2.id,
          movieId: movie.id,
          startTime: new Date(`${dateStr}T${t}:00Z`),
          formatId: 1,
        }
      },
      update: {},
      create: {
        movieId: movie.id,
        theaterId: theater2.id,
        startTime: new Date(`${dateStr}T${t}:00Z`),
        ticketUrl: `https://filmforum.org/tickets/${t.replace(':', '')}`,
      }
    });
  }

  console.log("Seed 密集场次完成！");

}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });