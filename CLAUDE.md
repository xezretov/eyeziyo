# tatuziyo — Audiotap → STT → AI baholash platformasi (tuit.eyeziyo.uz)

Eyeziyo'ning yangi, yengil avlodi. **HEMIS yo'q, Android app yo'q, jonli WS yo'q** —
audio tayyor fayl bo'lib audiotap webhook'idan keladi, Gemini transkript + 5 mezonli
baho beradi, admin panel ko'rsatadi. O'qituvchi/fan/mavzu **qo'lda** biriktiriladi.

## Struktura

| Papka | Nima | Holat |
|-------|------|-------|
| `worker/` | Backend API — Cloudflare Workers, D1, R2, Queues | Deploy qilingan |
| `web/` | Admin panel — vanilla JS SPA (hash router), Worker assets orqali beriladi | Deploy qilingan |

Bu papka **o'z git repo'si** (2026-09-04 dan). Eski loyiha (`E:\system\eyeziyo`) faqat o'qish uchun manba.

## Prod — https://tuit.eyeziyo.uz

Bitta Worker (`tatuziyo-api`) ham frontend (`web/` — `[assets]`), ham API (`/api/*`,
`run_worker_first`) ni beradi. workers.dev o'chiq — yagona manzil custom domain.
Frontend deploy = `worker/` ichida `npm run deploy` (assets birga chiqadi).

DIQQAT: Cloudflare hisobi eski `eyeziyo-api` bilan bir xil. D1 bepul tarif limiti
(5 mln qator o'qish/kun) hisob bo'yicha umumiy — eski baza limitni yesa bu sayt ham 500 beradi.

## Frontend (`web/`)

Dizayn tizimi **admin.eyeziyo.uz (eyeziyo/admin-web) bilan bir xil**: `styles.css` o'zgarishsiz
ko'chirilgan, `index.html` shabloni ham. `app.js` sahifalari o'sha komponentlar bilan qurilgan:
- Dashboard: sparkline'li KPI (kpi-spark), gauge + 5 mezon, AI yordamchi (ai-card), haftalik
  dinamika, o'qituvchilar qamrovi, sifat taqsimoti, ogohlantirishlar, jonli jarayon, top
  o'qituvchilar, xonalar reytingi, so'nggi darslar, AI tavsiyalar.
- Yozuvlar: server pagination + status/qidiruv filtrlari; detal sahifa (detail-header, baho,
  transkript, jurnal, tinglash/yuklab olish, biriktirish, qayta ishlash).
- O'qituvchilar: filtr/saralash, jadval/karta, pagination, tahrir/o'chirish, detal sahifa.
- Fanlar, Xonalar (audio manbalar): qidiruv + tahrir; Sozlamalar: webhook URL, secret holati,
  konveyer holati, profil + parol o'zgartirish, foydalanuvchilar.
Marshrutlar: `#/dashboard`, `#/recordings[/:id]`, `#/teachers[/:id]`, `#/subjects`, `#/sources`, `#/settings`.
Yangi funksiya qo'shganda admin-web'dagi CSS klasslarini ishlating — yangi CSS yozish shart emas.

## Backend (`worker/`)

### Oqim
```
audiotap ──POST /api/webhooks/audiotap (HMAC)──▶ D1 insert + Queue
Queue consumer: ingest  = (R2 da bo'lsa o'sha, bo'lmasa download → checksum → R2)
                          → Gemini STT → polish → transcripts
                          → awaiting_assignment (yoki kontekst bo'lsa analyze)
                analyze = transcript + fan/mavzu → Gemini 5 mezon → analyses → done
Cron (*/10): 30 daq osilib qolganlarni qayta navbatga qo'yadi, 5+ urinish = failed
```
Status mashinasi: `queued → downloading → stored → transcribing →
awaiting_assignment → analyzing → done | failed | skipped`.

Qayta ishlash rejimlari (`POST /api/recordings/:id/reprocess?from=`):
`download` (audiotap'dan qayta yuklab olish, r2_key tozalanadi), `transcribe` (R2 dagi
audio bilan STT + baholash), `analyze` (faqat baholash).

### Modullar (src/)
- `index.ts` — router + queue consumer + cron + `/api/system` + parol o'zgartirish.
- `types.ts` — Env, json/err, mimeFor, logEvent, setStatus.
- `webhook.ts` — HMAC tekshiruv (standard-webhooks), dedup `(event_id, profile)`,
  faqat `TARGET_PROFILE` (speech) navbatga tushadi, qolgani `skipped`.
- `pipeline.ts` — ingest/analyze. Gemini bo'sh javob = xato (0-ball yozilmaydi).
- `recordings.ts` (ro'yxat: `status=`, `in_progress`, `q=`, `teacher_id=`, `subject_id=`,
  `page/limit`, javobda `counts`), `dashboard.ts` (stats: week, distribution, alerts,
  recent_lessons, coverage, idle_teachers), `directory.ts` (teachers CRUD + detal, subjects
  CRUD, sources).
- `auth.ts`, `rateLimit.ts` — eyeziyo-worker'dan o'zgarishsiz.
- `gemini.ts` — eyeziyo'dan ko'chirilgan, farqlar: STT `GEMINI_MODEL` birinchi, keyin zanjir
  (fallback); baholash 120k belgigacha to'liq transkript; polish 32k token, 60% pastki himoya;
  `evaluateLesson` javob bergan modelni qaytaradi. Fayl CRLF edi — endi LF.

### Bindings (`wrangler.toml`)
`DB` → D1 `tatuziyo-db` (dff04efd-...), `AUDIO` → R2 `tatuziyo-audio`,
`JOBS` → Queue `tatuziyo-jobs` (DLQ: `tatuziyo-jobs-dlq`). `[observability] enabled`.
Vars: `GEMINI_MODEL`, `AUDIOTAP_BASE_URL` (TODO: public manzil), `TARGET_PROFILE`, `MAX_INGEST_MB`.
Secrets (faqat `wrangler secret put`): `GEMINI_API_KEY`, `JWT_SECRET`, `AUDIOTAP_WEBHOOK_SECRET`.

### Buyruqlar (worker/ ichida)
```
npm run dev / dev:lan   # lokal (port 8788 — eyeziyo 8787 bilan to'qnashmasin)
npm run typecheck
npm run deploy
npm run db:init         # schema.sql -> remote D1 (idempotent, IF NOT EXISTS)
npm run db:init:local   # lokal D1
```
Lokal dev'da secretlar `.dev.vars` (gitignored) yoki
`wrangler dev --port 8788 --var JWT_SECRET:x --var AUDIOTAP_WEBHOOK_SECRET:x --var GEMINI_API_KEY:x`.
Lokal navbat ham ishlaydi (dummy Gemini kaliti bilan analyze "failed" bo'ladi — normal).

### Birinchi admin
`POST /api/auth/bootstrap {email, password, name}` — faqat `users` jadvali bo'sh
bo'lganda ishlaydi (login sahifasidagi «Birinchi sozlash» havolasi). Keyin `/api/auth/login`.

## Qoidalar
- Secretlarni kodga/toml'ga yozma, logga chiqarma.
- O'zbek tilida javob ber.
- Backend o'zgarishidan keyin `npm run typecheck`, keyin lokal `wrangler dev` bilan sinab ko'r.
- Eski loyiha (`E:\system\eyeziyo`) o'qish uchun manba — unga tegilmaydi.
