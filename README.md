# Screening NYC

Screening NYC 是一个围绕纽约影院排片信息构建的 Next.js 应用。  
它当前的业务主线不是“电影数据库”，而是三件事：

1. 查询 NYC 影院当前和近期的 on-screening 排片情况
2. 登录后把电影或导演加入 want list，并订阅提醒
3. 登录后发布电影票买卖信息，但平台只做信息共享，不做信息筛查，也不在站内成交

线上地址：<https://www.screeningnyc.com/>

## 业务逻辑

### 1. 查询 on-screening 排片情况

这是项目的公共主入口，不登录也能用。

用户可以做的事情：

- 在首页 `/` 查看当前有排片的电影
- 在 `/date` 按日期查看某一天的排片
- 在 `/map` 按影院地图查看
- 在 `/films/[id]` 看单部电影的排片详情
- 用搜索框搜索电影；登录后还能把 TMDB 外部结果落地成站内页面

这一块对应的代码主要在：

- 页面入口
  - `app/(browse)/page.tsx`
  - `app/(browse)/date/page.tsx`
  - `app/(browse)/map/page.tsx`
  - `app/films/[id]/page.tsx`
- UI 组件
  - `components/FilmSearchBox.tsx`
  - `components/TheaterFilter.tsx`
  - `components/showtime/ShowtimeRow.tsx`
  - `components/map/*`
- 数据读取与缓存
  - `lib/cache/public-data.ts`
  - `lib/movie/search-service.ts`
  - `lib/api/search-route.ts`
  - `lib/api/client-search.ts`
- 数据来源与落库
  - `lib/ingest/adapters/*`
  - `lib/ingest/services/persist_service.ts`
  - `lib/ingest/services/tmdb_service.ts`
  - `scripts/ingest_theater.ts`

这部分的核心数据模型是：

- `Movie`: 电影主记录
- `Theater`: 影院
- `Showtime`: 某场具体排片
- `Format`: 格式信息，例如 `35mm`、`70mm`、`DCP`

### 2. 登录后标记 want，订阅影片

这一块是用户状态层。  
当前不只是“想看电影”，还包括“关注导演”。

用户登录后可以：

- 把电影加入 want list
- 把导演加入 want list
- 在 `/me/want-list` 查看自己的电影和导演 want list
- 开启或关闭提醒邮件
- 在电影开始上映时收到 noon reminder
- 在周五中午收到一次汇总 summary

相关代码主要在：

- 页面入口
  - `app/(browse)/me/page.tsx`
  - `app/(browse)/me/want-list/page.tsx`
- API
  - `app/api/me/movies/[movieId]/want/route.ts`
  - `app/api/me/people/[personId]/want/route.ts`
  - `app/api/me/movies/search/route.ts`
  - `app/api/me/people/search/route.ts`
  - `app/api/me/movies/resolve/route.ts`
  - `app/api/me/people/resolve/route.ts`
- 业务服务
  - `lib/user-movies/service.ts`
  - `lib/user-directors/service.ts`
  - `lib/watchlist-reminders/service.ts`
  - `lib/watchlist-reminders/content.ts`
- 相关组件
  - `components/movie/MovieListActions.tsx`
  - `components/person/DirectorListActions.tsx`
  - `components/me/want-list/*`
  - `components/auth/EmailReminderToggle.tsx`

提醒逻辑说明：

- 平日中午主要发“刚开始上映”的 transition reminder
- 周五中午主要发 summary reminder
- 邮件只是一种提醒手段，不替代站内 want list

### 3. 登录后电影票交易

这一块是 marketplace。

用户登录后可以：

- 在 `/market` 按电影查看当前活跃的 BUY / SELL 信息
- 在 `/market/new` 按 4 步创建帖子
  - 先选 BUY 或 SELL
  - 再选电影
  - 再选具体 showtime
  - 最后填写数量、价格、座位信息和联系方式
- 在 `/market/films/[id]` 按具体 showtime 查看该电影的买卖信息
- 在 `/me/market` 管理自己的帖子

平台边界非常明确：

- 平台只展示用户填写的信息
- 平台不做票务审核、身份背书、真伪筛查
- 平台不处理付款、托管、退款
- 平台不在站内成交
- 用户只是在站内交换联系方式，后续交易在线下或站外自行完成

相关代码主要在：

- 页面入口
  - `app/(browse)/market/page.tsx`
  - `app/(browse)/market/new/page.tsx`
  - `app/(browse)/market/films/[id]/page.tsx`
  - `app/(browse)/me/market/page.tsx`
- API
  - `app/api/me/marketplace/posts/route.ts`
  - `app/api/me/marketplace/posts/batch/route.ts`
  - `app/api/me/marketplace/posts/[postId]/route.ts`
  - `app/api/me/marketplace/posts/[postId]/contact/route.ts`
- 业务服务
  - `lib/marketplace/service.ts`
  - `lib/marketplace/request-body.ts`
  - `lib/marketplace/http.ts`
  - `lib/marketplace/errors.ts`
- 相关组件
  - `components/marketplace/*`

当前 marketplace 设计上是“按电影 -> 按场次 -> 看 BUY/SELL”，不是泛化二手平台。

## 当前覆盖影院

项目当前抓取并标准化这些影院的排片：

