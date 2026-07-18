# eyeziyo-worker — Backend API

Cloudflare Worker. Kirish: `src/index.ts`. Prod: `eyeziyo-api` → api.eyeziyo.uz.

## Endpointlar (index.ts da router)
```
POST /api/auth/login | /register | /refresh
GET  /api/users/me
GET/POST /api/lessons ,  GET /api/lessons/:id ,  POST /api/lessons/:id/evaluation
GET  /api/admin/teachers | /stats | /teachers/:id/detail ,  PUT /api/admin/teachers/:id/groups
GET  /ws/transcribe        # WebSocket → RecordingSession Durable Object
GET  /health
```
Mentor va admin uchun qo'shimcha handlerlar: `mentor.ts`, `mentor-admin.ts`, `admin-core.ts`, `admin-eval.ts`.

## Modullar
| Fayl | Vazifa |
|------|--------|
| `index.ts` | Router, CORS (ALLOWED_ORIGINS whitelist), `Env` interfeysi |
| `auth.ts` | JWT (signJWT/verifyJWT), parol hash/verify, token muddatlari |
| `gemini.ts` | `transcribeAudioFile`, `evaluateLesson` — Gemini chaqiruvlari |
| `session.ts` | `RecordingSession` Durable Object — jonli transkripsiya WS |
| `rateLimit.ts` | `checkRateLimit`, `clientKey` |
| `admin-core.ts` | Muassasa/ierarxiya/fan/guruh CRUD, o'qituvchi tayinlash |
| `admin-eval.ts` | Baholash savollari CRUD + natijalar |
| `mentor.ts` / `mentor-admin.ts` | Mentor app: talaba, dars, test, chat, baholash |

## Env / bindings (`wrangler.toml`)
- `DB` → D1 `eyeziyo-db` (`database_id: f7a495fb-...`). Schema: `schema.sql`.
- `RECORDING_SESSION` → Durable Object namespace.
- Vars: `GEMINI_MODEL = gemini-flash-lite-latest`.
- Secrets: `GEMINI_API_KEY`, `JWT_SECRET` — faqat `wrangler secret put ...`. Kodga/toml'ga YOZMA.

## DB (schema.sql)
Asosiy jadvallar: `users` (role: teacher/admin, `groups` JSON matn), `lessons` (transcript, duration_seconds), baholash va mentor jadvallari. Python backend'dan ko'chirilgan SQLite bilan mos.

## Buyruqlar
```
npm run dev        # lokal (wrangler dev)
npm run typecheck  # tsc --noEmit  (Edit/Write hook buni avtomatik yugurtiradi)
npm run deploy     # prod
npm run db:migrate # schema.sql -> D1
```
Yoki slash: `/worker-dev`, `/deploy-worker`.

## Qoidalar
- Yangi endpoint qo'shsang: index.ts router + tegishli handler modulida.
- Browser'dan yangi origin kirsa `ALLOWED_ORIGINS` ga qo'sh (mobil clientlar Origin yubormaydi — CORS'dan o'tadi).
- Har o'zgarishdan keyin typecheck avtomatik ishlaydi; xato bo'lsa tuzatmasdan davom etma.
