/**
 * Dars jarayoni: STT transkriptidagi ovoz manbasi yorliqlari (O'QITUVCHI / TALABA / VIDEO)
 * va vaqt belgilaridan dars vaqt chizig'i va statistikasini hisoblash.
 *
 * STT har ~5 daqiqalik bo'lakni shunday qaytaradi (vaqt — bo'lak boshidan):
 *   [00:12 O'QITUVCHI] Bugungi mavzuyimiz ...
 *   [01:40 TALABA] Ustunli grafik.
 *   [02:05 VIDEO] The economy is simply ...
 * `normalizeChunk` bu vaqtlarni yozuv boshidan hisoblangan mutlaq vaqtga o'giradi va bir xil
 * formatda qayta yozadi. Transkriptlar va darslar shu formatda saqlanadi.
 *
 * 2026-09-28: mijoz shikoyati — o'qituvchi darsda ~35 daqiqalik video qo'ygan (#73), transkript
 * yorliqsiz bo'lgani uchun video diktori ham "o'qituvchi nutqi" deb baholangan.
 */

export type Who = "teacher" | "student" | "media";

export interface Segment { t: number | null; who: Who; text: string }

export const WHO_LABEL: Record<Who, string> = {
  teacher: "O'QITUVCHI",
  student: "TALABA",
  media: "VIDEO",
};

