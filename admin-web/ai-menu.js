/* ═══════════════════════════════════════════════════════
   EduLensAI — ovozli tahlilchi (/ai-menu)
   Savol (matn/ovoz) → worker AI endpointlari → javob + TTS
   ═══════════════════════════════════════════════════════ */

const API = window.EYEZIYO_API_BASE;

// ── Auth guard: faqat admin ──
const Auth = {
  get token() { return localStorage.getItem("eyeziyo_token"); },
  get user() {
    try { return JSON.parse(localStorage.getItem("eyeziyo_user") || "null"); }
    catch { return null; }
  },
};
if (!Auth.token || !Auth.user || Auth.user.role !== "admin") {
  location.href = "index.html";
}

// ── DOM ──
const $ = (s) => document.querySelector(s);
const chatEl = $("#chat");
const inputEl = $("#questionInput");
const sendBtn = $("#sendBtn");
const micBtn = $("#micBtn");
const orbWrap = $("#orbWrap");
const orbEl = $("#orb");
const orbStatus = $("#orbStatus");
const autoVoice = $("#autoVoice");
const inputShell = $("#inputShell");
const waveEl = $("#wave");
const teleLeft = $("#teleLeft");
const teleRight = $("#teleRight");

// ═══ Boot sekvensiyasi ═══
(function boot() {
  const lines = [
    { t: "EDULENSAI CORE v2.0", d: 100 },
    { t: "<span>Neyron interfeys...</span> <b>ULANDI</b>", d: 420 },
    { t: "<span>Analitika bazasi...</span> <b>SINXRON</b>", d: 780 },
    { t: "<span>Ovoz moduli (TTS/STT)...</span> <b>TAYYOR</b>", d: 1140 },
  ];
  const box = $("#bootLines");
  for (const l of lines) {
    setTimeout(() => {
      const div = document.createElement("div");
      div.innerHTML = "▸ " + l.t;
      box.appendChild(div);
    }, l.d);
  }
  const bootEl = $("#boot");
  const finish = () => {
    bootEl.classList.add("done");
    // Fade tugagach DOM'dan butunlay olib tashlaymiz
    setTimeout(() => bootEl.remove(), 700);
  };
  setTimeout(finish, 1750);
  bootEl.addEventListener("click", finish);
  // Fallback: chip entrance animatsiyasi qandaydir sabab bilan o'ynamasa ham
  // chiplar ko'rinsin (masalan, eski brauzer)
  setTimeout(() => {
    document.querySelectorAll(".chip").forEach((c) => { c.style.opacity = 1; });
  }, 3200);
})();

// ═══ Telemetriya (HUD) ═══
const sessionStart = Date.now();
let lastLatency = null;
setInterval(() => {
  const s = Math.floor((Date.now() - sessionStart) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  teleRight.innerHTML = `SESSIYA · <b>${mm}:${ss}</b>`;
}, 1000);
function setTele(state) {
  const lat = lastLatency ? ` · <b>${(lastLatency / 1000).toFixed(1)}s</b>` : "";
  teleLeft.innerHTML = `CORE · <b>${state}</b>${lat}`;
}
setTele("ONLINE");

// ── Holat ──
let history = [];      // [{role, content}] — followup savollar konteksti
let busy = false;
let recording = false;
let currentAudio = null;   // hozir ijro etilayotgan <audio>
const ttsCache = new Map(); // matn → blob URL (replay uchun qayta so'ramaslik)

function setOrbState(state, statusText) {
  orbWrap.classList.remove("thinking", "listening", "speaking");
  if (state) orbWrap.classList.add(state);
  if (statusText !== undefined) orbStatus.textContent = statusText;
  setTele(state === "thinking" ? "TAHLIL" : state === "listening" ? "TINGLASH" : state === "speaking" ? "NUTQ" : "ONLINE");
}

// ── API helper ──
async function api(path, body, asBlob = false) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Auth.token}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) { location.href = "index.html"; throw new Error("401"); }
  if (!res.ok) {
    let detail = "Server xatosi";
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return asBlob ? res.blob() : res.json();
}

