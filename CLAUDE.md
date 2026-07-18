# Eyeziyo — AI Lesson Quality Analytics Platform

AI asosidagi dars sifati analitikasi platformasi (ta'lim markazlari uchun). Ikki asosiy rol: **O'qituvchi** va **Administrator**. Darslarni yozib olish → STT (nutqni matnga) → Gemini bilan tahlil → engagement/pedagogika ballari.

## Monorepo strukturasi

Bu papka bitta git repo emas, bir nechta mustaqil komponent:

| Papka | Nima | Stack |
|-------|------|-------|
| `Eyeziyo/` | Asosiy Android app (o'qituvchi/admin) | Kotlin, Gradle (`build.gradle.kts`) |
| `Mentor/` | Ikkinchi Android app | Kotlin, Gradle |
| `admin-web/` | Admin veb-panel | Vanilla JS + HTML/CSS (build yo'q, statik) |
| `eyeziyo-worker/` | Backend API | Cloudflare Workers, TypeScript, D1, Durable Objects |

## Backend (`eyeziyo-worker/`)

- **Runtime:** Cloudflare Workers. Kirish nuqtasi: `src/index.ts`. Prod nomi: `eyeziyo-api` (api.eyeziyo.uz).
- **DB:** Cloudflare D1 (`eyeziyo-db`), binding `DB`. Schema: `schema.sql`, migratsiyalar: `migrations/`.
- **Sessiya:** Durable Object `RecordingSession` (`src/session.ts`) — jonli yozib olish sessiyalari.
- **AI:** Gemini (`src/gemini.ts`), model `gemini-flash-lite-latest`. Sozlash: `wrangler.toml` `[vars]`.
- **Modullar:** `auth.ts` (JWT), `admin-core.ts`, `admin-eval.ts`, `mentor.ts`, `mentor-admin.ts`, `rateLimit.ts`.

### Buyruqlar (`eyeziyo-worker/` ichida)
```
npm run dev        # wrangler dev — lokal
npm run deploy     # wrangler deploy — prodga
npm run db:migrate # D1 ga schema.sql qo'llash
```

### Secretlar — HECH QACHON kodga yozma
`wrangler secret put GEMINI_API_KEY`, `wrangler secret put JWT_SECRET`. `wrangler.toml` git ga tushadi, unga secret yozilmaydi.

## STT (nutqni matnga) — muhim kontekst

Worker ildizidagi ko'p fayllar (`*-pipeline.py`, `transcript-*.txt`, `wer.js`, `ground-truth*.txt`) — STT modellarini o'zbek tili uchun sinash ishlari.
- Sinalgan modellar: Gemini (~30-40% WER), Aisha (yaroqsiz chiqdi), Whisper large-v3.
- **Asosiy muammo:** audio 8 kHz bo'lgani sifatni buzgan. Batafsil: memory `stt_models_tested.md`.
- `wer.js` — WER (word error rate) hisoblovchi. `ground-truth*.txt` — etalon transkriptlar.

## Android apps (`Eyeziyo/`, `Mentor/`)

- Kotlin + Gradle Kotlin DSL. `local.properties` git ga tushmaydi (SDK yo'li, secretlar).
- Build: papka ichida `./gradlew assembleDebug` (Windows: `gradlew.bat`).

## admin-web/

- Build qadami yo'q — `index.html` + `app.js` + `styles.css`. To'g'ridan-to'g'ri ochiladi/deploy qilinadi.
- API bazasi: `config.js` da `window.EYEZIYO_API_BASE` (prod: `https://api.eyeziyo.uz`).

## Ishlash qoidalari

- Windows muhiti, PowerShell asosiy shell. Yo'llar backslash yoki forward slash.
- O'zbek tilida javob ber (foydalanuvchi shu tilda yozadi).
- Backend o'zgarishlaridan keyin: `eyeziyo-worker/` da `npm run dev` bilan sinab ko'r.
- Secretlarni (`GEMINI_API_KEY`, `JWT_SECRET`, `local.properties`) hech qachon commit qilma yoki logga chiqarma.