- Metrograph
- Film Forum
- Film at Lincoln Center
- IFC Center
- Quad Cinema
- Cinema Village
- Spectacle
- Roxy Cinema
- MoMA
- Museum of the Moving Image
- Anthology Film Archives
- BAM
- Angelika New York
- Village East by Angelika
- Cinema 123 by Angelika
- Paris Theater
- Nitehawk Williamsburg
- Nitehawk Prospect Park
- Japan Society

影院元数据在 `lib/ingest/config/theater_meta.ts`，抓取入口在 `lib/ingest/adapters/index.ts`。

## 目录结构

下面这个结构不是按技术层随便堆，而是按当前业务拆的：

```text
screeningnyc/
├── app/
│   ├── (browse)/
│   │   ├── page.tsx                 # 首页，当前排片聚合
│   │   ├── date/page.tsx            # 按日期查排片
│   │   ├── map/page.tsx             # 地图查影院
│   │   ├── people/                  # 导演列表与详情
│   │   ├── market/                  # marketplace 页面
│   │   └── me/                      # 登录后的个人区域
│   ├── films/[id]/page.tsx          # 电影详情页
│   └── api/
│       ├── movies/search            # 公共电影搜索
│       ├── people/search            # 公共导演搜索
│       └── me/                      # 登录后的 want / resolve / marketplace API
├── components/
│   ├── search/                      # 通用搜索框骨架
│   ├── movie/                       # 电影卡片、海报、外链、列表动作
│   ├── marketplace/                 # 买卖信息 UI
│   ├── me/want-list/                # want list 页面组件
│   └── map/                         # 地图组件
├── lib/
│   ├── ingest/                      # 排片抓取、清洗、落库
│   ├── cache/                       # 首页 / 日期 / 地图的缓存读取
│   ├── movie/                       # 电影搜索、匹配、展示、TMDB resolve
│   ├── people/                      # 导演搜索、TMDB resolve
│   ├── user-movies/                 # 电影 want / watched / import
│   ├── user-directors/              # 导演 want
│   ├── watchlist-reminders/         # want reminder 邮件
│   ├── marketplace/                 # 票务信息共享
│   ├── api/                         # route helper / client helper
│   ├── auth/                        # 登录、注册、邮件验证
│   └── prisma.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── scripts/
│   ├── ingest_theater.ts
│   ├── cleanup_expired_showtimes.ts
│   └── send_watchlist_reminders.ts
└── tests/
```

## 技术栈

- Next.js 16.2 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Prisma
- PostgreSQL
- Luxon
- NextAuth v5 beta
- Cheerio + `fetch`/JSON 抓取
- Leaflet / React Leaflet
- Resend

## 登录方式

当前登录支持：

- 邮箱 + 密码
- Magic link 邮件登录
- Google 登录

认证入口和 provider 配置在 `auth.ts`。

## 本地开发

### 1. 环境要求

- Node.js 20+
- PostgreSQL

### 2. 环境变量

新建 `.env`：

```env
DATABASE_URL="postgresql://..."
TMDB_API_KEY="..."
AUTH_SECRET="..."
APP_BASE_URL="http://localhost:3000"
CRON_SECRET="..."
REMINDER_BASE_URL="https://www.screeningnyc.com"
EMAIL_FROM="auth@example.com"
RESEND_API_KEY="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

说明：

- `DATABASE_URL`：必需
- `TMDB_API_KEY`：可选，但强烈建议配；不配时 TMDB enrich / resolve 能力会受限
- `AUTH_SECRET`：生产环境必需；开发环境代码里有 fallback
- `EMAIL_FROM` + `RESEND_API_KEY`：magic link 和提醒邮件需要
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`：Google 登录需要
- `CRON_SECRET`：定时 revalidate 需要
- `APP_BASE_URL`：本地登录回调和站内链接使用
- `REMINDER_BASE_URL`：提醒邮件跳回正式站点时使用

### 3. 初始化并启动

```bash
npm install
npx prisma migrate dev
npm run dev
```

默认打开：<http://localhost:3000>

## 常用命令

开发：

```bash
npm run dev
```

类型检查：

```bash
npm run typecheck
```

测试：

```bash
npm test
```

Lint：

```bash
npm run lint
```

生产构建：

```bash
npm run build
```

## 数据抓取与运维命令

手动抓取全部影院排片：

```bash
npm run ingest:theater
```

只抓部分影院：

```bash
npm run ingest:theater -- metrograph filmforum flc
```

清理过期 showtimes：

```bash
npm run cleanup:showtimes
```

补全缺失的 `endTime`：

```bash
npm run backfill:showtime-end-times
```

手动触发 want reminder：

```bash
npm run reminders:watchlist -- --force
```

强制跑周五 summary 分支：

```bash
npm run reminders:watchlist -- --force --mode=summary
```

## 自动化

仓库当前有这些 GitHub Actions：

- `.github/workflows/ci.yml`
- `.github/workflows/daily_ingest.yml`
- `.github/workflows/cleanup_showtimes.yml`
- `.github/workflows/watchlist_reminders.yml`

它们分别负责：

- CI 构建与检查
- 定时抓取排片并 revalidate
- 定时清理过期排片
- 中午发送 watchlist reminder

## 补充说明

- `app/(browse)` 是 Next App Router 的 route group，只影响目录结构，不影响 URL
- 地图页显式调用了 `connection()`，避免影院数据被锁进构建期快照
- marketplace 当前是“信息共享 + 联系方式交换”，不是票务担保平台