// ── Chat render ──
function addUserMsg(text) {
  document.body.classList.add("chat-active");
  const div = document.createElement("div");
  div.className = "msg user";
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function addTyping() {
  const div = document.createElement("div");
  div.className = "msg ai";
  div.innerHTML = `<div class="ai-tag">EduLensAI</div><div class="typing"><i></i><i></i><i></i></div>`;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function addErrorMsg(text) {
  const div = document.createElement("div");
  div.className = "msg error";
  div.textContent = "⚠ " + text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

/** Javobni typewriter effekti bilan chiqarish (yonib-o'chuvchi kursor bilan) */
function typeOut(el, text) {
  return new Promise((resolve) => {
    el.classList.add("cursor-blink");
    let i = 0;
    const step = Math.max(1, Math.round(text.length / 120)); // ~1.5s umumiy
    const timer = setInterval(() => {
      i = Math.min(text.length, i + step);
      el.textContent = text.slice(0, i);
      chatEl.scrollTop = chatEl.scrollHeight;
      if (i >= text.length) {
        clearInterval(timer);
        el.classList.remove("cursor-blink");
        resolve();
      }
    }, 14);
  });
}

// ── TTS ijro ──
function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  document.querySelectorAll(".replay-btn.playing").forEach((b) => b.classList.remove("playing"));
  setOrbState(null, "");
  cancelAnimationFrame(orbRaf);
  orbEl.style.transform = "";
}

let audioCtx = null;
let orbRaf = 0;

/** WAV blob'ni ijro etib, amplituda bilan orb'ni "gapirtirish" */
async function playTts(text, btn) {
  stopAudio();
  try {
    let url = ttsCache.get(text);
    if (!url) {
      if (btn) btn.classList.add("playing");
      const blob = await api("/api/admin/ai/tts", { text }, true);
      url = URL.createObjectURL(blob);
      ttsCache.set(text, url);
    }

    const audio = new Audio(url);
    currentAudio = audio;
    if (btn) btn.classList.add("playing");
    setOrbState("speaking", "Gapiryapman...");

    // Analyser — orb ovoz amplitudasiga qarab pulsatsiya qiladi
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") await audioCtx.resume();
      const src = audioCtx.createMediaElementSource(audio);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyser.connect(audioCtx.destination);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const pulse = () => {
        if (currentAudio !== audio) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const level = sum / data.length / 255; // 0..1
        orbEl.style.transform = `scale(${1 + level * 0.35})`;
        orbRaf = requestAnimationFrame(pulse);
      };
      pulse();
    } catch { /* analyser ishlamasa ham audio o'zi chalinadi */ }

    await audio.play();
    await new Promise((r) => { audio.onended = r; audio.onerror = r; });
  } catch (e) {
    // TTS ishlamasa — brauzer speechSynthesis fallback
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "uz-UZ";
      speechSynthesis.speak(u);
      await new Promise((r) => { u.onend = r; u.onerror = r; });
    } catch {}
  } finally {
    if (btn) btn.classList.remove("playing");
    if (currentAudio) { currentAudio = null; }
    cancelAnimationFrame(orbRaf);
    orbEl.style.transform = "";
    setOrbState(null, "");
  }
}

// ── Savol yuborish ──
async function ask(question) {
  const q = (question || "").trim();
  if (!q || busy) return;
  busy = true;
  sendBtn.disabled = true;
  inputEl.value = "";
  stopAudio();

  addUserMsg(q);
  setOrbState("thinking", "O'ylayapman...");
  const typingMsg = addTyping();
  const t0 = Date.now();

  try {
    const { answer } = await api("/api/admin/ai/ask", { question: q, history });
    lastLatency = Date.now() - t0;
    history.push({ role: "user", content: q }, { role: "assistant", content: answer });
    if (history.length > 12) history = history.slice(-12);

    // Typing indikatorini javob bilan almashtirish
    typingMsg.innerHTML = `<div class="ai-tag">EduLensAI <span class="lat">· ${(lastLatency / 1000).toFixed(1)}s</span></div>`;
    const textEl = document.createElement("div");
    typingMsg.appendChild(textEl);
    setOrbState(null, "");

    const replay = document.createElement("button");
    replay.className = "replay-btn";
    replay.innerHTML = "🔊 Qayta eshitish";
    replay.onclick = () => playTts(answer, replay);

    if (autoVoice.checked) {
      // Yozish va gapirish parallel boshlanadi
      const typing = typeOut(textEl, answer);
      const speaking = playTts(answer, replay);
      await typing;
      typingMsg.appendChild(replay);
      await speaking;
    } else {
      await typeOut(textEl, answer);
      typingMsg.appendChild(replay);
    }
  } catch (e) {
    typingMsg.remove();
    addErrorMsg(e.message || "Xatolik yuz berdi");
    setOrbState(null, "");
  } finally {
    busy = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

sendBtn.addEventListener("click", () => ask(inputEl.value));
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(inputEl.value); }
});
document.querySelectorAll(".chip").forEach((c) =>
  c.addEventListener("click", () => ask(c.textContent))
);

