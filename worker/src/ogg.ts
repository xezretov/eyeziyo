/**
 * Ogg (Opus) faylni ffmpeg'siz, sahifa (page) darajasida bo'laklarga bo'lish.
 *
 * NIMA UCHUN: Gemini 80 daqiqalik audioni bitta so'rovda ishonchsiz
 * transkript qiladi — 32k token limitiga uriladi yoki takrorlash sikliga
 * tushadi (2026-09-15 tajribasi: to'liq fayl → 231 so'z saqlandi, 10 daqiqalik
 * bo'lak → 546 so'z, toza STOP). Workers'da ffmpeg yo'q, ammo Ogg konteyneri
 * o'z-o'zidan chegaralangan sahifalardan iborat: sarlavha sahifalari
 * (OpusHead, OpusTags) + audio sahifalarining bir qismi = yaroqli Ogg fayl.
 *
 * Har bo'lak uchun: granule position 0 dan boshlanadigan qilib qayta yoziladi,
 * sahifa raqamlari qayta tartiblanadi, oxirgi sahifaga EOS bayrog'i qo'yiladi,
 * CRC32 qayta hisoblanadi. Bo'lak chegarasi faqat davom etayotgan paket
 * (continuation) bo'lmagan sahifada tanlanadi — paket yarim kesilmaydi.
 *
 * Opus uchun granule = 48 kHz namunalar soni (kodek sample rate'idan qat'i nazar).
 */

const OPUS_RATE = 48000;

interface OggPage {
  offset: number;      // fayldagi boshlanish
  length: number;      // to'liq sahifa uzunligi (header + body)
  headerType: number;  // 0x01 continuation, 0x02 BOS, 0x04 EOS
  granule: bigint;
  serial: number;
  seq: number;
}

function readPages(bytes: Uint8Array): OggPage[] {
  const pages: OggPage[] = [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  while (off + 27 <= bytes.length) {
    // "OggS"
    if (bytes[off] !== 0x4f || bytes[off + 1] !== 0x67 || bytes[off + 2] !== 0x67 || bytes[off + 3] !== 0x53) {
      // Sinxron yo'qoldi — keyingi "OggS" ni qidiramiz.
      off++;
      continue;
    }
    const headerType = bytes[off + 5];
    const granule = dv.getBigInt64(off + 6, true);
    const serial = dv.getUint32(off + 14, true);
    const seq = dv.getUint32(off + 18, true);
    const nSegs = bytes[off + 26];
    if (off + 27 + nSegs > bytes.length) break;
    let body = 0;
    for (let i = 0; i < nSegs; i++) body += bytes[off + 27 + i];
    const length = 27 + nSegs + body;
    if (off + length > bytes.length) break;
    pages.push({ offset: off, length, headerType, granule, serial, seq });
    off += length;
  }
  return pages;
}

// ── Ogg CRC32: polinom 0x04c11db7, boshlang'ich 0, aks ettirishsiz, yakuniy XOR yo'q ──
let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    t[i] = r >>> 0;
  }
  CRC_TABLE = t;
  return t;
}
function oggCrc(page: Uint8Array): number {
  const t = crcTable();
  let crc = 0;
  for (let i = 0; i < page.length; i++) {
    crc = ((crc << 8) ^ t[((crc >>> 24) ^ page[i]) & 0xff]) >>> 0;
  }
  return crc;
}

/** Sahifa nusxasini granule/seq/bayroq bilan qayta yozib, CRC ni yangilaydi. */
function rewritePage(
  src: Uint8Array, p: OggPage, granule: bigint, seq: number, eos: boolean, out: Uint8Array, outOff: number,
): void {
  out.set(src.subarray(p.offset, p.offset + p.length), outOff);
  const dv = new DataView(out.buffer, out.byteOffset + outOff, p.length);
  let ht = p.headerType & ~0x04;
  if (eos) ht |= 0x04;
  out[outOff + 5] = ht;
  dv.setBigInt64(6, granule, true);
  dv.setUint32(18, seq >>> 0, true);
  dv.setUint32(22, 0, true);
  const crc = oggCrc(out.subarray(outOff, outOff + p.length));
  dv.setUint32(22, crc, true);
}