// [03:10 O'QITUVCHI] / [O'qituvchi] / [1:02:03 VIDEO] / [TALABALAR] / [MEDIA] / [AUDIO]
const MARKER_RE = /\[\s*(?:(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-–·,]?\s*)?(o['’`ʻʼ]?qituvchi|talaba(?:lar)?|video|media|audio|diktor)\s*\]/gi;

function whoFrom(label: string): Who {
  const l = label.toLowerCase();
  if (l.startsWith("talaba")) return "student";
  if (l === "video" || l === "media" || l === "audio" || l === "diktor") return "media";
  return "teacher";
}

export function hasMarkers(text: string): boolean {
  MARKER_RE.lastIndex = 0;
  return MARKER_RE.test(text || "");
}

export function countMarkers(text: string): number {
  return ((text || "").match(MARKER_RE) || []).length;
}

/** Yorliqli matnni parchalarga ajratadi. Birinchi yorliqdan oldingi matn — o'qituvchi (vaqtsiz). */
export function parseLabeled(text: string): Segment[] {
  const src = text || "";
  const out: Segment[] = [];
  const re = new RegExp(MARKER_RE.source, "gi");
  let last = 0;
  let cur: Segment | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const before = src.slice(last, m.index).trim();
    if (cur) cur.text = (cur.text + " " + before).trim();
    else if (before) out.push({ t: null, who: "teacher", text: before });
    let t: number | null = null;
    if (m[1] !== undefined && m[2] !== undefined) {
      t = m[3] !== undefined
        ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
        : Number(m[1]) * 60 + Number(m[2]);
    }
    cur = { t, who: whoFrom(m[4]), text: "" };
    out.push(cur);
    last = re.lastIndex;
  }
  const tail = src.slice(last).trim();
  if (cur) cur.text = (cur.text + " " + tail).trim();
  else if (tail) out.push({ t: null, who: "teacher", text: tail });
  // Bo'sh parchalarni olib tashlaymiz, ketma-ket bir xil manbani birlashtiramiz.
  const merged: Segment[] = [];
  for (const s of out) {
    s.text = s.text.replace(/\s+/g, " ").trim();
    if (!s.text) continue;
    const prev = merged[merged.length - 1];
    // Faqat vaqtsiz (yoki bir xil vaqtli) parcha oldingisiga qo'shiladi — vaqtli qatorlar alohida qoladi
    // (qayta yorliqlashda o'qituvchi savoli va diktor gapi bitta qatorga tushmasin).
    if (prev && prev.who === s.who && (s.t == null || s.t === prev.t)) { prev.text += " " + s.text; continue; }
    merged.push(s);
  }
  return merged;
}

/** Har doim MM:SS (daqiqa 59 dan oshishi mumkin: 65:10) — model "1:05:10" ni noto'g'ri o'qiydi. */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 60))}:${p(s % 60)}`;
}

export function formatLabeled(segs: Segment[]): string {
  return segs.map((s) => `[${s.t != null ? fmtClock(s.t) + " " : ""}${WHO_LABEL[s.who]}] ${s.text}`).join("\n");
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * Bo'lak matnidagi vaqtlarni mutlaq vaqtga o'giradi (startSec qo'shiladi), bo'lak chegarasiga
 * qisadi va o'smaydigan qilib tuzatadi. Model vaqt bermagan parchalarga vaqt so'z soniga
 * mutanosib taqsimlanadi. Yorliq umuman bo'lmasa — matn o'zgarmaydi (eski format).
 */
export function normalizeChunk(text: string, startSec: number, endSec: number): string {
  if (!hasMarkers(text)) return text;
  const segs = parseLabeled(text);
  if (!segs.length) return text;
  const dur = Math.max(1, endSec - startSec);
  const totalW = segs.reduce((a, s) => a + words(s.text), 0) || 1;
  let accW = 0;
  let prevT = -1;
  for (const s of segs) {
    const est = (accW / totalW) * dur;
    let rel = s.t;
    // Model ba'zan mutlaq vaqt beradi (bo'lak uzunligidan katta) — shunda startSec ni ayiramiz.
    if (rel != null && rel > dur + 5 && rel - startSec >= 0 && rel - startSec <= dur + 5) rel = rel - startSec;
    if (rel == null || rel > dur + 5) rel = est;
    rel = Math.min(dur, Math.max(0, rel));
    if (rel < prevT) rel = prevT;
    prevT = rel;
    s.t = startSec + rel;
    accW += words(s.text);
  }
  return formatLabeled(segs);
}

export interface LessonStats {
  total_sec: number;
  teacher_sec: number;
  student_sec: number;
  media_sec: number;
  silence_sec: number;
  teacher_pct: number;
  student_pct: number;
  media_pct: number;
  silence_pct: number;
  student_turns: number;
  media_blocks: { from: number; to: number; words: number }[];
  timeline: { from: number; to: number; who: Who }[];
}

/**
 * Mutlaq vaqtli yorliqli transkriptdan statistika. Parcha davomiyligi = keyingi parchagacha
 * bo'lgan vaqt, lekin so'z soniga ko'ra kutilgandan (≈1.6 so'z/s + 20 s) uzun bo'lsa qolgani
 * jimlik/pauza deb hisoblanadi. Nutq bo'lmagan bo'laklar ham jimlik bo'lib qoladi.
 */
export function computeStats(text: string, totalSec: number): LessonStats | null {
  if (!hasMarkers(text)) return null;
  const segs = parseLabeled(text).filter((s) => s.t != null);
  if (!segs.length) return null;
  const total = Math.max(totalSec || 0, (segs[segs.length - 1].t as number) + 1);
  const acc: Record<Who, number> = { teacher: 0, student: 0, media: 0 };
  const timeline: LessonStats["timeline"] = [];
  let studentTurns = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const from = s.t as number;
    const next = i + 1 < segs.length ? (segs[i + 1].t as number) : total;
    const gap = Math.max(0, next - from);
    // Media (video) matni tez-tez qisqartiriladi yoki tarjima bo'lmaydi — unga cheklov qo'ymaymiz.
    const cap = s.who === "media" ? gap : Math.min(gap, words(s.text) / 1.6 + 20);
    acc[s.who] += cap;
    if (s.who === "student") studentTurns++;
    const prev = timeline[timeline.length - 1];
    if (prev && prev.who === s.who && Math.abs(prev.to - from) < 1) prev.to = from + cap;
    else if (cap > 0) timeline.push({ from, to: from + cap, who: s.who });
  }
  const spoken = acc.teacher + acc.student + acc.media;
  const silence = Math.max(0, total - spoken);
  const pct = (v: number) => Math.round((v / total) * 1000) / 10;
  const mediaBlocks: LessonStats["media_blocks"] = [];
  for (const b of timeline) {
    if (b.who !== "media") continue;
    const prev = mediaBlocks[mediaBlocks.length - 1];
    // 60 s dan kichik uzilish (o'qituvchining qisqa izohi) bitta video bloki hisoblanadi.
    if (prev && b.from - prev.to < 60) prev.to = b.to;
    else mediaBlocks.push({ from: b.from, to: b.to, words: 0 });
  }
  for (const s of segs) {
    if (s.who !== "media") continue;
    const blk = mediaBlocks.find((b) => (s.t as number) >= b.from - 1 && (s.t as number) <= b.to + 1);
    if (blk) blk.words += words(s.text);
  }
  const r = (v: number) => Math.round(v);
  return {
    total_sec: r(total),
    teacher_sec: r(acc.teacher), student_sec: r(acc.student), media_sec: r(acc.media), silence_sec: r(silence),
    teacher_pct: pct(acc.teacher), student_pct: pct(acc.student), media_pct: pct(acc.media), silence_pct: pct(silence),
    student_turns: studentTurns,
    media_blocks: mediaBlocks.map((b) => ({ from: r(b.from), to: r(b.to), words: b.words })),
    timeline: timeline.map((b) => ({ from: r(b.from), to: r(b.to), who: b.who })),
  };
}

/**
 * Baholash uchun transkript: VIDEO parchalari to'liq matn o'rniga qisqa izoh bilan almashtiriladi
 * (o'qituvchi nutqi sifatida hisoblanmasin, token ham tejaladi).
 */
export function condenseForEval(text: string): string {
  if (!hasMarkers(text)) return text;
  const segs = parseLabeled(text);
  return segs.map((s) => {
    const tt = s.t != null ? fmtClock(s.t) + " " : "";
    if (s.who !== "media") return `[${tt}${WHO_LABEL[s.who]}] ${s.text}`;
    const w = words(s.text);
    const head = s.text.split(/\s+/).slice(0, 40).join(" ");
    return `[${tt}VIDEO] (yozib olingan media, ${w} so'z — o'qituvchi nutqi EMAS; boshlanishi: "${head}${w > 40 ? " …" : ""}")`;
  }).join("\n");
}

export function statsSummaryUz(st: LessonStats): string {
  const m = (s: number) => Math.round(s / 60);
  const blocks = st.media_blocks.map((b) => `${fmtClock(b.from)}–${fmtClock(b.to)} (${m(b.to - b.from)} daq)`).join(", ");
  return [
    `Dars davomiyligi: ${m(st.total_sec)} daqiqa.`,
    `O'qituvchi nutqi: ${m(st.teacher_sec)} daq (${st.teacher_pct}%).`,
    `Talabalar nutqi: ${m(st.student_sec)} daq (${st.student_pct}%), ${st.student_turns} marta gapirgan.`,
    `Video/media (yozib olingan audio): ${m(st.media_sec)} daq (${st.media_pct}%)${blocks ? ": " + blocks : ""}.`,
    `Jimlik/pauza/eshitilmagan: ${m(st.silence_sec)} daq (${st.silence_pct}%).`,
  ].join("\n");
}


