/**
 * Word Error Rate (WER) + Character Error Rate (CER) scorer for Uzbek STT.
 *
 * Usage: node wer.js <reference.txt> <hypothesis.txt>
 *
 * Normalizes Uzbek apostrophe variants and punctuation before comparing, so
 * "o'qituvchi" / "oʻqituvchi" / "o`qituvchi" all match. Reports substitutions,
 * deletions, insertions and the resulting WER/accuracy.
 */
const fs = require("fs");

function normalize(text) {
  return text
    .toLowerCase()
    // unify all apostrophe-like marks (ʻ ʼ ' ' ` ´) to a single '
    .replace(/[ʻʼ‘’`´`]/g, "'")
    // strip the header lines our outputs sometimes carry
    .replace(/^kurs:.*$/gim, "")
    .replace(/^mavzu:.*$/gim, "")
    // drop punctuation (keep apostrophe and hyphen inside words)
    .replace(/[.,;:!?"""()\[\]{}«»…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text) {
  return normalize(text).split(" ").filter(Boolean);
}

// Levenshtein over token arrays, returning edit counts by type.
function align(ref, hyp) {
  const n = ref.length, m = hyp.length;
  const d = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  // backtrace to count S/D/I
  let i = n, j = m, S = 0, D = 0, I = 0, C = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      if (ref[i - 1] === hyp[j - 1]) C++; else S++;
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { D++; i--; }
    else { I++; j--; }
  }
  return { S, D, I, C, dist: d[n][m] };
}

const [refPath, hypPath] = process.argv.slice(2);
if (!refPath || !hypPath) {
  console.error("Usage: node wer.js <reference.txt> <hypothesis.txt>");
  process.exit(1);
}

const ref = tokens(fs.readFileSync(refPath, "utf8"));
const hyp = tokens(fs.readFileSync(hypPath, "utf8"));
const { S, D, I, C, dist } = align(ref, hyp);

const wer = dist / ref.length;
// Character-level (concatenated, spaces removed)
const refC = normalize(fs.readFileSync(refPath, "utf8")).replace(/ /g, "").split("");
const hypC = normalize(fs.readFileSync(hypPath, "utf8")).replace(/ /g, "").split("");
const cer = align(refC, hypC).dist / refC.length;

console.log(`Reference words : ${ref.length}`);
console.log(`Hypothesis words: ${hyp.length}`);
console.log(`Correct         : ${C}`);
console.log(`Substitutions   : ${S}`);
console.log(`Deletions       : ${D}`);
console.log(`Insertions      : ${I}`);
console.log(`─────────────────────────────`);
console.log(`WER             : ${(wer * 100).toFixed(1)}%  (word accuracy ${Math.max(0, (1 - wer) * 100).toFixed(1)}%)`);
console.log(`CER             : ${(cer * 100).toFixed(1)}%  (char accuracy ${Math.max(0, (1 - cer) * 100).toFixed(1)}%)`);