export interface OggChunk {
  index: number;
  bytes: Uint8Array;
  startSec: number;   // asl fayldagi boshlanish (soniya)
  endSec: number;
}

/** Fayl Ogg ekanini tekshiradi ("OggS" imzosi). */
export function isOgg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
}

/**
 * Ogg Opus faylni ~chunkSec uzunlikdagi bo'laklarga bo'ladi.
 * Bo'lak soni 1 bo'lsa (qisqa fayl) asl baytlar qaytariladi.
 * Ogg emas yoki tuzilishi noma'lum bo'lsa — bitta bo'lak, asl baytlar.
 */
export function splitOggOpus(bytes: Uint8Array, chunkSec = 600, minTailSec = 120): OggChunk[] {
  const whole: OggChunk[] = [{ index: 0, bytes, startSec: 0, endSec: 0 }];
  if (!isOgg(bytes)) return whole;

  const pages = readPages(bytes);
  if (pages.length < 3) return whole;

  // Sarlavha sahifalari: birinchi mantiqiy oqimning granule=0 sahifalari
  // (Opus: OpusHead [BOS] + OpusTags). Faqat bitta oqim (serial) qo'llab-quvvatlanadi.
  const serial = pages[0].serial;
  const headers: OggPage[] = [];
  let i = 0;
  while (i < pages.length && pages[i].serial === serial && pages[i].granule === 0n) {
    headers.push(pages[i]);
    i++;
  }
  if (headers.length === 0 || !(headers[0].headerType & 0x02)) return whole;

  const audio = pages.slice(i).filter((p) => p.serial === serial);
  if (audio.length === 0) return whole;

  const lastGranule = audio[audio.length - 1].granule;
  const totalSec = Number(lastGranule) / OPUS_RATE;
  if (totalSec <= chunkSec + minTailSec) {
    return [{ index: 0, bytes, startSec: 0, endSec: totalSec }];
  }

  // Bo'lak chegaralari: granule chunkSec dan oshgan, continuation bo'lmagan sahifa.
  const groups: OggPage[][] = [];
  let cur: OggPage[] = [];
  let base = 0n; // joriy bo'lak boshlanishidagi granule (oldingi sahifa oxiri)
  let prevGranule = 0n;
  for (const p of audio) {
    const elapsed = Number(prevGranule - base) / OPUS_RATE;
    if (cur.length > 0 && elapsed >= chunkSec && !(p.headerType & 0x01)) {
      groups.push(cur);
      cur = [];
      base = prevGranule;
    }
    cur.push(p);
    prevGranule = p.granule;
  }
  if (cur.length > 0) {
    // Juda qisqa dum — oldingi bo'lakka qo'shamiz.
    const tailSec = Number(prevGranule - base) / OPUS_RATE;
    if (groups.length > 0 && tailSec < minTailSec) groups[groups.length - 1].push(...cur);
    else groups.push(cur);
  }

  const headerBytes = headers.reduce((a, h) => a + h.length, 0);
  const chunks: OggChunk[] = [];
  let chunkBase = 0n;
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    const total = headerBytes + grp.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    let seq = 0;
    for (const h of headers) {
      rewritePage(bytes, h, 0n, seq++, false, out, off);
      off += h.length;
    }
    for (let k = 0; k < grp.length; k++) {
      const p = grp[k];
      const granule = p.granule - chunkBase;
      rewritePage(bytes, p, granule < 0n ? 0n : granule, seq++, k === grp.length - 1, out, off);
      off += p.length;
    }
    const startSec = Number(chunkBase) / OPUS_RATE;
    const endSec = Number(grp[grp.length - 1].granule) / OPUS_RATE;
    chunks.push({ index: g, bytes: out, startSec, endSec });
    chunkBase = grp[grp.length - 1].granule;
  }
  return chunks;
}