/**
 * Yorliqlar orasidagi takrorlash sikli: model ba'zan "[TALABA] O'zbekiston. [O'QITUVCHI] Bugun darsni
 * davom ettiramiz." juftini o'nlab marta yozadi (#73, 48–50 daq). Ketma-ket 3+ marta takrorlangan
 * 1–4 parchali naqsh bitta nusxaga qisqartiriladi.
 */
export function collapseCycles(text: string): string {
  if (!hasMarkers(text)) return text;
  const segs = parseLabeled(text);
  const key = (s: Segment) => s.who + "|" + s.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const out: Segment[] = [];
  let i = 0;
  while (i < segs.length) {
    let skipped = false;
    for (let k = 1; k <= 4 && !skipped; k++) {
      if (i + k * 3 > segs.length) break;
      const pat = segs.slice(i, i + k).map(key).join("§");
      let reps = 1;
      while (i + (reps + 1) * k <= segs.length && segs.slice(i + reps * k, i + (reps + 1) * k).map(key).join("§") === pat) reps++;
      if (reps >= 3) {
        out.push(...segs.slice(i, i + k));
        i += reps * k;
        skipped = true;
      }
    }
    if (!skipped) { out.push(segs[i]); i++; }
  }
  return formatLabeled(out);
}

/** Qatorlar ro'yxati (butun darsni matnli tekshirish uchun): indeks, vaqt, manba, qisqa matn. */
export function numberedLines(text: string, maxChars = 160): { lines: string; segs: Segment[] } {
  const segs = parseLabeled(text);
  const lines = segs.map((s, i) => `${i}\t${s.t != null ? fmtClock(s.t) : "--:--"}\t${WHO_LABEL[s.who]}\t${s.text.slice(0, maxChars)}`).join("\n");
  return { lines, segs };
}

/** Berilgan indeks oraliqlaridagi parchalarga yangi manba qo'yadi. */
export function relabelRanges(segs: Segment[], ranges: { from: number; to: number; who: Who }[]): { text: string; changed: number } {
  let changed = 0;
  for (const r of ranges) {
    const a = Math.max(0, Math.min(r.from, r.to)), b = Math.min(segs.length - 1, Math.max(r.from, r.to));
    for (let i = a; i <= b; i++) if (segs[i].who !== r.who) { segs[i].who = r.who; changed++; }
  }
  return { text: formatLabeled(segs), changed };
}


/** Vaqt oraliqlari (soniya) ichida boshlanadigan parchalarga yangi manba qo'yadi. */
export function relabelByTime(segs: Segment[], ranges: { from: number; to: number; who: Who }[]): { text: string; changed: number } {
  let changed = 0;
  for (const r of ranges) {
    for (const sg of segs) {
      if (sg.t == null || sg.t < r.from - 1 || sg.t > r.to) continue;
      if (sg.who !== r.who) { sg.who = r.who; changed++; }
    }
  }
  return { text: formatLabeled(segs), changed };
}

/** "MM:SS" / "H:MM:SS" / daqiqa soni → soniya. */
export function parseClock(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v * 60;
  const m = String(v ?? "").trim().match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  return (m[1] ? Number(m[1]) * 3600 : 0) + Number(m[2]) * 60 + Number(m[3]);
}
