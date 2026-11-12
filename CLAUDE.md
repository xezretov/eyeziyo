# tatuziyo — tuit.eyeziyo.uz (admin.eyeziyo.uz bilan bir xil admin panel, audiotap konveyeri bilan)

Eyeziyo'ning TUIT uchun nusxasi. **Admin panel menyulari va jarayonlari admin.eyeziyo.uz bilan
BIR XIL** (institution, fakultet/yo'nalish/kurs, guruhlar, fanlar, xonalar, baholash savollari,
o'qituvchilar, o'quvchilar, sozlamalar, dashboard, o'qituvchi/o'quvchi profili, dars detali).
Farqlar: Android jonli sessiya yo'q, Mentor (o'quvchi) app API yo'q, **HEMIS yo'q** (2026-09-15 da
qo'shilib, 2026-09-16 da foydalanuvchi talabi bilan to'liq olib tashlandi — kod, jadvallar, sinxron
qilingan ma'lumotlar, token); darslar **audiotap** (AES67 audio capture server) yozuvlaridan keladi.

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
  `injectAudiotapSettings()`, Xonalar sahifasida xonalar = audiotap manbalari + tahrir tugmasi.
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
  (sources = xonalar; `/api/admin/auditoriums` shu ma'lumot admin-web formatida), `dashboard.ts` (live), `ogg.ts` (Ogg Opus faylni ffmpeg'siz sahifa darajasida ~10 daq bo'laklarga bo'lish — CRC/granule/seq qayta yoziladi), `types.ts` `cleanEnv()` (secret'lardan BOM/whitespace tozalash — fetch/queue/scheduled kirishida).

### Oqim
```
audiotap ──POST /api/webhooks/audiotap (HMAC)──▶ recordings (TARGET_PROFILE=speech, qolgani skipped) + Queue
ingest  : download (yoki R2) → [STT_MODE=manual: biriktirilmagan bo'lsa awaiting_assignment, STT YO'Q]
          → Ogg bo'laklash (STT_CHUNK_SEC=600) → har bo'lak Gemini STT (STT_MODEL) + polish → stt_chunks (kesh) → transcripts
admin   : Yozuvlar → Biriktirish (o'qituvchi, fan, guruh, mavzu) → transkript bo'lmasa ingest (STT) → analyze
analyze : lessons INSERT/UPDATE → Gemini 5 mezon → evaluations → done
Cron */10: R2 zaxira replay + 30 daq osilganlarni qayta navbat, 5+ urinish = failed
```

### Gemini xarajati nazorati (2026-09-22 — 26 ta 80 daq yozuvga ~$24 ketgan)
Sabab: audiotap har 1.5 soatda 80 daq yozuv yuboradi (dars bo'lmasa ham, bo'sh xona ham), hammasi avtomatik
STT (gemini-2.5-flash audio $1/M token, 80 daq ≈ 154k token ≈ $0.15 kirish + chiqish) qilinardi; sikl bo'lganda
bo'lak 6 tagacha chaqiruv (t=0, t=0.3, 2 yarm × 2) + 8192 tokenli chiqindi chiqish; 09-17 da hamma yozuv 20 daq
ichida ikki marta STT qilingan (queue/cron qayta yuborgan yoki ikki marta "qayta ishlash"); 09-14/15 da 25 ta
"Transkript bo'sh" urinish (butun fayl bitta so'rovda). Chora (`pipeline.ts ingest`):
- **`STT_MODE=manual`** (default): audio R2 ga saqlanadi, STT faqat `assignRecording` (biriktirish) yoki
  `reprocess from=transcribe|download` (`force:true`) bilan. `auto` — eski xatti-harakat.
- Transkript bor bo'lsa ingest STT'ni takrorlamaydi (force bo'lmasa) → to'g'ridan analyze/awaiting.
- **`stt_chunks`** keshi (migratsiya 0005, prodda 2026-09-22): bo'lak matni saqlanadi, qayta yuborilganda
  keshdan; force keshni tozalaydi.
- Yarmlar faqat t=0.3 (`transcribeAudioFile(..., temps)`), bo'lakka maksimal 4 chaqiruv.
- **`STT_DAILY_LIMIT_MIN=600`**: bugun STT boshlangan yozuvlar davomiyligi limitdan oshsa awaiting_assignment + xabar.
- **`STT_BATCH=on`** (2026-09-22 deploy, 09-22..23 da 11 yozuvda ishladi — fileData inline requests qabul qilinadi): bo'laklar
  Files API ga yuklanadi (`uploadAudioToGeminiFiles`), bitta `models/{model}:batchGenerateContent` job
  (inline requests, audio `fileData` URI orqali, `metadata.key` = bo'lak indeksi), status **`stt_batch`**,
  `recordings.batch_name/batch_submitted_at` (migratsiya 0006). Cron `pollSttBatches`: SUCCEEDED/FAILED/… →
  `stt_collect` job (`collectBatch`: yaxshi bo'laklar polish + kesh, bo'sh/sikl bo'laklar sinxron qayta, keyin
  `finalizeTranscript`); `STT_BATCH_MAX_HOURS=36` dan uzoq kutsa cancel + `ingest sync:true`. Batch yaratish
  400/404 bilan yiqilsa (format) o'sha zahoti sinxron yo'l, 402/429 bo'lsa istisno (Queue retry). Javob shakli
  `response.inlinedResponses[]` (yoki `.inlinedResponses.inlinedResponses`), bo'sh kelsa console'da xom JSON —
  `wrangler tail` bilan tekshiring. Narx: STT kirish/chiqish 50% (~0.11$/80 daq).
- **Batch sikl qoidasi (2026-09-23):** batch t=0.3, maxOutputTokens 4096. 09-22 da 11 yozuv biriktirildi (880 daq),
  batch bo'laklarining ~45% t=0 da siklga tushib sinxron (to'liq narx, yarmlar bilan) qayta ishlandi — qaytalar
  batch'dan qimmat tushdi (~$2+/kun). Endi `collectBatch`: sikl/bo'sh + <40 haqiqiy so'z → bo'sh xona, qayta
  URILMAYDI; RECITATION yoki sikl + ≥40 so'z → bitta yengil qayta (`mode="light"`: t=0.3, yarmsiz); yozuvga
  ko'pi bilan 4 bo'lak qayta, qolgani tozalangan matn bilan qoladi. Sinxron default temps ham [0.3, 0.0].
- **2026-09-24 natija:** tuzatishdan keyingi 4 yozuv (61–64) `gemini_usage` bo'yicha $0.13–0.29, o'rtacha $0.23
  (avval ~$0.48). Qolgan xarajat: 10 daqiqalik bo'lak o'zbek nutqida 4096 tokenga sig'maydi (~3 token/so'z,
  1300+ so'z) → MAX_TOKENS "sikl" deb 500–1300 so'zli TO'LIQ bo'laklar qayta ishlanardi ($0.04/bo'lak, yana
  MAX_TOKENS). Chora: **`STT_CHUNK_SEC=300`** (16 bo'lak, ≤ ~2500 token) + `collectBatch` qabul qoidasi: sikl
  bo'lsa ham tozalangan matn kutilgan hajmning ≥60% (~110 so'z/daq) bo'lsa qabul (`[sikl, qabul]`), qayta
  urinish faqat 40 so'z ≤ natija < 60%. Kutilma: ~$0.12–0.15/80 daq.
- **Dars jarayoni / ovoz manbalari (2026-09-28, migratsiya 0008):** mijoz shikoyati — #73 da o'qituvchi ~35 daq
  video qo'ygan, yorliqsiz transkriptda diktor "o'qituvchi nutqi" deb baholangan. Endi STT prompti har parchani
  `[MM:SS O'QITUVCHI|TALABA|VIDEO] matn` qilib qaytaradi (vaqt bo'lak boshidan). `timeline.ts`: `parseLabeled`,
  `normalizeChunk` (bo'lak/yarm vaqti → mutlaq), `computeStats` (ulushlar, vaqt chizig'i, video bloklari →
  `transcripts.stats` JSON), `condenseForEval` (VIDEO matni baholashga qisqa izoh bo'lib boradi). `cleanTranscriptChunk`
  yorliqli matnni parcha-parcha tozalaydi (stripTimestamps yorliq vaqtini o'chirmasin). Polish yorliqlarni saqlaydi
  (soni o'zgarsa asl matn), "KURS:/MAVZU:" satrlari olib tashlanadi (avval har bo'lakka sizib kirardi).
  `evaluateLesson`: statistikani promptga beradi, VIDEO qoidalari, `phases` + `media_note` qaytaradi →
  `evaluations.timeline` JSON; video ≥30% → speech ≤12, ≥50% → speech ≤8 va method ≤14 (kodda). Web: yozuv
  sahifasida "Dars jarayoni" kartasi (rangli vaqt chizig'i, ulushlar, bosqichlar jadvali), transkript rangli
  qatorlar, ro'yxatda "Video N%". Eski yorliqsiz transkriptlarda hammasi avvalgidek ishlaydi.
- **Token/xarajat hisobi (2026-09-23, migratsiya 0007 `gemini_usage`):** har pullik chaqiruvning `usageMetadata`
  (audio/matn kirish, chiqish, model, batch) yoziladi, `usd` tarif jadvalidan (`gemini.ts PRICE_PER_M`,
  batch 50%). Bo'lak/yozuv/baholash loglarida `$…` ko'rinadi; Sozlamalar → "Gemini sarfi" (bugun / 7 kun / jami,
  `handleSystemInfo.gemini_usage`). Google balansi bilan solishtirish uchun shu raqam — taxmin emas.
  Kecha (09-22 11:13 → 09-23 07:00) 11 yozuv ≈ $4.3 hisoblandi, balans $9.97 → $4.71 ($5.26) — farq chiqish
  tokenlari taxminidan; endi aniq.
Bo'sh xona yozuvlarini admin "Biriktirish kutilmoqda" ro'yxatidan o'chirib yuboradi (R2 ham tozalanadi).
Real audiotap (2026-09-04): `download_url` host `https://soft-mixer.taila38ca0.ts.net/api` (Tailscale
Funnel, ochiq) — pipeline public host'ni o'zgartirmaydi. Hozircha audiotap faqat `original` (flac,
~460 MB) yuboradi — `speech` (opus) profili yoqilishi kerak, aks holda skipped (limit `MAX_INGEST_MB`).

### STT tajribasi (2026-09-15, 80 daq speech.ogg, 19 MB)
- To'liq fayl bitta so'rovda: flash-lite MAX_TOKENS + takrorlash sikli (prod'da 231 so'z qoldi), flash 500 INTERNAL. **Bo'laklash shart.**
- 10 daq bo'lak: flash 711 so'z/13 s STOP; flash-lite 546 so'z yoki RECITATION (keshlangan, qayta ham) yoki MAX_TOKENS sikl → **STT_MODEL = gemini-2.5-flash**, zanjir flash-lite'ga tushadi. **t=0 da savol-javob qismlarida sikl** (MAX_TOKENS, "Odam. Odam.", 5 daq yarmlarda ham; prod #14: 30–70 daq bo'laklar 69–217 so'z) — `runTranscription`: t=0 → sikl (MAX_TOKENS yoki dedup <50%) yoki bo'sh bo'lsa t=0.3 bilan qayta, so'z ko'prog'i olinadi (t=0.3: 323 so'z STOP; Whisper large-v3 shu bo'lakda 231 so'z — hajm mos). frequencyPenalty 2.5-flash'da 400, gemini-2.5-pro bu kalitda 404.
- `pipeline.ts` `sttChunk`: HTTP xato (429/5xx, `httpError`) → 20 s × 3 qayta, keyin istisno (Queue retry); ikkala urinishda sikl (`looped`) → bo'lak 2 yarmga bo'linib alohida STT (bir daraja). Nutq yo'q: `stripNoSpeechNoise` ("nutq yo'q" satrlari, "...." qatorlari) + bo'lakda <5 haqiqiy so'z = bo'sh; jami <30 so'z → `failed` "Nutq topilmadi" (yozuv #12: -15 dB doimiy shovqin, Whisper 0 so'z).
- `GEMINI_API_KEY` secret boshida BOM bo'lgan (PowerShell pipe) → `API key not valid`; `cleanEnv()` himoya. Secret qo'yishda `printf '%s' | wrangler secret put` ishlat.

### HEMIS — yo'q
2026-09-15 da HEMIS (sync + dars jadvali bo'yicha avto-biriktirish) qo'shilgan edi; 2026-09-16 da
foydalanuvchi talabi bilan to'liq olib tashlandi: `hemis-*.ts`, `web/hemis.html`, `HEMIS_BASE_URL` var,
`HEMIS_API_TOKEN` secret, HEMIS jadvallari va `hemis_*` ustunlari. `migrations/0004_drop_hemis.sql`
prodda bajarildi — sinxron qilingan ~23k user (o'qituvchi+talaba), 5.7k fan, 1.4k guruh, 193
fakultet/yo'nalish, 359 auditoriya o'chirildi; admin va institutions qatori saqlandi. Xonalar sahifasi =
audiotap manbalari (`directory.ts listAuditoriums`). Yozuvlar faqat qo'lda biriktiriladi
(o'qituvchi/fan/guruh/mavzu). Qayta kerak bo'lsa — eyeziyo'dagi `hemis-*.ts` manba.

### Sxema
`schema.sql` — eyeziyo jadvallari (users, institutions, hierarchy_nodes, groups_v2, subjects,
teacher_*/student_groups, lessons, evaluations(+model), lesson_segments, lesson_tests, test_attempts,
mentor_chats, evaluation_questions(+subjects), student_lesson_evaluations, rate_limits, refresh_tokens)
+ audiotap (sources, recordings, transcripts, processing_events). v1 → v2 o'tish: `migrations/0002_v2_pre.sql`
→ `schema.sql` → `migrations/0002_v2_post.sql` (prodda 2026-09-05 da bajarilgan). `0004_drop_hemis.sql` —
HEMIS'ni olib tashlash (prodda 2026-09-16).

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
