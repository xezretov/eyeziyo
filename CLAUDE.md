# tatuziyo — tuit.eyeziyo.uz (admin.eyeziyo.uz bilan bir xil admin panel, audiotap konveyeri bilan)

Eyeziyo'ning TUIT uchun nusxasi. **Admin panel menyulari va jarayonlari admin.eyeziyo.uz bilan
BIR XIL** (institution, fakultet/yo'nalish/kurs, guruhlar, fanlar, xonalar, baholash savollari,
o'qituvchilar, o'quvchilar, sozlamalar, dashboard, o'qituvchi/o'quvchi profili, dars detali).
Farqlar: **HEMIS yo'q**, Android jonli sessiya yo'q, Mentor (o'quvchi) app API yo'q;
darslar **audiotap** (AES67 audio capture server) yozuvlaridan keladi.

## Struktura

| Papka | Nima |
|-------|------|
| `worker/` | Backend — Cloudflare Workers, D1, R2, Queues. eyeziyo-worker'ning admin qismi + audiotap konveyeri |
| `web/` | Admin panel — eyeziyo/admin-web nusxasi (`styles.css` bir xil, `app.js` patch bilan), Worker assets orqali |

Bu papka o'z git repo'si (lokal, remote yo'q). Eski loyiha `E:\system\eyeziyo` — manba, unga tegilmaydi.

## Prod — https://tuit.eyeziyo.uz

Bitta Worker `tatuziyo-api`: frontend (`[assets]`, `../web`) + API (`/api/*`). Cloudflare hisobi
eyeziyo@gmail.com, **Workers Paid** (2026-09-04 dan). Deploy: `worker/` da `npm run deploy`.

Birinchi kirish: admin `/api/auth/bootstrap` (login sahifasidagi «Birinchi sozlash») → login →
admin-web onboarding'da muassasa yaratiladi (TUIT, universitet) → fakultet/yo'nalish/kurs → guruhlar →
fanlar → o'qituvchilar (email+parol bilan, `/api/auth/register`).

## Web (`web/`) — qanday yangilanadi

`web/app.js` = `eyeziyo/admin-web/app.js` + patch. Patch skripti (sessiya scratchpad'ida edi) quyidagini qiladi:
- `const API = ""` (bitta domen), eski audiotap bo'limi (`RecordingsState … retryRecording`) o'rniga
  tatuziyo yozuvlar moduli (ro'yxat, detal, biriktirish, tinglash, bootstrap modal, xona tahriri,
  sozlamalar kartalari `injectAudiotapSettings`).
- Marshrut `recording` (yozuv detali), login'da `bootstrap-btn`, `renderSettings` oxirida
  `injectAudiotapSettings()`, Xonalar sahifasida HEMIS matni → audiotap + tahrir tugmasi.
- `index.html`: `config.js` olib tashlangan, «Birinchi sozlash» havolasi, `app.js?v=`.
Admin-web yangilansa: yangi app.js ni olib, shu patch'larni qayta qo'llang (yoki qo'lda diff).

## Backend (`worker/src`)

- `index.ts` — router. **`return await handler()`** shart (aks holda xato catch'ga tushmaydi →
  Cloudflare 1101). Auth/admin handler'lar (login/register/refresh, teachers, stats, dashboard,
  teacher detail, lesson detail, reevaluate, update/delete teacher) eyeziyo index.ts dan o'zgarishsiz.
- `admin-core.ts`, `admin-eval.ts`, `mentor-admin.ts` — eyeziyo'dan o'zgarishsiz. `mentor.ts` faqat `parseGroups`.
- `auth.ts`, `rateLimit.ts` — eyeziyo'dan. `gemini.ts` — eyeziyo'dan, farqlar: STT `GEMINI_MODEL`
  birinchi keyin zanjir; baholash 120k belgigacha to'liq transkript; polish 32k token + 60% himoya;
  `evaluateLesson` modelni qaytaradi.
- Audiotap: `webhook.ts` (HMAC — utf8/hex/base64 kalit, base64/hex imzo, s/ms timestamp; 401 sababi
  aniq; D1 ishlamasa payload R2 `pending-webhooks/` ga, cron/`POST /api/system/replay-webhooks` replay),
  `pipeline.ts` (ingest: R2 bo'lsa qayta yuklamaydi; analyze: **lessons + evaluations** yaratadi,
  `recordings.lesson_id`), `recordings.ts` (ro'yxat filtr/pagination, assign: users(teacher) + subjects +
  groups_v2, reprocess `download|transcribe|analyze`, delete darsni ham o'chiradi), `directory.ts`
  (sources = xonalar; `/api/admin/auditoriums` shu ma'lumot admin-web formatida), `dashboard.ts` (live).

### Oqim
```
audiotap ──POST /api/webhooks/audiotap (HMAC)──▶ recordings (TARGET_PROFILE=speech, qolgani skipped) + Queue
ingest  : download (yoki R2) → Gemini STT → polish → transcripts → awaiting_assignment
admin   : Yozuvlar → Biriktirish (o'qituvchi, fan, guruh, mavzu) → analyze
analyze : lessons INSERT/UPDATE → Gemini 5 mezon → evaluations → done
Cron */10: R2 zaxira replay + 30 daq osilganlarni qayta navbat, 5+ urinish = failed
```
Real audiotap (2026-09-04): `download_url` host `https://soft-mixer.taila38ca0.ts.net/api` (Tailscale
Funnel, ochiq) — pipeline public host'ni o'zgartirmaydi. Hozircha audiotap faqat `original` (flac,
~460 MB) yuboradi — `speech` (opus) profili yoqilishi kerak, aks holda skipped (limit `MAX_INGEST_MB`).

### Sxema
`schema.sql` — eyeziyo jadvallari (users, institutions, hierarchy_nodes, groups_v2, subjects,
teacher_*/student_groups, lessons, evaluations(+model), lesson_segments, lesson_tests, test_attempts,
mentor_chats, evaluation_questions(+subjects), student_lesson_evaluations, rate_limits, refresh_tokens)
+ audiotap (sources, recordings, transcripts, processing_events). v1 → v2 o'tish: `migrations/0002_v2_pre.sql`
→ `schema.sql` → `migrations/0002_v2_post.sql` (prodda 2026-09-05 da bajarilgan).

### Buyruqlar (worker/)
```
npm run typecheck
npm run dev            # port 8788; secretlar: --var JWT_SECRET:x --var AUDIOTAP_WEBHOOK_SECRET:x --var GEMINI_API_KEY:x
npm run deploy
npm run db:init        # schema.sql → remote (idempotent)
npm run db:init:local
```
Lokal dev'ni to'xtatish: TaskStop yetarli emas — workerd/node (wrangler dev) jarayonlarini PowerShell bilan
o'ldiring, aks holda ikkita dev bitta portda turib eski kod javob beradi.

## Qoidalar
- Secretlarni kodga/toml'ga yozma, logga chiqarma.
- O'zbek tilida javob ber.
- Backend o'zgarishidan keyin `npm run typecheck`, keyin lokal `wrangler dev` bilan sinab ko'r.
- Frontend'ni admin-web'dan ajratmaslik: o'zgarish avval admin-web'da, keyin patch orqali bu yerda.