// ═══════════════════════════════════════════════════════
// Mikrofon — 16kHz mono WAV yozib olib STT'ga yuborish
// (MediaRecorder webm o'rniga WAV: Gemini kafolatli qabul qiladi)
// ═══════════════════════════════════════════════════════

let recStream = null, recCtx = null, recNode = null, recChunks = [], recSampleRate = 16000;
let recAnalyser = null, waveRaf = 0;

// Waveform ustunlarini yaratish
const WAVE_BARS = 36;
for (let i = 0; i < WAVE_BARS; i++) waveEl.appendChild(document.createElement("i"));
const waveBars = [...waveEl.children];

function waveLoop() {
  if (!recording || !recAnalyser) return;
  const data = new Uint8Array(recAnalyser.frequencyBinCount);
  recAnalyser.getByteFrequencyData(data);
  const step = Math.floor(data.length / WAVE_BARS);
  for (let i = 0; i < WAVE_BARS; i++) {
    const v = data[i * step] / 255;
    waveBars[i].style.height = `${Math.max(4, v * 34)}px`;
  }
  waveRaf = requestAnimationFrame(waveLoop);
}

async function startRecording() {
  recStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  recCtx = new (window.AudioContext || window.webkitAudioContext)();
  recSampleRate = recCtx.sampleRate;
  const src = recCtx.createMediaStreamSource(recStream);
  recNode = recCtx.createScriptProcessor(4096, 1, 1);
  recChunks = [];
  recNode.onaudioprocess = (e) => {
    recChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  src.connect(recNode);
  recNode.connect(recCtx.destination);

  // Jonli waveform uchun analyser
  recAnalyser = recCtx.createAnalyser();
  recAnalyser.fftSize = 128;
  src.connect(recAnalyser);

  recording = true;
  micBtn.classList.add("recording");
  inputShell.classList.add("recording");
  setOrbState("listening", "Eshityapman... (to'xtatish uchun yana bosing)");
  waveLoop();

  // 60 soniyalik xavfsizlik limiti
  setTimeout(() => { if (recording) stopRecording(); }, 60000);
}

function downsampleTo16k(chunks, srcRate) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Float32Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }

  const targetRate = 16000;
  if (srcRate === targetRate) return merged;
  const ratio = srcRate / targetRate;
  const outLen = Math.floor(merged.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    // Oddiy o'rtacha bilan downsample — qisqa savol uchun yetarli sifat
    const start = Math.floor(i * ratio);
    const end = Math.min(merged.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += merged[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

function floatToWavBase64(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); ws(8, "WAVE");
  ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ws(36, "data"); v.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  // ArrayBuffer → base64 (bo'laklab, stack overflow'siz)
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function stopRecording() {
  recording = false;
  micBtn.classList.remove("recording");
  inputShell.classList.remove("recording");
  cancelAnimationFrame(waveRaf);
  recAnalyser = null;

  try { recNode && recNode.disconnect(); } catch {}
  try { recStream && recStream.getTracks().forEach((t) => t.stop()); } catch {}
  try { recCtx && recCtx.close(); } catch {}

  const chunks = recChunks;
  recChunks = [];
  if (!chunks.length) { setOrbState(null, ""); return; }

  setOrbState("thinking", "Savolingizni yozib olyapman...");
  try {
    const samples = downsampleTo16k(chunks, recSampleRate);
    if (samples.length < 8000) { // <0.5s — juda qisqa
      setOrbState(null, "");
      return;
    }
    const b64 = floatToWavBase64(samples, 16000);
    const { text } = await api("/api/admin/ai/stt", { audio: b64, mime: "audio/wav" });
    setOrbState(null, "");
    if (text && text.trim()) {
      inputEl.value = text.trim();
      ask(text.trim());
    } else {
      addErrorMsg("Savol eshitilmadi, qayta urinib ko'ring");
    }
  } catch (e) {
    setOrbState(null, "");
    addErrorMsg(e.message || "Ovozni qayta ishlashda xatolik");
  }
}

micBtn.addEventListener("click", async () => {
  if (busy) return;
  if (recording) { stopRecording(); return; }
  stopAudio();
  try {
    await startRecording();
  } catch {
    addErrorMsg("Mikrofonga ruxsat berilmadi");
  }
});

// ═══════════════════════════════════════════════════════
// Fon — neyron tarmoq: tugunlar, ular orasidagi aloqa
// chiziqlari, uchar yulduzlar va sichqoncha parallaksi
// ═══════════════════════════════════════════════════════
(function bg() {
  const canvas = document.getElementById("bgCanvas");
  const grid = document.getElementById("gridOverlay");
  const ctx = canvas.getContext("2d");
  let W, H, nodes;
  let mx = 0.5, my = 0.5; // normalizatsiyalangan sichqoncha
  const LINK_DIST = 130;
  let shooting = null;

  function resize() {
    W = canvas.width = innerWidth;
    H = canvas.height = innerHeight;
    const count = Math.min(90, Math.round((W * H) / 18000));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.6 + 0.6,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      hue: Math.random() < 0.6 ? 190 : 265, // cyan yoki violet
      tw: Math.random() * Math.PI * 2,
      depth: 0.4 + Math.random() * 0.6, // parallaks chuqurligi
    }));
  }
  resize();
  addEventListener("resize", resize);

  addEventListener("mousemove", (e) => {
    mx = e.clientX / W; my = e.clientY / H;
    grid.style.transform = `translate(${(mx - 0.5) * 18}px, ${(my - 0.5) * 12}px)`;
  });

  function spawnShooting() {
    shooting = {
      x: Math.random() * W * 0.7 + W * 0.15,
      y: -20,
      vx: (Math.random() - 0.3) * 6,
      vy: 7 + Math.random() * 5,
      life: 1,
    };
    setTimeout(spawnShooting, 6000 + Math.random() * 9000);
  }
  setTimeout(spawnShooting, 4000);

  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    const px = (mx - 0.5) * 26, py = (my - 0.5) * 18;

    // Aloqa chiziqlari
    ctx.lineWidth = 0.6;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK_DIST * LINK_DIST) {
          const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.14;
          ctx.strokeStyle = `hsla(210, 90%, 70%, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x + px * a.depth, a.y + py * a.depth);
          ctx.lineTo(b.x + px * b.depth, b.y + py * b.depth);
          ctx.stroke();
        }
      }
    }

    // Tugunlar
    for (const s of nodes) {
      s.x += s.vx; s.y += s.vy;
      if (s.x < 0) s.x = W; if (s.x > W) s.x = 0;
      if (s.y < 0) s.y = H; if (s.y > H) s.y = 0;
      const alpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t / 900 + s.tw));
      ctx.beginPath();
      ctx.arc(s.x + px * s.depth, s.y + py * s.depth, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${s.hue}, 90%, 70%, ${alpha})`;
      ctx.fill();
    }

    // Uchar yulduz
    if (shooting) {
      const sh = shooting;
      sh.x += sh.vx; sh.y += sh.vy; sh.life -= 0.012;
      if (sh.life <= 0 || sh.y > H + 40) { shooting = null; }
      else {
        const grad = ctx.createLinearGradient(sh.x, sh.y, sh.x - sh.vx * 10, sh.y - sh.vy * 10);
        grad.addColorStop(0, `rgba(180, 240, 255, ${sh.life * 0.9})`);
        grad.addColorStop(1, "transparent");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x - sh.vx * 10, sh.y - sh.vy * 10);
        ctx.stroke();
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

inputEl.focus();
