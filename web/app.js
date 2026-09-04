// ═══════════════════════════════════════════════════════════════
// EduLensAI Admin (tatuziyo) — audiotap → STT → AI baholash paneli
//
// Dizayn tizimi admin.eyeziyo.uz (eyeziyo/admin-web) bilan BIR XIL:
// styles.css o'zgarishsiz ko'chirilgan, sahifa tuzilmalari ham o'sha
// komponentlar (kpi-spark, gauge, ai-card, dash-grid-3, rank-list,
// filters-bar, view-toggle, pagination, person-card, detail-header).
// HEMIS yo'q — o'qituvchi/fan qo'lda kiritiladi.
// ═══════════════════════════════════════════════════════════════

const API = ""; // frontend va API bitta domenda (tuit.eyeziyo.uz)
const root = document.getElementById("app");
const toastRoot = document.getElementById("toast-container");

// ═══════════════════════════════════════════════════════════════
// STORAGE + PREFS
// ═══════════════════════════════════════════════════════════════
const Auth = {
  get token() { return localStorage.getItem("tz_token"); },
  set token(v) { v ? localStorage.setItem("tz_token", v) : localStorage.removeItem("tz_token"); },
  get refresh() { return localStorage.getItem("tz_refresh"); },
  set refresh(v) { v ? localStorage.setItem("tz_refresh", v) : localStorage.removeItem("tz_refresh"); },
  get user() {
    try { const raw = localStorage.getItem("tz_user"); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  },
  set user(u) { u ? localStorage.setItem("tz_user", JSON.stringify(u)) : localStorage.removeItem("tz_user"); },
  clear() { this.token = null; this.refresh = null; this.user = null; }
};

const Prefs = {
  get theme() { return localStorage.getItem("tz_theme") || "light"; },
  set theme(v) { localStorage.setItem("tz_theme", v); document.documentElement.setAttribute("data-theme", v); },
  get sidebarCollapsed() { return localStorage.getItem("tz_sb") === "1"; },
  set sidebarCollapsed(v) { localStorage.setItem("tz_sb", v ? "1" : "0"); },
};
document.documentElement.setAttribute("data-theme", Prefs.theme);

// ═══════════════════════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════════════════════
async function api(path, opts = {}, allowRefresh = true) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (Auth.token) headers["Authorization"] = `Bearer ${Auth.token}`;
  let res;
  try {
    res = await fetch(API + path, { ...opts, headers });
  } catch (e) {
    throw new Error("Serverga ulanib bo'lmadi. Internet yoki backend holatini tekshiring.");
  }
  if (res.status === 401 && allowRefresh && Auth.refresh) {
    if (await tryRefresh()) return api(path, opts, false);
  }
  if (res.status === 401) {
    Auth.clear();
    route("login");
    throw new Error("Sessiya tugagan, qayta kiring");
  }
  const txt = await res.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = txt; }
  if (!res.ok) {
    const msg = data?.detail || data?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function tryRefresh() {
  try {
    const res = await fetch(API + "/api/auth/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: Auth.refresh }),
    });
    if (!res.ok) return false;
    Auth.token = (await res.json()).access_token;
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════
// ICONS (admin-web bilan bir xil to'plam)
// ═══════════════════════════════════════════════════════════════
const I = {
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  teachers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11v6M12 2l10 5-10 5L2 7z"/><path d="M6 9.5V16c3 3 9 3 12 0V9.5"/></svg>',
  students: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  groups: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  subjects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9A9 9 0 0 1 18.49 5.64L23 10M1 14l4.51 4.36A9 9 0 0 0 20.49 15"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
  xmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  gridView: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  tableView: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 9H4a2 2 0 0 1-2-2V5h5M17 9h3a2 2 0 0 0 2-2V5h-5"/></svg>',
  trending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3 5-5"/><circle cx="12" cy="12" r="10"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  room: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
};

// ═══════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function toast(msg, type = "info", ms = 3200) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  const ic = type === "success" ? I.ok : type === "error" ? I.xmark : I.info;
  el.innerHTML = `
    <div class="t-icon">${ic}</div>
    <div class="t-msg">${escapeHtml(msg)}</div>
    <button class="t-close">${I.close}</button>
  `;
  toastRoot.appendChild(el);
  const close = () => { el.classList.add("leaving"); setTimeout(() => el.remove(), 180); };
  el.querySelector(".t-close").addEventListener("click", close);
  setTimeout(close, ms);
}

function openModal(id, inner) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = id;
  modal.className = "modal-backdrop";
  modal.innerHTML = inner;
  document.body.appendChild(modal);
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const close = () => { modal.remove(); document.removeEventListener("keydown", onKey); };
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", onKey);
  return { modal, close };
}

function confirmDelete(title, msg, fn) {
  const { modal, close } = openModal("confirm-modal", `
    <div class="modal-card modal-confirm">
      <div class="confirm-icon">${I.warn}</div>
      <h3>${escapeHtml(title)}</h3>
      <p class="confirm-text">${escapeHtml(msg)}</p>
      <div class="error" id="cf-err"></div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="cf-cancel">Bekor qilish</button>
        <button type="button" class="btn-danger" id="cf-ok">${I.trash} O'chirish</button>
      </div>
    </div>
  `);
  modal.querySelector("#cf-cancel").addEventListener("click", close);
  const btn = modal.querySelector("#cf-ok");
  const err = modal.querySelector("#cf-err");
  btn.addEventListener("click", async () => {
    err.classList.remove("show");
    btn.disabled = true;
    btn.textContent = "O'chirilmoqda...";
    try { await fn(); close(); }
    catch (e) { err.textContent = e.message; err.classList.add("show"); btn.disabled = false; btn.innerHTML = `${I.trash} O'chirish`; }
  });
}

function emptyStateHtml(title, sub) {
  return `<div class="empty">
    <div class="e-icon">${I.info}</div>
    <div class="e-title">${escapeHtml(title)}</div>
    <div class="e-sub">${escapeHtml(sub || "")}</div>
  </div>`;
}

function scoreColor(v) {
  if (v >= 80) return "success";
  if (v >= 60) return "warning";
  if (v > 0) return "danger";
  return "muted";
}
function qualityLabel(pct) {
  if (pct >= 85) return "A'lo";
  if (pct >= 70) return "Yaxshi";
  if (pct >= 50) return "O'rtacha";
  if (pct > 0) return "Zaif";
  return "Ma'lumot yo'q";
}

// Deterministic per-name avatar color so people are visually distinguishable in lists.
const AVATAR_PALETTE = [
  ["#2563EB", "#7C3AED"], ["#0891B2", "#2563EB"], ["#059669", "#0891B2"],
  ["#D97706", "#DC2626"], ["#7C3AED", "#DB2777"], ["#DB2777", "#F59E0B"],
  ["#0D9488", "#059669"], ["#4F46E5", "#2563EB"],
];
function avatarStyle(name) {
  const s = String(name || "?");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const [a, b] = AVATAR_PALETTE[h % AVATAR_PALETTE.length];
  return ` style="background:linear-gradient(135deg,${a},${b})"`;
}
function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

// Make a clickable table row keyboard-operable (Enter/Space) and focusable.
function makeRowAccessible(el, onActivate, label) {
  el.setAttribute("tabindex", "0");
  el.setAttribute("role", "button");
  if (label) el.setAttribute("aria-label", label);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(e); }
  });
}

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return n ? `${n} B` : "—";
}
function fmtDuration(sec) {
  const s = Math.round(Number(sec) || 0);
  if (s <= 0) return "—";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}
function fmtMinutes(sec) { return Math.round((Number(sec) || 0) / 60); }

// uz-UZ lokali qisqa oyni "M08" ko'rinishida beradi — oy nomlarini o'zimiz yozamiz.
const UZ_MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const UZ_MONTHS_FULL = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
function parseDbDate(raw) {
  // D1 `created_at` "YYYY-MM-DD HH:MM:SS" (UTC) ko'rinishida keladi — ISO ga o'tkazamiz.
  const s = String(raw);
  return new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
}
function fmtDateTime(raw) {
  if (!raw) return "—";
  try {
    const d = parseDbDate(raw);
    if (isNaN(d)) return String(raw);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${d.getDate()} ${UZ_MONTHS[d.getMonth()]}, ${hh}:${mm}`;
  } catch { return String(raw); }
}
function fmtDate(raw) {
  if (!raw) return "—";
  try {
    const d = parseDbDate(raw);
    if (isNaN(d)) return String(raw).slice(0, 10);
    return `${d.getDate()} ${UZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  } catch { return String(raw).slice(0, 10); }
}
function fmtToday() {
  const d = new Date();
  return `${d.getDate()} ${UZ_MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}
function skeletonBlock(h = 120) { return `<div class="skel" style="height:${h}px;margin-bottom:12px"></div>`; }

function paginationHtml(current, total, totalItems, pageSize) {
  const start = (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, totalItems);
  const pages = [];
  const maxBtns = 5;
  let from = Math.max(1, current - 2);
  let to = Math.min(total, from + maxBtns - 1);
  from = Math.max(1, to - maxBtns + 1);
  for (let i = from; i <= to; i++) pages.push(i);

  return `
    <div class="pagination">
      <div class="info">${start}–${end} / ${totalItems}</div>
      <div class="pages">
        <button data-page="${Math.max(1, current - 1)}" ${current === 1 ? "disabled" : ""}>←</button>
        ${from > 1 ? `<button data-page="1">1</button>${from > 2 ? `<span style="padding:0 4px;color:var(--text-faint)">…</span>` : ""}` : ""}
        ${pages.map(p => `<button data-page="${p}" class="${p === current ? "active" : ""}">${p}</button>`).join("")}
        ${to < total ? `${to < total - 1 ? `<span style="padding:0 4px;color:var(--text-faint)">…</span>` : ""}<button data-page="${total}">${total}</button>` : ""}
        <button data-page="${Math.min(total, current + 1)}" ${current === total ? "disabled" : ""}>→</button>
      </div>
    </div>
  `;
}

// Small ambient sparkline (decorative trend indicator) for KPI cards.
function sparkLine(vals, color) {
  const pts = (vals && vals.length ? vals : [1, 1, 1]).map(Number);
  const W = 88, H = 30;
  const max = Math.max(...pts), min = Math.min(...pts);
  const span = max - min || 1;
  const sx = (i) => (i * W) / (pts.length - 1 || 1);
  const sy = (v) => H - 3 - ((v - min) / span) * (H - 6);
  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
  const area = line + ` L${W},${H} L0,${H} Z`;
  const gid = "sg" + Math.random().toString(36).slice(2, 8);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// Deterministic gentle wave that trends toward `value` — purely visual.
function sparkSeed(value, seed) {
  const n = 8;
  const base = Math.max(1, Number(value) || 1);
  const out = [];
  let s = seed || 1;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const noise = ((s / 0x7fffffff) - 0.5) * 0.28;
    const ramp = 0.72 + (i / (n - 1)) * 0.28;
    out.push(base * (ramp + noise));
  }
  out[n - 1] = base;
  return out;
}

// Circular quality gauge with centered percentage + label.
function gaugeRing(pct) {
  const r = 74, cx = 90, cy = 90, sw = 15;
  const C = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(100, pct)) / 100 * C;
  return `<svg class="gauge" viewBox="0 0 180 180">
    <defs><linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2563EB"/><stop offset="55%" stop-color="#6366F1"/><stop offset="100%" stop-color="#06B6D4"/>
    </linearGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-subtle)" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#gauge-grad)" stroke-width="${sw}" stroke-linecap="round"
      stroke-dasharray="${dash.toFixed(1)} ${(C - dash).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>
    <text class="gauge-val" x="${cx}" y="${cy - 2}" text-anchor="middle">${pct}%</text>
    <text class="gauge-lbl" x="${cx}" y="${cy + 24}" text-anchor="middle">${qualityLabel(pct)}</text>
  </svg>`;
}

function deltaHtml(cur, prev, suffix = "") {
  const d = (Number(cur) || 0) - (Number(prev) || 0);
  if (d === 0) return `<span class="kpi-delta">o'zgarishsiz</span>`;
  return `<span class="kpi-delta ${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d)}${suffix}</span>`;
}

// ═══════════════════════════════════════════════════════════════
// DOMAIN CONSTANTS
// ═══════════════════════════════════════════════════════════════
const REC_STATUS = {
  queued:               { label: "Navbatda", color: "var(--warning)" },
  downloading:          { label: "Yuklanmoqda", color: "var(--warning)" },
  stored:               { label: "Saqlangan", color: "var(--brand, var(--warning))" },
  transcribing:         { label: "Transkripsiya", color: "var(--warning)" },
  awaiting_assignment:  { label: "Biriktirish kutilmoqda", color: "var(--warning)" },
  analyzing:            { label: "Baholanmoqda", color: "var(--warning)" },
  done:                 { label: "Tayyor", color: "var(--success)" },
  failed:               { label: "Xato", color: "var(--danger)" },
  skipped:              { label: "O'tkazilgan", color: "var(--text-faint)" },
};
const IN_PROGRESS = ["queued", "downloading", "stored", "transcribing", "analyzing"];

// Pedagogik mezon meta (5 mezon, har biri 0-20 ball) — admin-web bilan bir xil.
const CRITERIA_META = [
  { key: "topic",       field: "topic_score",       avg: "avg_topic",       label: "Mavzu mosligi", hint: "Mavzu va terminologiya",    color: "#2563EB" },
  { key: "speech",      field: "speech_score",      avg: "avg_speech",      label: "Nutq tozaligi", hint: "Akademik nutq maqsadliligi", color: "#06B6D4" },
  { key: "method",      field: "method_score",      avg: "avg_method",      label: "Metodika",      hint: "Tuzilma va misollar",        color: "#7C3AED" },
  { key: "interaction", field: "interaction_score", avg: "avg_interaction", label: "Interaktivlik", hint: "Dialog va savollar",         color: "#059669" },
  { key: "feedback",    field: "feedback_score",    avg: "avg_feedback",    label: "Teskari aloqa", hint: "Baholash va feedback",       color: "#D97706" },
];
const CRITERIA_ADVICE = {
  topic: "Mavzuni reja/sillabusga aniq bog'lang va tayanch atamalarni oldindan belgilang.",
  speech: "Darsni mavzudan chetlashtirmang — shaxsiy hikoya va parazit so'zlarni kamaytiring.",
  method: "Darsni aniq bosqichlarga bo'ling (kirish · asosiy qism · xulosa) va hayotiy misollar keltiring.",
  interaction: "Ko'proq ochiq savol bering va talabalarni dialogga jalb qiling — monologdan qoching.",
  feedback: "Talaba javoblariga izohli munosabat bildiring va mustahkamlash savollarini bering.",
};

/** 5 mezon ro'yxati (bar + teg). vals — 5 ta son (0-20), CRITERIA_META tartibida. */
function criteriaListHtml(vals, opts = {}) {
  return `<div class="criteria-list">${CRITERIA_META.map((c, i) => {
    const v = Number(vals[i]) || 0;
    const pct = Math.min(100, Math.max(0, Math.round(v / 20 * 100)));
    const tag = pct >= 80 ? "A'lo" : pct >= 60 ? "Yaxshi" : pct >= 40 ? "O'rta" : "Zaif";
    const tagCls = pct >= 80 ? "success" : pct >= 60 ? "brand" : pct >= 40 ? "warning" : "danger";
    return `
    <div class="crit-row">
      <div class="crit-top">
        <span class="crit-name">${escapeHtml(c.label)}${opts.tags === false ? "" : ` <span class="ai-tag ${tagCls}" style="font-size:10px;padding:1px 6px">${tag}</span>`}</span>
        <span class="crit-val">${opts.decimals ? v.toFixed(1) : v}<span class="crit-max">/20</span></span>
      </div>
      <div class="crit-bar-wrap"><div class="crit-bar" style="width:${pct}%;background:${c.color}"></div></div>
    </div>`;
  }).join("")}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// ROUTER (hash — deep link va F5 ishlaydi)
// ═══════════════════════════════════════════════════════════════
const State = { view: null, id: null };
let liveTimer = null;
let currentAudioUrl = null;
function releaseAudioUrl() {
  if (currentAudioUrl) { URL.revokeObjectURL(currentAudioUrl); currentAudioUrl = null; }
}

function route(view, id) {
  if (view) {
    const target = id != null ? `#/${view}/${id}` : `#/${view}`;
    if (location.hash === target) render(); // hash o'zgarmasa hashchange otmaydi
    else location.hash = target;            // hashchange o'zi render qiladi
    return;
  }
  render();
}
window.addEventListener("hashchange", render);

function render() {
  clearInterval(liveTimer);
  releaseAudioUrl();
  if (!Auth.token) return renderLogin();
  const h = location.hash.replace(/^#\/?/, "") || "dashboard";
  const [page, pid] = h.split("/");
  State.view = page;
  State.id = pid ? +pid : null;
  ensureShell();
  highlightNav(page);
  const views = {
    dashboard: renderDashboard,
    recordings: pid ? () => renderRecordingDetail(+pid) : renderRecordings,
    teachers: pid ? () => renderTeacher(+pid) : renderTeachers,
    subjects: renderSubjects,
    sources: renderSources,
    settings: renderSettings,
  };
  (views[page] || renderDashboard)();
}

// ═══════════════════════════════════════════════════════════════
// LOGIN + BOOTSTRAP
// ═══════════════════════════════════════════════════════════════
function renderLogin() {
  const tpl = document.getElementById("view-login").content.cloneNode(true);
  root.innerHTML = "";
  root.appendChild(tpl);

  const form = document.getElementById("login-form");
  const errBox = document.getElementById("login-error");
  const btn = document.getElementById("login-btn");
  const pw = document.getElementById("pw");
  const pwToggle = document.getElementById("pw-toggle");

  pwToggle.addEventListener("click", () => {
    const showing = pw.type === "password";
    pw.type = showing ? "text" : "password";
    pwToggle.setAttribute("aria-label", showing ? "Parolni yashirish" : "Parolni ko'rsatish");
  });
  document.getElementById("forgot-btn")?.addEventListener("click", () =>
    toast("Parolni tiklash uchun tizim administratoriga murojaat qiling.", "info"));
  document.getElementById("bootstrap-btn")?.addEventListener("click", openBootstrapModal);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.classList.remove("show");
    btn.disabled = true;
    btn.textContent = "Kirilmoqda...";
    try {
      const d = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.email.value.trim(), password: form.password.value }),
      });
      Auth.token = d.access_token;
      Auth.refresh = d.refresh_token;
      Auth.user = d.user;
      route("dashboard");
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add("show");
      btn.disabled = false;
      btn.textContent = "Tizimga kirish";
    }
  });
}

function openBootstrapModal() {
  const { modal, close } = openModal("bootstrap-modal", `
    <div class="modal-card" role="dialog">
      <div class="modal-head">
        <h3>Birinchi administratorni yaratish</h3>
        <button class="modal-close">${I.close}</button>
      </div>
      <form id="bs-form" class="modal-body">
        <p class="muted" style="margin-bottom:12px">Bu amal faqat tizim birinchi marta sozlanayotganda (foydalanuvchilar bo'sh bo'lsa) ishlaydi.</p>
        <label class="field">
          <span class="label">Ism *</span>
          <input type="text" name="name" required maxlength="80" placeholder="Ism Familiya">
        </label>
        <label class="field">
          <span class="label">Email *</span>
          <input type="email" name="email" required placeholder="admin@muassasa.uz">
        </label>
        <label class="field">
          <span class="label">Parol * (kamida 8 belgi)</span>
          <input type="password" name="password" required minlength="8" placeholder="••••••••">
        </label>
        <div class="error" id="bs-err"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="bs-cancel">Bekor qilish</button>
          <button type="submit" class="btn-primary">Yaratish</button>
        </div>
      </form>
    </div>
  `);
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("#bs-cancel").addEventListener("click", close);
  modal.querySelector("#bs-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = modal.querySelector("#bs-err");
    err.classList.remove("show");
    const f = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api("/api/auth/bootstrap", { method: "POST", body: JSON.stringify(f) });
      toast("Administrator yaratildi — endi tizimga kiring", "success");
      close();
    } catch (ex) { err.textContent = ex.message; err.classList.add("show"); }
  });
}

// ═══════════════════════════════════════════════════════════════
// SHELL (sidebar + topbar) — admin-web bilan bir xil bo'limlar
// ═══════════════════════════════════════════════════════════════
const NAV_ITEMS = [
  { section: "Asosiy" },
  { key: "dashboard", label: "Dashboard", icon: I.dash },
  { section: "Audio" },
  { key: "recordings", label: "Yozuvlar", icon: I.mic },
  { key: "sources", label: "Xonalar", icon: I.room },
  { section: "Tuzilma" },
  { key: "subjects", label: "Fanlar", icon: I.subjects },
  { section: "Odamlar" },
  { key: "teachers", label: "O'qituvchilar", icon: I.teachers },
  { section: "Tizim" },
  { key: "settings", label: "Sozlamalar", icon: I.settings },
];

function ensureShell() {
  if (root.querySelector(".shell")) return;
  const tpl = document.getElementById("view-shell").content.cloneNode(true);
  root.innerHTML = "";
  root.appendChild(tpl);

  const u = Auth.user || {};
  document.getElementById("uc-name").textContent = u.name || "Administrator";
  document.getElementById("uc-email").textContent = u.email || "";
  document.getElementById("uc-avatar").textContent = initials(u.name || "A");

  const nav = document.getElementById("sidebar-nav");
  nav.innerHTML = NAV_ITEMS.map(item => {
    if (item.section) return `<div class="side-section-title">${item.section}</div>`;
    return `<button class="side-item" data-route="${item.key}">
      ${item.icon}<span class="side-item-label">${item.label}</span>
    </button>`;
  }).join("");
  nav.querySelectorAll(".side-item[data-route]").forEach(b => {
    b.addEventListener("click", () => route(b.dataset.route));
  });

  const shell = document.getElementById("shell");
  if (Prefs.sidebarCollapsed) shell.classList.add("collapsed");
  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    shell.classList.toggle("collapsed");
    Prefs.sidebarCollapsed = shell.classList.contains("collapsed");
  });
  document.getElementById("theme-toggle").addEventListener("click", () => {
    Prefs.theme = Prefs.theme === "light" ? "dark" : "light";
  });
  document.getElementById("logout-btn").addEventListener("click", () => {
    Auth.clear();
    route("login");
  });
  document.getElementById("user-chip").addEventListener("click", () => route("settings"));
  document.getElementById("user-chip").style.cursor = "pointer";

  // Global qidiruv: o'qituvchilar sahifasida — o'sha ro'yxat; boshqa joyda — yozuvlar.
  document.getElementById("global-search").addEventListener("input", debounce((e) => {
    const q = e.target.value;
    if (State.view === "teachers" && !State.id) {
      TeachersState.q = q; TeachersState.page = 1; renderTeachersBody();
      return;
    }
    RecordingsState.q = q; RecordingsState.page = 1;
    if (State.view === "recordings" && !State.id) renderRecordings();
    else route("recordings");
  }, 300));
}

function highlightNav(view) {
  root.querySelectorAll(".side-item[data-route]").forEach(b => {
    b.classList.toggle("active", b.dataset.route === view);
  });
}

function setBreadcrumbs(items) {
  const el = document.getElementById("breadcrumbs");
  if (!el) return;
  el.innerHTML = items.map((it, i) => {
    const isLast = i === items.length - 1;
    if (it.route && !isLast) {
      return `<button class="crumb link" data-br="${it.route}">${escapeHtml(it.label)}</button><span class="sep">/</span>`;
    }
    return `<span class="crumb ${isLast ? "active" : ""}">${escapeHtml(it.label)}</span>` + (isLast ? "" : `<span class="sep">/</span>`);
  }).join("");
  el.querySelectorAll("[data-br]").forEach(b => b.addEventListener("click", () => route(b.dataset.br)));
}

function setMain(html) { document.getElementById("main-content").innerHTML = html; }

/** "recordings:done" kabi manzil — status filtri bilan yozuvlar sahifasiga o'tish. */
function goRoute(dest) {
  const [view, arg] = String(dest).split(":");
  if (view === "recordings") { RecordingsState.status = arg || ""; RecordingsState.page = 1; RecordingsState.q = ""; }
  route(view);
}
function wireClickable(container, selector = "[data-route]") {
  container.querySelectorAll(selector).forEach((el) => {
    const dest = el.getAttribute("data-route");
    if (!dest) return;
    el.style.cursor = "pointer";
    el.addEventListener("click", () => goRoute(dest));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goRoute(dest); }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
async function renderDashboard() {
  setBreadcrumbs([{ label: "Boshqaruv paneli" }]);
  setMain(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Boshqaruv paneli</h1>
        <div class="page-subtitle">TUIT · Universitet · oxirgi 30 kun</div>
      </div>
      <div class="page-actions">
        <span class="date-chip">${I.cal} ${escapeHtml(fmtToday())}</span>
        <button class="btn-secondary btn-sm" id="dash-refresh">${I.refresh} Yangilash</button>
      </div>
    </div>
    <div id="dash-kpis" class="kpi-grid">
      ${Array.from({ length: 6 }, () => `<div class="kpi"><div class="skel" style="height:104px"></div></div>`).join("")}
    </div>
    <div id="dash-body">${skeletonBlock(320)}</div>
  `);
  document.getElementById("dash-refresh").addEventListener("click", () => renderDashboard());

  try {
    const [st, live] = await Promise.all([
      api("/api/dashboard/stats?days=30"),
      api("/api/dashboard/live"),
    ]);
    renderKPIs(st);
    renderDashBody(st, live);
    // Jonli blok 15 soniyada yangilanadi (faqat sahifa ko'rinib turganda — D1 o'qishlarini tejash uchun).
    liveTimer = setInterval(() => { if (document.visibilityState === "visible") refreshLive(); }, 15000);
  } catch (err) {
    document.getElementById("dash-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
    toast(err.message, "error");
  }
}

function renderKPIs(st) {
  const kpi = document.getElementById("dash-kpis");
  const t = st.totals || {}, s = st.scores || {}, w = st.week || {};
  const engagement = Number(s.avg_overall) || 0;
  const trend = (st.daily || []).map(d => d.avg_score).filter(v => v != null).map(Number);
  let scoreDelta = null;
  if (w.avg_score && (w.avg_score.current || w.avg_score.previous)) {
    scoreDelta = (w.avg_score.current || 0) - (w.avg_score.previous || 0);
  }

  const kpis = [
    { icon: I.trending, color: "green", label: "Umumiy AI baho", value: `${engagement}%`,
      spark: trend.length >= 2 ? trend : sparkSeed(engagement, 4), sparkColor: "var(--success)", delta: scoreDelta, deltaSuffix: "%" },
    { icon: I.mic, color: "blue", label: "Jami yozuvlar", value: t.total ?? 0, route: "recordings",
      spark: (st.daily || []).length >= 2 ? st.daily.map(d => Number(d.count) || 0) : sparkSeed(t.total ?? 0, 11), sparkColor: "var(--brand)" },
    { icon: I.quiz, color: "cyan", label: "Baholangan darslar", value: s.evaluated ?? 0, route: "recordings:done",
      spark: sparkSeed(s.evaluated ?? 0, 23), sparkColor: "var(--cyan)" },
    { icon: I.info, color: "amber", label: "Biriktirish kutilmoqda", value: t.awaiting ?? 0, route: "recordings:awaiting_assignment",
      spark: sparkSeed(t.awaiting ?? 0, 53), sparkColor: "var(--warning)" },
    { icon: I.teachers, color: "violet", label: "O'qituvchilar", value: st.coverage?.total_teachers ?? 0, route: "teachers",
      spark: sparkSeed(st.coverage?.total_teachers ?? 0, 37), sparkColor: "var(--accent)" },
    { icon: I.clock, color: "slate", label: "Jami audio (daqiqa)", value: t.total_minutes ?? 0,
      spark: sparkSeed(t.total_minutes ?? 0, 71), sparkColor: "var(--text-muted)" },
  ];

  kpi.innerHTML = kpis.map((k) => `
    <div class="kpi kpi-spark${k.route ? " kpi-clickable" : ""}"${k.route ? ` data-route="${escapeAttr(k.route)}" tabindex="0" role="button" aria-label="${escapeAttr(k.label)} bo'limiga o'tish"` : ""}>
      <div class="kpi-head">
        <div class="kpi-label">${escapeHtml(k.label)}</div>
        <div class="kpi-icon ${k.color}">${k.icon}</div>
      </div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-foot">
        ${k.delta != null && k.delta !== 0
          ? `<span class="kpi-delta ${k.delta > 0 ? "up" : "down"}">${k.delta > 0 ? "▲" : "▼"} ${Math.abs(k.delta)}${k.deltaSuffix || ""}</span>`
          : `<span class="kpi-delta">${k.delta === 0 ? "o'zgarishsiz" : "so'nggi davr"}</span>`}
        ${sparkLine(k.spark, k.sparkColor)}
      </div>
    </div>
  `).join("");
  wireClickable(kpi, ".kpi-clickable");
}

function renderDashBody(st, live) {
  const body = document.getElementById("dash-body");
  const s = st.scores || {};
  const engagement = Number(s.avg_overall) || 0;
  const evaluated = Number(s.evaluated) || 0;

  const critList = CRITERIA_META.map(m => {
    const value = Number(s[m.avg]) || 0;
    return { ...m, value, pct: Math.round(value / 20 * 100) };
  });
  const sortedCrit = [...critList].sort((a, b) => b.pct - a.pct);
  const strongest = evaluated ? sortedCrit[0] : null;
  const weakest = evaluated ? sortedCrit[sortedCrit.length - 1] : null;

  const dist = st.distribution || { excellent: 0, good: 0, average: 0, weak: 0 };
  const distBars = [
    { label: "A'lo (85+)", count: dist.excellent, color: "var(--success)" },
    { label: "Yaxshi (70-84)", count: dist.good, color: "var(--brand)" },
    { label: "O'rtacha (50-69)", count: dist.average, color: "var(--warning)" },
    { label: "Zaif (<50)", count: dist.weak, color: "var(--danger)" },
  ];
  const distTotal = distBars.reduce((a, b) => a + (Number(b.count) || 0), 0) || 1;

  const alerts = st.alerts || [];
  const recent = st.recent_lessons || [];
  const idleTeachers = st.idle_teachers || [];
  const week = st.week || null;
  const coverage = st.coverage || null;
  const topN = (st.top_teachers || []).slice(0, 5);
  const maxScore = topN[0]?.avg_score || 100;
  const bySource = (st.by_source || []).slice(0, 6);
  const maxSourceCount = bySource[0]?.count || 1;

  const covPct = coverage && coverage.total_teachers
    ? Math.round((coverage.with_lessons / coverage.total_teachers) * 100) : 0;
  const activePct = coverage && coverage.total_teachers
    ? Math.round((coverage.active_7d / coverage.total_teachers) * 100) : 0;

  const weekRows = week ? [
    { label: "Yozilgan darslar", m: week.lessons, suffix: "" },
    { label: "O'rtacha AI baho", m: week.avg_score, suffix: "%", isPct: true },
    { label: "Jami vaqt (daqiqa)", m: week.minutes, suffix: "" },
  ] : [];

  body.innerHTML = `
    <!-- Sifat gauge + AI yordamchi -->
    <div class="dash-grid">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Umumiy dars sifati</div>
            <div class="card-subtitle">${evaluated} ta baholangan dars · 5 pedagogik mezon</div>
          </div>
        </div>
        <div class="card-body">
          <div class="quality-wrap">
            <div class="quality-gauge">${gaugeRing(engagement)}</div>
            ${criteriaListHtml(critList.map(c => c.value), { decimals: true })}
          </div>
        </div>
      </div>

      <div class="card ai-card">
        <div class="card-header">
          <div class="ai-head">
            <span class="ai-badge">AI</span>
            <div>
              <div class="card-title">AI yordamchi</div>
              <div class="card-subtitle">Ma'lumotlarga asoslangan xulosa</div>
            </div>
          </div>
        </div>
        <div class="card-body">
          <div class="ai-metric">
            <div class="ai-metric-lbl">O'rtacha AI baho</div>
            <div class="ai-metric-val">${engagement}% <span class="ai-tag ${scoreColor(engagement)}">${qualityLabel(engagement)}</span></div>
          </div>
          <div class="ai-facts">
            <div class="ai-fact"><span class="dot ok"></span> Eng kuchli: <b>${escapeHtml(strongest?.label || "—")}</b> · ${strongest?.pct || 0}%</div>
            <div class="ai-fact"><span class="dot warn"></span> Zaif tomon: <b>${escapeHtml(weakest?.label || "—")}</b> · ${weakest?.pct || 0}%</div>
            <div class="ai-fact"><span class="dot ok"></span> Bu hafta: <b>${week?.lessons?.current ?? 0} dars</b> yozildi · o'tgan hafta ${week?.lessons?.previous ?? 0}</div>
            ${(st.totals?.awaiting || 0) > 0 ? `<div class="ai-fact"><span class="dot warn"></span> <b>${st.totals.awaiting} yozuv</b> o'qituvchi/fan biriktirishni kutmoqda</div>` : ""}
            ${alerts.length ? `<div class="ai-fact"><span class="dot warn"></span> <b>${alerts.length} o'qituvchi</b> past baho bilan e'tibor talab qiladi</div>` : ""}
          </div>
          <div class="ai-reco">
            <div class="ai-reco-title">${I.trending} Tavsiya</div>
            <p>${escapeHtml(weakest ? CRITERIA_ADVICE[weakest.key] : "Yozuvlarni biriktirib baholashni davom ettiring — tahlil boyiydi.")}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Haftalik dinamika + qamrov + sifat taqsimoti -->
    <div class="dash-grid-3">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Haftalik dinamika</div>
            <div class="card-subtitle">Bu hafta va o'tgan hafta solishtiruvi</div>
          </div>
        </div>
        <div class="card-body">
          <div class="wk-list">
            ${weekRows.map(r => `
              <div class="wk-row">
                <div class="wk-label">${escapeHtml(r.label)}</div>
                <div class="wk-val">${r.m?.current ?? 0}${r.isPct ? "%" : ""}</div>
                ${deltaHtml(r.m?.current, r.m?.previous, r.suffix)}
                <div class="wk-prev">o'tgan: ${r.m?.previous ?? 0}${r.isPct ? "%" : ""}</div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">O'qituvchilar qamrovi</div>
            <div class="card-subtitle">Darslari biriktirilgan o'qituvchilar ulushi</div>
          </div>
        </div>
        <div class="card-body">
          ${coverage ? `
            <div class="cov-list">
              <div class="cov-row">
                <div class="cov-top"><span>Kamida 1 darsi bor</span><b>${coverage.with_lessons} / ${coverage.total_teachers}</b></div>
                <div class="crit-bar-wrap"><div class="crit-bar" style="width:${covPct}%;background:var(--brand)"></div></div>
                <div class="cov-pct">${covPct}%</div>
              </div>
              <div class="cov-row">
                <div class="cov-top"><span>So'nggi 7 kunda faol</span><b>${coverage.active_7d} / ${coverage.total_teachers}</b></div>
                <div class="crit-bar-wrap"><div class="crit-bar" style="width:${activePct}%;background:var(--success)"></div></div>
                <div class="cov-pct">${activePct}%</div>
              </div>
            </div>
            ${covPct < 50 ? `<div class="cov-note">${I.info} O'qituvchilarning katta qismiga hali dars biriktirilmagan — «Biriktirish kutilmoqda» yozuvlarni tekshiring.</div>` : ""}
          ` : `<div class="empty-note">Ma'lumot yo'q</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Sifat taqsimoti</div>
            <div class="card-subtitle">${evaluated} ta baholangan dars</div>
          </div>
        </div>
        <div class="card-body">
          <div class="dist-stacked" style="display:flex;height:26px;border-radius:8px;overflow:hidden;gap:2px;margin-bottom:14px;background:var(--bg-subtle)">
            ${distBars.map(b => {
              const w = Math.round((b.count / distTotal) * 100);
              return w > 0 ? `<div title="${escapeAttr(b.label)}: ${b.count}" style="width:${w}%;background:${b.color};min-width:${w > 3 ? 0 : 4}px"></div>` : "";
            }).join("")}
          </div>
          <div class="dist-list">
            ${distBars.map(b => `
              <div class="dist-row" style="display:flex;align-items:center;justify-content:space-between;padding:5px 0">
                <span class="dist-name" style="display:flex;align-items:center;gap:8px"><span class="sw" style="background:${b.color}"></span>${escapeHtml(b.label)}</span>
                <span style="display:flex;align-items:center;gap:12px">
                  <span style="font-weight:600;min-width:28px;text-align:right">${b.count}</span>
                  <span style="color:var(--text-muted);font-size:12px;min-width:36px;text-align:right">${Math.round((b.count / distTotal) * 100)}%</span>
                </span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>

    <!-- Ogohlantirishlar + jonli jarayon + top o'qituvchilar -->
    <div class="dash-grid-3">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">AI ogohlantirishlar</div>
            <div class="card-subtitle">E'tibor talab qiladi</div>
          </div>
          ${alerts.length ? `<span class="pill danger">${alerts.length}</span>` : ""}
        </div>
        <div class="card-body" style="padding:0">
          ${alerts.length === 0
            ? `<div class="empty-note">${I.ok} Past ballli o'qituvchilar yo'q</div>`
            : alerts.map(a => `
              <div class="alert-row" data-route="teachers/${a.teacher_id}" tabindex="0" role="button">
                <span class="alert-ico ${a.score < 45 ? "danger" : "warning"}">${I.warn}</span>
                <div class="alert-body">
                  <div class="alert-title">${escapeHtml(a.teacher_name)}</div>
                  <div class="alert-sub">O'rtacha baho past · ${a.lessons} dars</div>
                </div>
                <span class="score-chip ${scoreColor(a.score)}">${a.score}%</span>
              </div>
            `).join("")}
          ${idleTeachers.length ? `
            <div class="side-section-title" style="padding:10px 16px 4px">14+ kun dars yozmaganlar</div>
            ${idleTeachers.map(t => `
              <div class="alert-row" data-route="teachers/${t.teacher_id}" tabindex="0" role="button">
                <span class="alert-ico warning">${I.clock}</span>
                <div class="alert-body">
                  <div class="alert-title">${escapeHtml(t.teacher_name)}</div>
                  <div class="alert-sub">Oxirgi dars: ${escapeHtml(fmtDate(t.last_lesson_at))} · jami ${t.lessons} dars</div>
                </div>
              </div>
            `).join("")}` : ""}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Jonli jarayon</div>
            <div class="card-subtitle">Hozir qayta ishlanayotgan yozuvlar</div>
          </div>
          <button class="btn-icon" id="live-refresh" title="Yangilash">${I.refresh}</button>
        </div>
        <div class="card-body" id="live-box" style="padding:0">${liveBoxHtml(live)}</div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Top o'qituvchilar</div>
            <div class="card-subtitle">O'rtacha ball bo'yicha</div>
          </div>
          <button class="btn-ghost btn-sm" data-route="teachers">Hammasi →</button>
        </div>
        <div class="card-body">
          <div class="rank-list">
            ${topN.length === 0 ? `<div class="empty-note">Hali baholangan dars yo'q</div>` : topN.map((t, i) => `
              <div class="rank-item rank-click" data-route="teachers/${t.id}" tabindex="0" role="button">
                <div class="idx">#${i + 1}</div>
                <div class="body">
                  <div class="nm">${escapeHtml(t.full_name)} <span class="rank-meta">· ${t.lessons} dars</span></div>
                  <div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.max(4, (t.avg_score / maxScore * 100))}%"></div></div>
                </div>
                <div class="v">${t.avg_score}%</div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>

    <!-- Xonalar reytingi + so'nggi darslar + AI tavsiyalar -->
    <div class="dash-grid-3">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Xonalar faolligi</div>
            <div class="card-subtitle">Auditoriya mikrofonlari bo'yicha yozuvlar</div>
          </div>
          <button class="btn-ghost btn-sm" data-route="sources">Hammasi →</button>
        </div>
        <div class="card-body">
          <div class="rank-list">
            ${bySource.length === 0 ? `<div class="empty-note">Hali yozuv yo'q — birinchi webhook kelganda chiqadi</div>` : bySource.map((r, i) => `
              <div class="rank-item">
                <div class="idx">#${i + 1}</div>
                <div class="body">
                  <div class="nm">${escapeHtml(r.source)} <span class="rank-meta">· ${r.count} yozuv</span></div>
                  <div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.max(4, (r.count / maxSourceCount * 100))}%"></div></div>
                </div>
                <div class="v">${r.avg_score != null ? r.avg_score + "%" : "—"}</div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">So'nggi darslar</div>
            <div class="card-subtitle">Oxirgi baholangan darslar</div>
          </div>
          <button class="btn-ghost btn-sm" data-route="recordings:done">Hammasi →</button>
        </div>
        <div class="card-body" style="padding:0">
          ${recent.length === 0
            ? `<div class="empty-note">Hozircha baholangan dars yo'q</div>`
            : recent.map(l => `
              <div class="lesson-row" data-route="recordings/${l.id}" tabindex="0" role="button" style="grid-template-columns:36px 1fr auto;cursor:pointer">
                <div class="l-icon">${I.mic}</div>
                <div class="l-main">
                  <div class="l-title">${escapeHtml(l.topic || "Dars")}</div>
                  <div class="l-sub">${escapeHtml(l.teacher_name || "Biriktirilmagan")}${l.subject_name ? " · " + escapeHtml(l.subject_name) : ""}${l.group_name ? " · " + escapeHtml(l.group_name) : ""}</div>
                </div>
                <span class="score-chip ${scoreColor(l.score)}">${l.score}%</span>
              </div>
            `).join("")}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">AI tavsiyalar</div>
            <div class="card-subtitle">Sifatni oshirish uchun</div>
          </div>
        </div>
        <div class="card-body" style="padding:0">
          ${sortedCrit.slice().reverse().slice(0, 4).map(c => `
            <div class="reco-row">
              <span class="reco-ico" style="color:${c.color}">${I.info}</span>
              <div class="reco-body">
                <div class="reco-title">${escapeHtml(c.label)} · ${c.pct}%</div>
                <div class="reco-sub">${escapeHtml(CRITERIA_ADVICE[c.key])}</div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;

  document.getElementById("live-refresh")?.addEventListener("click", refreshLive);
  wireClickable(body, "[data-route]");
}

async function refreshLive() {
  try {
    const lv = await api("/api/dashboard/live");
    const box = document.getElementById("live-box");
    if (box) box.innerHTML = liveBoxHtml(lv);
    else clearInterval(liveTimer);
  } catch {}
}

function liveBoxHtml(lv) {
  const rows = (lv.active || []).map(r => {
    const st = REC_STATUS[r.status] || { label: r.status, color: "var(--text-faint)" };
    return `
    <div class="lesson-row" data-route="recordings/${r.id}" tabindex="0" role="button" style="grid-template-columns:36px 1fr auto;cursor:pointer">
      <div class="l-icon">${I.mic}</div>
      <div class="l-main">
        <div class="l-title">#${r.id} ${escapeHtml(r.source_name || "")}</div>
        <div class="l-sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.last_message || "")}${r.attempts > 1 ? ` · ${r.attempts}-urinish` : ""}</div>
      </div>
      <span class="tag" style="color:${st.color}">${escapeHtml(st.label)}</span>
    </div>`;
  }).join("");
  const html = (rows || `<div class="empty-note">${I.ok} Navbat bo'sh — hozir hech narsa qayta ishlanmayapti</div>`) +
    `<div class="sub" style="padding:10px 16px;border-top:1px solid var(--border)">Oxirgi webhook: ${fmtDateTime(lv.last_webhook_at)}</div>`;
  // Yangilangan blok ichidagi havolalarni qayta ulash uchun setTimeout (innerHTML dan keyin).
  setTimeout(() => { const b = document.getElementById("live-box"); if (b) wireClickable(b); }, 0);
  return html;
}

// ═══════════════════════════════════════════════════════════════
// RECORDINGS — ro'yxat (server pagination + filtrlar)
// ═══════════════════════════════════════════════════════════════
const RecordingsState = { q: "", status: "", page: 1, pageSize: 25 };

async function renderRecordings() {
  setBreadcrumbs([{ label: "Dashboard", route: "dashboard" }, { label: "Yozuvlar" }]);
  setMain(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Audio yozuvlar</h1>
        <div class="page-subtitle">Audiotap mikrofonlaridan kelgan dars yozuvlari</div>
      </div>
      <div class="page-actions">
        <button class="btn-secondary btn-sm" id="rec-refresh">${I.refresh} Yangilash</button>
      </div>
    </div>
    <div id="rec-body">${skeletonBlock(320)}</div>
  `);
  document.getElementById("rec-refresh").addEventListener("click", () => renderRecordings());

  try {
    const p = new URLSearchParams({ page: String(RecordingsState.page), limit: String(RecordingsState.pageSize) });
    if (RecordingsState.status) p.set("status", RecordingsState.status);
    if (RecordingsState.q) p.set("q", RecordingsState.q);
    const d = await api(`/api/recordings?${p}`);
    const items = d.items || [];
    const c = d.counts || {};
    const cnt = (s) => Number(c[s] || 0);
    const inProg = IN_PROGRESS.reduce((a, s) => a + cnt(s), 0);
    const visible = Object.entries(c).filter(([k]) => k !== "skipped").reduce((a, [, n]) => a + Number(n || 0), 0);
    const total = Number(d.total) || 0;
    const totalPages = Math.max(1, Math.ceil(total / RecordingsState.pageSize));
    const page = Math.min(RecordingsState.page, totalPages);

    document.getElementById("rec-body").innerHTML = `
      <div class="kpi-grid">
        <div class="kpi kpi-clickable" data-route="recordings"><div class="kpi-head"><div class="kpi-label">Jami yozuv</div><div class="kpi-icon blue">${I.mic}</div></div><div class="kpi-value">${visible}</div></div>
        <div class="kpi kpi-clickable" data-route="recordings:done"><div class="kpi-head"><div class="kpi-label">Tayyor</div><div class="kpi-icon green">${I.ok}</div></div><div class="kpi-value">${cnt("done")}</div></div>
        <div class="kpi kpi-clickable" data-route="recordings:in_progress"><div class="kpi-head"><div class="kpi-label">Jarayonda</div><div class="kpi-icon amber">${I.clock}</div></div><div class="kpi-value">${inProg}</div></div>
        <div class="kpi kpi-clickable" data-route="recordings:awaiting_assignment"><div class="kpi-head"><div class="kpi-label">Biriktirish kutilmoqda</div><div class="kpi-icon violet">${I.info}</div></div><div class="kpi-value">${cnt("awaiting_assignment")}</div></div>
        <div class="kpi kpi-clickable" data-route="recordings:failed"><div class="kpi-head"><div class="kpi-label">Xato</div><div class="kpi-icon red">${I.warn}</div></div><div class="kpi-value">${cnt("failed")}</div></div>
      </div>

      <div class="filters-bar">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="rec-search" placeholder="Xona, o'qituvchi, fan yoki mavzu..." value="${escapeAttr(RecordingsState.q)}">
        </div>
        <div class="filter-pills">
          <button class="pill ${RecordingsState.status === "" ? "active" : ""}" data-st="">Hammasi (${visible})</button>
          <button class="pill ${RecordingsState.status === "done" ? "active" : ""}" data-st="done">Tayyor (${cnt("done")})</button>
          <button class="pill ${RecordingsState.status === "awaiting_assignment" ? "active" : ""}" data-st="awaiting_assignment">Biriktirish (${cnt("awaiting_assignment")})</button>
          <button class="pill ${RecordingsState.status === "in_progress" ? "active" : ""}" data-st="in_progress">Jarayonda (${inProg})</button>
          <button class="pill ${RecordingsState.status === "failed" ? "active" : ""}" data-st="failed">Xato (${cnt("failed")})</button>
          ${cnt("skipped") ? `<button class="pill ${RecordingsState.status === "skipped" ? "active" : ""}" data-st="skipped">O'tkazilgan (${cnt("skipped")})</button>` : ""}
        </div>
        <div class="spacer"></div>
      </div>

      ${items.length === 0 ? emptyStateHtml(
        "Yozuvlar topilmadi",
        RecordingsState.q || RecordingsState.status
          ? "Filtrlarni o'zgartirib ko'ring."
          : "Audiotap webhook'i sozlanganini va yozuv olinganini tekshiring (Sozlamalar bo'limi)."
      ) : `
        <div class="card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Xona</th>
                  <th>O'qituvchi</th>
                  <th>Fan · Mavzu</th>
                  <th class="num">Davomiylik</th>
                  <th class="num">Ball</th>
                  <th>Status</th>
                  <th>Vaqt</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(r => {
                  const st = REC_STATUS[r.status] || { label: r.status || "—", color: "var(--text-faint)" };
                  return `
                  <tr data-open="${r.id}">
                    <td><div style="display:flex;align-items:center;gap:8px">
                      <div class="l-icon" style="width:28px;height:28px">${I.mic}</div>
                      <div><strong>${escapeHtml(r.source_display || r.source_name || "—")}</strong>
                        ${r.completeness === "partial" ? `<div class="sub" style="color:var(--warning)">Qismiy yozuv</div>` : ""}</div>
                    </div></td>
                    <td>${r.teacher_name ? escapeHtml(r.teacher_name) : '<span class="sub">Biriktirilmagan</span>'}</td>
                    <td>${r.subject_name ? `<span class="tag">${escapeHtml(r.subject_name)}</span> ` : ""}${escapeHtml(r.topic || "—")}</td>
                    <td class="num">${fmtDuration(r.duration_seconds)}</td>
                    <td class="num">${r.overall_score != null ? `<span class="score-chip ${scoreColor(r.overall_score)}">${r.overall_score}%</span>` : "—"}</td>
                    <td><span class="tag" style="color:${st.color}">${escapeHtml(st.label)}</span>${
                        r.error ? `<div class="sub" style="color:var(--danger);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeAttr(r.error)}">${escapeHtml(r.error)}</div>` : ""
                      }</td>
                    <td><span style="color:var(--text-subtle);font-size:12.5px">${fmtDateTime(r.started_at || r.created_at)}</span></td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
        ${total > RecordingsState.pageSize ? paginationHtml(page, totalPages, total, RecordingsState.pageSize) : ""}
      `}
    `;

    const body = document.getElementById("rec-body");
    document.getElementById("rec-search").addEventListener("input",
      debounce((e) => { RecordingsState.q = e.target.value; RecordingsState.page = 1; renderRecordings(); }, 250));
    body.querySelectorAll(".pill[data-st]").forEach(b => {
      b.addEventListener("click", () => { RecordingsState.status = b.dataset.st; RecordingsState.page = 1; renderRecordings(); });
    });
    wireClickable(body, ".kpi-clickable");
    body.querySelectorAll("tr[data-open]").forEach(tr => {
      const go = () => route("recordings", tr.dataset.open);
      tr.style.cursor = "pointer";
      tr.addEventListener("click", go);
      makeRowAccessible(tr, go, "Yozuvni ochish");
    });
    body.querySelectorAll(".pagination [data-page]").forEach(b =>
      b.addEventListener("click", () => { RecordingsState.page = parseInt(b.dataset.page); renderRecordings(); }));
  } catch (err) {
    document.getElementById("rec-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// RECORDING DETAIL
// ═══════════════════════════════════════════════════════════════
async function renderRecordingDetail(id) {
  setBreadcrumbs([
    { label: "Dashboard", route: "dashboard" },
    { label: "Yozuvlar", route: "recordings" },
    { label: `#${id}` },
  ]);
  setMain(skeletonBlock(120) + skeletonBlock(300));

  let d;
  try { d = await api(`/api/recordings/${id}`); }
  catch (err) { setMain(`<div class="error show">${escapeHtml(err.message)}</div>`); return; }

  const r = d.recording, an = d.analysis, tr = d.transcript;
  const st = REC_STATUS[r.status] || { label: r.status, color: "var(--text-faint)" };
  const roomName = r.source_display || r.source_name || "Yozuv";

  setMain(`
    <section class="detail-header">
      <div class="detail-avatar"${avatarStyle(roomName)}>${I.mic}</div>
      <div class="detail-info">
        <div class="name">${escapeHtml(r.topic || `Yozuv #${r.id}`)}</div>
        <div class="course">${escapeHtml(roomName)}${r.subject_name ? " · " + escapeHtml(r.subject_name) : ""}${r.group_name ? " · " + escapeHtml(r.group_name) : ""}</div>
        <div class="email">${escapeHtml(r.teacher_name || "O'qituvchi biriktirilmagan")}</div>
        <div class="detail-pills">
          <span class="detail-pill" style="color:${st.color}">${escapeHtml(st.label)}</span>
          <span class="detail-pill">${I.clock} ${fmtDuration(r.duration_seconds)}</span>
          <span class="detail-pill">${I.cal} ${fmtDateTime(r.started_at || r.created_at)}</span>
          ${an ? `<span class="detail-pill">${I.trophy} ${an.overall_score}%</span>` : ""}
        </div>
      </div>
      <div class="detail-actions">
        <button class="btn-primary btn-sm" id="d-assign">${I.edit} ${r.teacher_id ? "Biriktirishni o'zgartirish" : "Biriktirish"}</button>
        ${r.r2_key ? `<button class="btn-secondary btn-sm" id="d-play">${I.play} Tinglash</button>
        <button class="btn-secondary btn-sm" id="d-dl">${I.download} Yuklab olish</button>` : ""}
        <button class="btn-secondary btn-sm" id="d-reproc">${I.refresh} ${tr ? "Qayta baholash" : r.r2_key ? "Qayta transkripsiya" : "Qayta yuklab olish"}</button>
        ${tr && r.r2_key ? `<button class="btn-ghost btn-sm" id="d-retranscribe">${I.refresh} Qayta transkripsiya</button>` : ""}
        <button class="btn-ghost btn-sm" id="d-del" style="color:var(--danger)">${I.trash} O'chirish</button>
      </div>
    </section>

    ${r.error ? `<div class="error show" style="margin-bottom:14px">${escapeHtml(r.error)}</div>` : ""}
    ${r.status === "awaiting_assignment" ? `<div class="cov-note" style="margin-bottom:14px">${I.info} Transkript tayyor. O'qituvchi, fan va mavzuni biriktiring — AI baholash avtomatik boshlanadi.</div>` : ""}
    <div id="d-player" style="display:none;margin-bottom:14px"></div>

    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-head"><div class="kpi-label">AI baho</div><div class="kpi-icon green">${I.trending}</div></div><div class="kpi-value">${an ? an.overall_score + "%" : "—"}</div></div>
      <div class="kpi"><div class="kpi-head"><div class="kpi-label">Davomiylik</div><div class="kpi-icon blue">${I.clock}</div></div><div class="kpi-value">${fmtMinutes(r.duration_seconds)} <span style="font-size:14px;color:var(--text-subtle);font-weight:500">daq</span></div></div>
      <div class="kpi"><div class="kpi-head"><div class="kpi-label">Transkript</div><div class="kpi-icon violet">${I.book}</div></div><div class="kpi-value">${tr ? tr.word_count : 0} <span style="font-size:14px;color:var(--text-subtle);font-weight:500">so'z</span></div></div>
      <div class="kpi"><div class="kpi-head"><div class="kpi-label">Audio fayl</div><div class="kpi-icon slate">${I.mic}</div></div><div class="kpi-value" style="font-size:20px">${fmtSize(r.size_bytes)}</div></div>
    </div>

    <div class="dash-grid">
      <div class="card">
        <div class="card-header"><div><div class="card-title">Dars ma'lumotlari</div><div class="card-subtitle">Audiotap va biriktirish</div></div></div>
        <div class="card-body">
          ${[
            ["O'qituvchi", r.teacher_name || "Biriktirilmagan"],
            ["Fan", r.subject_name || "—"],
            ["Mavzu", r.topic || "—"],
            ["Guruh", r.group_name || "—"],
            ["Xona", roomName],
            ["Boshlangan", fmtDateTime(r.started_at)],
            ["Tugagan", fmtDateTime(r.finalized_at)],
            ["To'liqlik", r.completeness === "complete" ? "To'liq" : r.completeness === "partial" ? `Qismiy (uzilish: ${Math.round(r.gap_seconds_total || 0)}s)` : "—"],
            ["Format", `${r.codec || "—"} / ${r.container || "—"} · ${r.profile || ""}`],
            ["Audiotap ID", r.recording_id || "—"],
          ].map(([k, v]) => `
            <div style="display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-bottom:1px solid var(--border)">
              <span class="sub">${escapeHtml(k)}</span><strong style="text-align:right">${escapeHtml(String(v))}</strong>
            </div>`).join("")}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">AI baho</div>
            <div class="card-subtitle">5 pedagogik mezon bo'yicha${an?.model ? " · " + escapeHtml(an.model) : ""}</div>
          </div>
          ${an ? `<span class="score-chip ${scoreColor(an.overall_score)}" style="font-size:18px;padding:6px 14px">${an.overall_score}<span style="font-size:12px;opacity:.7">/100</span></span>` : ""}
        </div>
        <div class="card-body">
          ${an ? `
            ${criteriaListHtml(CRITERIA_META.map(c => an[c.field]))}
            ${an.summary ? `<p style="margin-top:14px;font-size:13px;line-height:1.65">${escapeHtml(an.summary)}</p>` : ""}
          ` : emptyStateHtml(
            r.status === "awaiting_assignment" ? "Biriktirish kutilmoqda" : "Baho hali tayyor emas",
            r.status === "awaiting_assignment"
              ? "O'qituvchi, fan va mavzu biriktirilgach AI avtomatik baholaydi."
              : "Qayta ishlash tugagach natija shu yerda chiqadi."
          )}
        </div>
      </div>
    </div>

    ${an && ((an.strengths || []).length || (an.improvements || []).length) ? `
    <div class="dash-grid">
      <div class="card">
        <div class="card-header"><div><div class="card-title" style="color:var(--success)">Kuchli tomonlar</div></div></div>
        <div class="card-body"><ul style="padding-left:18px;font-size:13px;line-height:1.8">
          ${(an.strengths || []).map(x => `<li>${escapeHtml(x)}</li>`).join("") || "<li>—</li>"}
        </ul></div>
      </div>
      <div class="card">
        <div class="card-header"><div><div class="card-title" style="color:var(--warning)">Yaxshilash kerak</div></div></div>
        <div class="card-body"><ul style="padding-left:18px;font-size:13px;line-height:1.8">
          ${(an.improvements || []).map(x => `<li>${escapeHtml(x)}</li>`).join("") || "<li>—</li>"}
        </ul></div>
      </div>
    </div>` : ""}

    ${an && (an.advice || []).length ? `
    <div class="card ai-card" style="margin-bottom:18px">
      <div class="card-header">
        <div class="ai-head">
          <span class="ai-badge">AI</span>
          <div><div class="card-title">Metodik tavsiyalar</div><div class="card-subtitle">${an.advice.length} ta tavsiya</div></div>
        </div>
      </div>
      <div class="card-body" style="padding:0">
        ${an.advice.map((x, i) => `
          <div class="reco-row">
            <span class="reco-ico" style="color:${CRITERIA_META[i % CRITERIA_META.length].color}">${I.info}</span>
            <div class="reco-body"><div class="reco-sub" style="color:var(--text)">${escapeHtml(x)}</div></div>
          </div>`).join("")}
      </div>
    </div>` : ""}

    ${tr ? `
    <div class="card" style="margin-bottom:18px">
      <div class="card-header">
        <div>
          <div class="card-title">Transkript</div>
          <div class="card-subtitle">${tr.word_count} so'z · ${tr.char_count} belgi${tr.model ? " · " + escapeHtml(tr.model) : ""}</div>
        </div>
        <button class="btn-secondary btn-sm" id="tr-toggle">${I.eye} Ko'rsatish</button>
      </div>
      <div class="card-body" id="tr-body" style="display:none">
        <div style="white-space:pre-wrap;font-size:13px;line-height:1.7;max-height:480px;overflow-y:auto">${escapeHtml(tr.text)}</div>
      </div>
    </div>` : ""}

    <div class="card">
      <div class="card-header"><div><div class="card-title">Jarayon jurnali</div><div class="card-subtitle">Yuklab olish → transkripsiya → baholash</div></div></div>
      <div class="card-body" style="padding:0">
        ${(d.events || []).length ? `
        <div class="table-wrap"><table class="data-table">
          <tbody>${d.events.map(e => `
            <tr>
              <td style="white-space:nowrap;color:var(--text-subtle);font-size:12.5px">${fmtDateTime(e.created_at)}</td>
              <td><span class="tag">${escapeHtml(e.stage)}</span></td>
              <td>${e.status === "error"
                ? `<span class="tag" style="color:var(--danger)">xato</span>`
                : e.status === "ok"
                  ? `<span class="tag" style="color:var(--success)">ok</span>`
                  : `<span class="tag">${escapeHtml(e.status)}</span>`}</td>
              <td class="sub">${escapeHtml(e.message || "")}${e.duration_ms ? ` · ${(e.duration_ms / 1000).toFixed(1)}s` : ""}</td>
            </tr>`).join("")}
          </tbody>
        </table></div>` : emptyStateHtml("Jurnal bo'sh", "")}
      </div>
    </div>
  `);

  document.getElementById("d-assign").addEventListener("click", () =>
    openAssignModal(r, () => renderRecordingDetail(id)));

  const reprocess = async (from) => {
    try {
      await api(`/api/recordings/${id}/reprocess?from=${from}`, { method: "POST" });
      toast(from === "analyze" ? "Qayta baholash boshlandi" : from === "transcribe" ? "Qayta transkripsiya boshlandi" : "Qayta yuklab olish boshlandi", "success");
      setTimeout(() => renderRecordingDetail(id), 900);
    } catch (e) { toast(e.message, "error"); }
  };
  document.getElementById("d-reproc").addEventListener("click", () =>
    reprocess(tr ? "analyze" : r.r2_key ? "transcribe" : "download"));
  document.getElementById("d-retranscribe")?.addEventListener("click", () => reprocess("transcribe"));

  document.getElementById("d-del").addEventListener("click", () =>
    confirmDelete("Yozuvni o'chirish", `#${id} yozuv, transkript, baho va audio butunlay o'chiriladi.`, async () => {
      await api(`/api/recordings/${id}`, { method: "DELETE" });
      toast("O'chirildi", "success");
      route("recordings");
    }));

  const trToggle = document.getElementById("tr-toggle");
  if (trToggle) trToggle.addEventListener("click", () => {
    const body = document.getElementById("tr-body");
    const open = body.style.display === "none";
    body.style.display = open ? "" : "none";
    trToggle.innerHTML = open ? `${I.eye} Yashirish` : `${I.eye} Ko'rsatish`;
  });

  const playBtn = document.getElementById("d-play");
  if (playBtn) playBtn.addEventListener("click", () => playAudio(id, r, playBtn));
  const dlBtn = document.getElementById("d-dl");
  if (dlBtn) dlBtn.addEventListener("click", () => downloadAudio(id, r, dlBtn));
}

/** Audio R2 dan admin token bilan olinadi — <audio src> to'g'ridan ishlamaydi, blob qilamiz. */
async function fetchAudioBlob(id) {
  const res = await fetch(`${API}/api/recordings/${id}/audio`, {
    headers: { Authorization: `Bearer ${Auth.token}` },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.blob();
}

async function playAudio(id, row, btn) {
  const old = btn.innerHTML;
  btn.disabled = true; btn.textContent = "Yuklanmoqda…";
  try {
    const blob = await fetchAudioBlob(id);
    releaseAudioUrl();
    currentAudioUrl = URL.createObjectURL(blob);
    const box = document.getElementById("d-player");
    box.style.display = "";
    box.innerHTML = `
      <div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div class="l-icon">${I.mic}</div>
        <div style="min-width:180px">
          <strong>${escapeHtml(row?.source_display || row?.source_name || "Yozuv")}</strong>
          <div class="sub">${fmtDuration(row?.duration_seconds)} · ${fmtSize(row?.size_bytes)}</div>
        </div>
        <audio controls autoplay style="flex:1;min-width:260px" src="${currentAudioUrl}"></audio>
      </div>`;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) { toast(err.message, "error"); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}

async function downloadAudio(id, row, btn) {
  btn.disabled = true;
  try {
    const blob = await fetchAudioBlob(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${row?.source_name || "yozuv"}_${id}.${row?.container || "ogg"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) { toast(err.message, "error"); }
  finally { btn.disabled = false; }
}

// ═══════════════════════════════════════════════════════════════
// ASSIGN MODAL
// ═══════════════════════════════════════════════════════════════
async function openAssignModal(r, onDone) {
  let teachers = [], subjects = [];
  try {
    [teachers, subjects] = await Promise.all([
      api("/api/teachers").then(d => d.items || []),
      api("/api/subjects").then(d => d.items || []),
    ]);
  } catch (e) { toast(e.message, "error"); return; }
  const activeT = teachers.filter(t => t.active || t.id === r.teacher_id);
  const activeS = subjects.filter(s => s.active || s.id === r.subject_id);
  if (!activeT.length) { toast("Avval O'qituvchilar bo'limida o'qituvchi qo'shing", "error"); return; }
  if (!activeS.length) { toast("Avval Fanlar bo'limida fan qo'shing", "error"); return; }

  const { modal, close } = openModal("assign-modal", `
    <div class="modal-card" role="dialog">
      <div class="modal-head">
        <h3>Darsni biriktirish</h3>
        <button class="modal-close">${I.close}</button>
      </div>
      <form id="as-form" class="modal-body">
        <label class="field">
          <span class="label">O'qituvchi *</span>
          <select name="teacher_id" required>
            <option value="">— tanlang —</option>
            ${activeT.map(t =>
              `<option value="${t.id}" ${t.id === r.teacher_id ? "selected" : ""}>${escapeHtml(t.full_name)}${t.department ? ` — ${escapeHtml(t.department)}` : ""}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Fan *</span>
          <select name="subject_id" required>
            <option value="">— tanlang —</option>
            ${activeS.map(s =>
              `<option value="${s.id}" ${s.id === r.subject_id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Dars mavzusi *</span>
          <input type="text" name="topic" required maxlength="200" value="${escapeAttr(r.topic || "")}" placeholder="Masalan: Algoritmlar nazariyasi. Saralash usullari">
        </label>
        <label class="field">
          <span class="label">Guruh (ixtiyoriy)</span>
          <input type="text" name="group_name" maxlength="60" value="${escapeAttr(r.group_name || "")}" placeholder="Masalan: 210-21">
        </label>
        <div class="error" id="as-err"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="as-cancel">Bekor qilish</button>
          <button type="submit" class="btn-primary">${I.ok} Saqlash</button>
        </div>
      </form>
    </div>
  `);
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("#as-cancel").addEventListener("click", close);
  modal.querySelector("#as-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = modal.querySelector("#as-err");
    err.classList.remove("show");
    const f = Object.fromEntries(new FormData(e.target).entries());
    try {
      const res = await api(`/api/recordings/${r.id}/assign`, { method: "POST", body: JSON.stringify(f) });
      toast(res.queued === "analyze" ? "Biriktirildi — AI baholash boshlandi" : "Biriktirildi", "success");
      close();
      onDone && onDone();
    } catch (ex) { err.textContent = ex.message; err.classList.add("show"); }
  });
}

// ═══════════════════════════════════════════════════════════════
// TEACHERS — ro'yxat (filtr, jadval/karta, pagination)
// ═══════════════════════════════════════════════════════════════
const TeachersState = { data: [], q: "", dept: "", sort: "score", view: "table", page: 1, pageSize: 10 };

async function renderTeachers() {
  setBreadcrumbs([{ label: "Dashboard", route: "dashboard" }, { label: "O'qituvchilar" }]);
  setMain(`
    <div class="page-header">
      <div>
        <h1 class="page-title">O'qituvchilar</h1>
        <div class="page-subtitle">Barcha o'qituvchilar va ularning natijalari</div>
      </div>
      <div class="page-actions">
        <button class="btn-secondary btn-sm" id="t-refresh">${I.refresh} Yangilash</button>
        <button class="btn-primary btn-sm" id="add-teacher-btn">${I.add} Yangi o'qituvchi</button>
      </div>
    </div>
    <div id="t-body">${skeletonBlock(400)}</div>
  `);
  document.getElementById("add-teacher-btn").addEventListener("click", () => openTeacherModal(null, renderTeachers));
  document.getElementById("t-refresh").addEventListener("click", () => renderTeachers());

  try {
    const d = await api("/api/teachers");
    TeachersState.data = d.items || [];
    renderTeachersBody();
  } catch (err) {
    document.getElementById("t-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
  }
}

function renderTeachersBody() {
  const body = document.getElementById("t-body");
  if (!body) return;
  const { data, q, dept, sort, view, page, pageSize } = TeachersState;

  const depts = [...new Set(data.map(t => t.department).filter(Boolean))].sort();

  let filtered = data.filter(t => {
    if (q && !`${t.full_name} ${t.email || ""} ${t.department || ""} ${t.position || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (dept && t.department !== dept) return false;
    return true;
  });
  filtered.sort((a, b) => {
    // Darsi bor o'qituvchilar doim ro'yxat boshida turadi
    const aHas = (a.lesson_count || 0) > 0 ? 1 : 0;
    const bHas = (b.lesson_count || 0) > 0 ? 1 : 0;
    if (sort !== "name" && aHas !== bHas) return bHas - aHas;
    if (sort === "score") return (b.avg_score || 0) - (a.avg_score || 0);
    if (sort === "lessons") return (b.lesson_count || 0) - (a.lesson_count || 0);
    if (sort === "duration") return (b.total_minutes || 0) - (a.total_minutes || 0);
    if (sort === "name") return a.full_name.localeCompare(b.full_name);
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const topScore = data.reduce((m, t) => Math.max(m, t.avg_score || 0), 0);

  body.innerHTML = `
    <div class="filters-bar">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="flt-search" placeholder="Ism, email yoki kafedra..." value="${escapeAttr(q)}">
      </div>
      <select id="flt-dept">
        <option value="">Barcha kafedralar</option>
        ${depts.map(g => `<option value="${escapeAttr(g)}" ${g === dept ? "selected" : ""}>${escapeHtml(g)}</option>`).join("")}
      </select>
      <select id="flt-sort">
        <option value="score" ${sort === "score" ? "selected" : ""}>Ball bo'yicha</option>
        <option value="lessons" ${sort === "lessons" ? "selected" : ""}>Darslar soni</option>
        <option value="duration" ${sort === "duration" ? "selected" : ""}>Vaqt</option>
        <option value="name" ${sort === "name" ? "selected" : ""}>Ism</option>
      </select>
      <div class="spacer"></div>
      <div class="view-toggle">
        <button id="view-table" class="${view === "table" ? "active" : ""}">${I.tableView} Jadval</button>
        <button id="view-card" class="${view === "card" ? "active" : ""}">${I.gridView} Karta</button>
      </div>
    </div>

    <div id="t-content">
      ${filtered.length === 0
        ? emptyStateHtml("O'qituvchilar topilmadi", data.length ? "Filterlarni o'zgartiring." : "Yuqoridagi «Yangi o'qituvchi» tugmasi bilan birinchisini qo'shing.")
        : view === "table" ? teachersTableHtml(pageData, topScore) : teachersCardHtml(pageData, topScore, (currentPage - 1) * pageSize)}
    </div>
    ${filtered.length > pageSize ? paginationHtml(currentPage, totalPages, filtered.length, pageSize) : ""}
  `;

  document.getElementById("flt-search").addEventListener("input", debounce((e) => { TeachersState.q = e.target.value; TeachersState.page = 1; renderTeachersBody(); }, 150));
  document.getElementById("flt-dept").addEventListener("change", (e) => { TeachersState.dept = e.target.value; TeachersState.page = 1; renderTeachersBody(); });
  document.getElementById("flt-sort").addEventListener("change", (e) => { TeachersState.sort = e.target.value; renderTeachersBody(); });
  document.getElementById("view-table").addEventListener("click", () => { TeachersState.view = "table"; renderTeachersBody(); });
  document.getElementById("view-card").addEventListener("click", () => { TeachersState.view = "card"; renderTeachersBody(); });

  body.querySelectorAll(".pagination [data-page]").forEach(b => b.addEventListener("click", () => { TeachersState.page = parseInt(b.dataset.page); renderTeachersBody(); }));
  body.querySelectorAll("[data-tid]").forEach(el => {
    const go = (e) => {
      if (e.target.closest(".btn-icon")) return;
      route("teachers", el.dataset.tid);
    };
    el.addEventListener("click", go);
    if (el.tagName === "TR") makeRowAccessible(el, go, "O'qituvchi profilini ochish");
  });
  body.querySelectorAll(".t-edit").forEach(b => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = data.find(x => x.id === parseInt(b.dataset.id));
      if (t) openTeacherModal(t, renderTeachers);
    });
  });
  body.querySelectorAll(".t-del").forEach(b => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = data.find(x => x.id === parseInt(b.dataset.id));
      if (t) deleteTeacherConfirm(t, renderTeachers);
    });
  });
}

function teachersTableHtml(list, topScore) {
  return `
    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>O'qituvchi</th>
              <th>Kafedra</th>
              <th>Lavozim</th>
              <th class="num">Darslar</th>
              <th class="num">Vaqt (daq)</th>
              <th>Oxirgi dars</th>
              <th class="num">O'rtacha ball</th>
              <th class="num">Amallar</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(t => {
              const score = t.avg_score;
              const isTop = score != null && score === topScore && topScore > 0;
              return `
                <tr data-tid="${t.id}" style="cursor:pointer">
                  <td><div class="cell-person">
                    <div class="avatar"${avatarStyle(t.full_name)}>${escapeHtml(initials(t.full_name))}</div>
                    <div class="p-info">
                      <div class="p-name">${escapeHtml(t.full_name)} ${isTop ? '<span style="color:#F59E0B">★</span>' : ""}${t.active ? "" : ' <span class="tag muted">nofaol</span>'}</div>
                      <div class="p-email">${escapeHtml(t.email || t.phone || "")}</div>
                    </div>
                  </div></td>
                  <td>${t.department ? `<span class="tag">${escapeHtml(t.department)}</span>` : '<span class="tag muted">—</span>'}</td>
                  <td>${escapeHtml(t.position || "—")}</td>
                  <td class="num">${t.lesson_count || 0}</td>
                  <td class="num">${t.total_minutes || 0}</td>
                  <td><span style="color:var(--text-subtle);font-size:12.5px">${fmtDate(t.last_lesson_at)}</span></td>
                  <td class="num">${score != null ? `<span class="score-chip ${scoreColor(score)}">${score}%</span>` : '<span class="score-chip muted">—</span>'}</td>
                  <td class="num">
                    <button class="btn-icon t-edit" data-id="${t.id}" title="Tahrirlash">${I.edit}</button>
                    <button class="btn-icon t-del" data-id="${t.id}" style="color:var(--danger)" title="O'chirish">${I.trash}</button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function teachersCardHtml(list, topScore, offset = 0) {
  return `
    <div class="card-grid">
      ${list.map((t, i) => {
        const score = t.avg_score;
        const rank = offset + i;
        const isTop = score != null && score === topScore && topScore > 0;
        return `
          <div style="position:relative">
            <button class="person-card" data-tid="${t.id}">
              <div class="pc-top">
                <div class="pc-avatar"${avatarStyle(t.full_name)}>${escapeHtml(initials(t.full_name))}</div>
                <div class="pc-info"><div class="pc-name">${escapeHtml(t.full_name)}</div><div class="pc-meta">${escapeHtml(t.department || t.position || "O'qituvchi")}</div></div>
                <div class="pc-rank ${rank < 3 ? "r" + (rank + 1) : ""}">${isTop ? "★ " : ""}#${rank + 1}</div>
              </div>
              <div class="pc-tags">
                ${t.position ? `<span class="tag">${escapeHtml(t.position)}</span>` : ""}
                ${t.active ? "" : `<span class="tag muted">nofaol</span>`}
                ${!t.position && t.active ? `<span class="tag muted">lavozim yo'q</span>` : ""}
              </div>
              <div class="pc-stats">
                <div class="pc-stat"><div class="v">${t.lesson_count || 0}</div><div class="l">Darslar</div></div>
                <div class="pc-stat"><div class="v ${score != null ? scoreColor(score) : "muted"}">${score != null ? score + "%" : "—"}</div><div class="l">O'rtacha ball</div></div>
              </div>
            </button>
            <button class="btn-icon t-del" data-id="${t.id}" title="O'chirish"
              style="position:absolute;top:10px;right:44px;color:var(--danger);background:var(--bg-elev,#fff);border-radius:6px">${I.trash}</button>
          </div>`;
      }).join("")}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// TEACHER DETAIL
// ═══════════════════════════════════════════════════════════════
async function renderTeacher(id) {
  setBreadcrumbs([
    { label: "Dashboard", route: "dashboard" },
    { label: "O'qituvchilar", route: "teachers" },
    { label: "Detail" },
  ]);
  setMain(`<div id="t-detail">${skeletonBlock(300)}</div>`);
  const body = document.getElementById("t-detail");
  try {
    const d = await api(`/api/teachers/${id}`);
    const t = d.teacher, st = d.stats || {}, recs = d.recordings || [];
    setBreadcrumbs([
      { label: "Dashboard", route: "dashboard" },
      { label: "O'qituvchilar", route: "teachers" },
      { label: t.full_name },
    ]);
    const evaluated = Number(st.evaluated) || 0;
    const avg = st.avg_score != null ? Number(st.avg_score) : null;

    body.innerHTML = `
      <section class="detail-header">
        <div class="detail-avatar"${avatarStyle(t.full_name)}>${escapeHtml(initials(t.full_name))}</div>
        <div class="detail-info">
          <div class="name">${escapeHtml(t.full_name)}${t.active ? "" : ' <span class="tag muted">nofaol</span>'}</div>
          <div class="course">${escapeHtml([t.department, t.position].filter(Boolean).join(" · ") || "O'qituvchi")}</div>
          <div class="email">${escapeHtml([t.email, t.phone].filter(Boolean).join(" · "))}</div>
          <div class="detail-pills">
            <span class="detail-pill">${I.trophy} O'rtacha ${avg != null ? avg + "%" : "—"}</span>
            <span class="detail-pill">${I.mic} ${st.lessons || 0} dars</span>
            <span class="detail-pill">${I.clock} ${st.total_minutes || 0} daqiqa</span>
            <span class="detail-pill">${I.cal} Oxirgi: ${fmtDate(st.last_lesson_at)}</span>
          </div>
        </div>
        <div class="detail-actions">
          <button class="btn-secondary btn-sm" id="edit-teacher-btn">${I.edit} Tahrirlash</button>
          <button class="btn-ghost btn-sm" id="delete-teacher-btn" style="color:var(--danger)">${I.trash} O'chirish</button>
        </div>
      </section>

      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">O'rtacha ball</div><div class="kpi-icon green">${I.trending}</div></div><div class="kpi-value">${avg != null ? avg + "%" : "—"}</div></div>
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">Jami darslar</div><div class="kpi-icon blue">${I.mic}</div></div><div class="kpi-value">${st.lessons || 0}</div></div>
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">Baholangan</div><div class="kpi-icon violet">${I.quiz}</div></div><div class="kpi-value">${evaluated}</div></div>
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">Jami vaqt</div><div class="kpi-icon amber">${I.clock}</div></div><div class="kpi-value">${st.total_minutes || 0} <span style="font-size:14px;color:var(--text-subtle);font-weight:500">daq</span></div></div>
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card-header">
            <div><div class="card-title">Mezonlar bo'yicha</div><div class="card-subtitle">${evaluated} ta baholangan dars o'rtachasi</div></div>
          </div>
          <div class="card-body">
            ${evaluated
              ? `<div class="quality-wrap"><div class="quality-gauge">${gaugeRing(avg || 0)}</div>${criteriaListHtml(CRITERIA_META.map(c => st[c.avg]), { decimals: true })}</div>`
              : emptyStateHtml("Hali baholangan dars yo'q", "Yozuvlar biriktirilib baholangach bu yerda mezonlar chiqadi.")}
          </div>
        </div>
        <div class="card ai-card">
          <div class="card-header">
            <div class="ai-head">
              <span class="ai-badge">AI</span>
              <div><div class="card-title">AI xulosa</div><div class="card-subtitle">O'qituvchi bo'yicha</div></div>
            </div>
          </div>
          <div class="card-body">
            ${evaluated ? (() => {
              const list = CRITERIA_META.map(c => ({ ...c, pct: Math.round((Number(st[c.avg]) || 0) / 20 * 100) })).sort((a, b) => b.pct - a.pct);
              const strong = list[0], weak = list[list.length - 1];
              return `
                <div class="ai-metric">
                  <div class="ai-metric-lbl">O'rtacha AI baho</div>
                  <div class="ai-metric-val">${avg || 0}% <span class="ai-tag ${scoreColor(avg || 0)}">${qualityLabel(avg || 0)}</span></div>
                </div>
                <div class="ai-facts">
                  <div class="ai-fact"><span class="dot ok"></span> Eng kuchli: <b>${escapeHtml(strong.label)}</b> · ${strong.pct}%</div>
                  <div class="ai-fact"><span class="dot warn"></span> Zaif tomon: <b>${escapeHtml(weak.label)}</b> · ${weak.pct}%</div>
                </div>
                <div class="ai-reco">
                  <div class="ai-reco-title">${I.trending} Tavsiya</div>
                  <p>${escapeHtml(CRITERIA_ADVICE[weak.key])}</p>
                </div>`;
            })() : `<div class="empty-note">Baholangan dars bo'lgach AI xulosa chiqadi.</div>`}
          </div>
        </div>
      </div>

      <div class="section-title" style="margin-top:20px"><div><h2>Darslar</h2><div class="sub">${recs.length} ta yozuv</div></div></div>
      ${recs.length === 0 ? emptyStateHtml("Darslar yo'q", "Bu o'qituvchiga hali yozuv biriktirilmagan.") : `
        <div class="lessons-list">
          ${recs.map(l => {
            const score = l.overall_score;
            const col = score != null ? scoreColor(score) : "muted";
            const rs = REC_STATUS[l.status] || { label: l.status, color: "var(--text-faint)" };
            return `
              <div class="lesson-row" data-route="recordings/${l.id}" tabindex="0" role="button" style="cursor:pointer" title="Batafsil ko'rish">
                <div class="l-icon">${I.mic}</div>
                <div class="l-main"><div class="l-title">${escapeHtml(l.topic || "Dars")}</div><div class="l-sub">${escapeHtml([l.subject_name, l.group_name, l.source_display || l.source_name].filter(Boolean).join(" · "))}</div></div>
                <div class="l-date"><div style="font-size:12.5px;color:var(--text)">${fmtDateTime(l.started_at || l.created_at)}</div><div style="font-size:11px;color:${rs.color}">${escapeHtml(rs.label)}</div></div>
                <div class="l-meta">${I.clock} ${fmtMinutes(l.duration_seconds)} daq</div>
                <span class="score-chip ${col}">${score != null ? score + "%" : "—"}</span>
              </div>`;
          }).join("")}
        </div>
      `}
    `;
    document.getElementById("edit-teacher-btn").addEventListener("click", () => openTeacherModal(t, () => renderTeacher(id)));
    document.getElementById("delete-teacher-btn").addEventListener("click", () => deleteTeacherConfirm(t, () => route("teachers")));
    wireClickable(body, "[data-route]");
  } catch (err) {
    body.innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
    toast(err.message, "error");
  }
}

function deleteTeacherConfirm(t, onDone) {
  confirmDelete(
    "O'qituvchini o'chirasizmi?",
    `${t.full_name} ro'yxatdan o'chiriladi. Unga biriktirilgan yozuvlar saqlanib qoladi, lekin «biriktirilmagan» holatga qaytadi.`,
    async () => {
      await api(`/api/teachers/${t.id}`, { method: "DELETE" });
      toast("O'qituvchi o'chirildi", "success");
      onDone && onDone();
    }
  );
}

function openTeacherModal(t, onDone) {
  const isEdit = Boolean(t);
  const { modal, close } = openModal("t-modal", `
    <div class="modal-card" role="dialog">
      <div class="modal-head">
        <h3>${isEdit ? "O'qituvchini tahrirlash" : "Yangi o'qituvchi"}</h3>
        <button class="modal-close">${I.close}</button>
      </div>
      <form id="t-form" class="modal-body">
        <label class="field"><span class="label">F.I.Sh *</span>
          <input type="text" name="full_name" required maxlength="120" value="${escapeAttr(t?.full_name || "")}" placeholder="Familiya Ism Sharif"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="field"><span class="label">Kafedra</span>
            <input type="text" name="department" maxlength="120" value="${escapeAttr(t?.department || "")}" placeholder="Masalan: Dasturiy injiniring"></label>
          <label class="field"><span class="label">Lavozim</span>
            <input type="text" name="position" maxlength="80" value="${escapeAttr(t?.position || "")}" placeholder="Dotsent, assistent…"></label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="field"><span class="label">Telefon</span>
            <input type="text" name="phone" maxlength="30" value="${escapeAttr(t?.phone || "")}" placeholder="+998 __ ___ __ __"></label>
          <label class="field"><span class="label">Email</span>
            <input type="email" name="email" value="${escapeAttr(t?.email || "")}" placeholder="ism@tuit.uz"></label>
        </div>
        ${isEdit ? `
        <label class="remember-row">
          <input type="checkbox" name="active" ${t.active ? "checked" : ""}>
          <span>Faol (biriktirish ro'yxatida ko'rinadi)</span>
        </label>` : ""}
        <div class="error" id="t-err"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="t-cancel">Bekor qilish</button>
          <button type="submit" class="btn-primary">${I.ok} ${isEdit ? "Saqlash" : "Qo'shish"}</button>
        </div>
      </form>
    </div>
  `);
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("#t-cancel").addEventListener("click", close);
  modal.querySelector("#t-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = modal.querySelector("#t-err");
    err.classList.remove("show");
    const fd = new FormData(e.target);
    const f = Object.fromEntries(fd.entries());
    if (isEdit) f.active = fd.get("active") ? 1 : 0;
    try {
      if (isEdit) await api(`/api/teachers/${t.id}`, { method: "PATCH", body: JSON.stringify(f) });
      else await api("/api/teachers", { method: "POST", body: JSON.stringify(f) });
      toast(isEdit ? "Saqlandi" : "O'qituvchi qo'shildi", "success");
      close();
      onDone && onDone();
    } catch (ex) { err.textContent = ex.message; err.classList.add("show"); }
  });
}

// ═══════════════════════════════════════════════════════════════
// SUBJECTS
// ═══════════════════════════════════════════════════════════════
const SubjectsState = { q: "" };

async function renderSubjects() {
  setBreadcrumbs([{ label: "Dashboard", route: "dashboard" }, { label: "Fanlar" }]);
  setMain(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Fanlar</h1>
        <div class="page-subtitle">O'qitiladigan fanlar ro'yxati — dars biriktirishda tanlanadi</div>
      </div>
      <div class="page-actions">
        <button class="btn-secondary btn-sm" id="sub-refresh">${I.refresh} Yangilash</button>
        <button class="btn-primary btn-sm" id="sub-add">${I.add} Yangi fan</button>
      </div>
    </div>
    <div id="sub-body">${skeletonBlock(300)}</div>
  `);
  document.getElementById("sub-refresh").addEventListener("click", () => renderSubjects());
  document.getElementById("sub-add").addEventListener("click", () => openSubjectModal(null, renderSubjects));

  try {
    const d = await api("/api/subjects");
    const items = d.items || [];
    const q = SubjectsState.q.toLowerCase();
    const filtered = q ? items.filter(x => `${x.name} ${x.code || ""}`.toLowerCase().includes(q)) : items;

    document.getElementById("sub-body").innerHTML = `
      <div class="filters-bar">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="sub-search" placeholder="Fan nomi yoki kodi..." value="${escapeAttr(SubjectsState.q)}">
        </div>
        <div class="spacer"></div>
        <span class="tag">Jami: ${items.length}</span>
      </div>
      ${filtered.length === 0 ? emptyStateHtml("Fanlar topilmadi", items.length ? "Qidiruvni o'zgartiring." : "Yuqoridagi «Yangi fan» tugmasi bilan birinchisini qo'shing.") : `
        <div class="card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Fan nomi</th>
                  <th>Kod</th>
                  <th class="num">Darslar</th>
                  <th class="num">O'rtacha ball</th>
                  <th>Holati</th>
                  <th class="num" style="width:120px">Amal</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(s => `
                  <tr>
                    <td><div style="display:flex;align-items:center;gap:8px">
                      <div class="l-icon" style="width:28px;height:28px">${I.subjects}</div>
                      <strong>${escapeHtml(s.name)}</strong>
                    </div></td>
                    <td>${s.code ? `<span class="tag">${escapeHtml(s.code)}</span>` : "—"}</td>
                    <td class="num">${s.lesson_count || 0}</td>
                    <td class="num">${s.avg_score != null ? `<span class="score-chip ${scoreColor(s.avg_score)}">${s.avg_score}%</span>` : "—"}</td>
                    <td>${s.active ? '<span class="tag" style="color:var(--success)">Faol</span>' : '<span class="tag" style="color:var(--danger)">Nofaol</span>'}</td>
                    <td class="num">
                      <button class="btn-icon sub-edit" data-id="${s.id}" title="Tahrirlash">${I.edit}</button>
                      <button class="btn-icon sub-del" data-id="${s.id}" style="color:var(--danger)" title="O'chirish">${I.trash}</button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;

    document.getElementById("sub-search").addEventListener("input", debounce((e) => { SubjectsState.q = e.target.value; renderSubjects(); }, 150));
    const body = document.getElementById("sub-body");
    body.querySelectorAll(".sub-edit").forEach(b => {
      b.addEventListener("click", () => openSubjectModal(items.find(x => x.id === parseInt(b.dataset.id)), renderSubjects));
    });
    body.querySelectorAll(".sub-del").forEach(b => {
      b.addEventListener("click", () => {
        const item = items.find(x => x.id === parseInt(b.dataset.id));
        if (!item) return;
        confirmDelete("Fanni o'chirasizmi?", `"${item.name}" o'chiriladi. Bu fanga biriktirilgan ${item.lesson_count || 0} ta yozuvda fan bo'sh qoladi.`, async () => {
          await api(`/api/subjects/${item.id}`, { method: "DELETE" });
          toast("Fan o'chirildi", "success");
          renderSubjects();
        });
      });
    });
  } catch (err) {
    document.getElementById("sub-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
  }
}

function openSubjectModal(s, onDone) {
  const isEdit = Boolean(s);
  const { modal, close } = openModal("s-modal", `
    <div class="modal-card" role="dialog">
      <div class="modal-head">
        <h3>${isEdit ? "Fanni tahrirlash" : "Yangi fan"}</h3>
        <button class="modal-close">${I.close}</button>
      </div>
      <form id="s-form" class="modal-body">
        <label class="field"><span class="label">Fan nomi *</span>
          <input type="text" name="name" required maxlength="120" value="${escapeAttr(s?.name || "")}" placeholder="Masalan: Algoritmlar nazariyasi"></label>
        <label class="field"><span class="label">Kod (ixtiyoriy)</span>
          <input type="text" name="code" maxlength="30" value="${escapeAttr(s?.code || "")}" placeholder="ALG101"></label>
        ${isEdit ? `
        <label class="remember-row">
          <input type="checkbox" name="active" ${s.active ? "checked" : ""}>
          <span>Faol (biriktirish ro'yxatida ko'rinadi)</span>
        </label>` : ""}
        <div class="error" id="s-err"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="s-cancel">Bekor qilish</button>
          <button type="submit" class="btn-primary">${I.ok} ${isEdit ? "Saqlash" : "Qo'shish"}</button>
        </div>
      </form>
    </div>
  `);
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("#s-cancel").addEventListener("click", close);
  modal.querySelector("#s-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = modal.querySelector("#s-err");
    err.classList.remove("show");
    const fd = new FormData(e.target);
    const f = Object.fromEntries(fd.entries());
    if (isEdit) f.active = fd.get("active") ? 1 : 0;
    try {
      if (isEdit) await api(`/api/subjects/${s.id}`, { method: "PATCH", body: JSON.stringify(f) });
      else await api("/api/subjects", { method: "POST", body: JSON.stringify(f) });
      toast(isEdit ? "Saqlandi" : "Fan qo'shildi", "success");
      close();
      onDone && onDone();
    } catch (ex) { err.textContent = ex.message; err.classList.add("show"); }
  });
}

// ═══════════════════════════════════════════════════════════════
// SOURCES (xonalar — audiotap mikrofonlari)
// ═══════════════════════════════════════════════════════════════
const SourcesState = { q: "" };

async function renderSources() {
  setBreadcrumbs([{ label: "Dashboard", route: "dashboard" }, { label: "Xonalar" }]);
  setMain(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Xonalar</h1>
        <div class="page-subtitle">Audiotap mikrofonlari — birinchi webhook kelganda avtomatik qo'shiladi, nomini shu yerda belgilang</div>
      </div>
      <div class="page-actions">
        <button class="btn-secondary btn-sm" id="src-refresh">${I.refresh} Yangilash</button>
      </div>
    </div>
    <div id="src-body">${skeletonBlock(300)}</div>
  `);
  document.getElementById("src-refresh").addEventListener("click", () => renderSources());

  try {
    const d = await api("/api/sources");
    const items = d.items || [];
    const q = SourcesState.q.toLowerCase();
    const filtered = q
      ? items.filter(x => `${x.display_name || ""} ${x.audiotap_name} ${x.building || ""} ${x.room || ""}`.toLowerCase().includes(q))
      : items;

    document.getElementById("src-body").innerHTML = `
      <div class="filters-bar">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="src-search" placeholder="Xona, bino yoki audiotap nomi..." value="${escapeAttr(SourcesState.q)}">
        </div>
        <div class="spacer"></div>
        <span class="tag">Jami: ${items.length}</span>
      </div>
      ${filtered.length === 0 ? emptyStateHtml("Xonalar topilmadi", items.length ? "Qidiruvni o'zgartiring." : "Audiotap'dan birinchi webhook kelganda bu yerda avtomatik paydo bo'ladi.") : `
        <div class="card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Xona</th>
                  <th>Audiotap nomi</th>
                  <th>Bino</th>
                  <th class="num">Yozuvlar</th>
                  <th>Oxirgi yozuv</th>
                  <th>Holati</th>
                  <th class="num" style="width:90px">Amal</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(s => `
                  <tr data-src="${s.id}" style="cursor:pointer">
                    <td><div style="display:flex;align-items:center;gap:8px">
                      <div class="l-icon" style="width:28px;height:28px">${I.room}</div>
                      <div><strong>${escapeHtml(s.display_name || s.audiotap_name)}</strong>${s.room ? `<div class="sub">${escapeHtml(s.room)}</div>` : ""}</div>
                    </div></td>
                    <td><span class="tag">${escapeHtml(s.audiotap_name)}</span></td>
                    <td>${escapeHtml(s.building || "—")}</td>
                    <td class="num">${s.recording_count || 0}</td>
                    <td><span style="color:var(--text-subtle);font-size:12.5px">${fmtDateTime(s.last_seen)}</span></td>
                    <td>${s.active ? '<span class="tag" style="color:var(--success)">Faol</span>' : '<span class="tag" style="color:var(--danger)">Nofaol</span>'}</td>
                    <td class="num">
                      <button class="btn-icon src-edit" data-id="${s.id}" title="Tahrirlash">${I.edit}</button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;

    document.getElementById("src-search").addEventListener("input", debounce((e) => { SourcesState.q = e.target.value; renderSources(); }, 150));
    const body = document.getElementById("src-body");
    body.querySelectorAll(".src-edit").forEach(b => {
      b.addEventListener("click", (e) => { e.stopPropagation(); openSourceModal(items.find(x => x.id === parseInt(b.dataset.id)), renderSources); });
    });
    body.querySelectorAll("tr[data-src]").forEach(tr => {
      tr.addEventListener("click", () => {
        // Xona satri → shu xonaning yozuvlari
        const s = items.find(x => x.id === parseInt(tr.dataset.src));
        RecordingsState.q = s?.display_name || s?.audiotap_name || "";
        RecordingsState.status = ""; RecordingsState.page = 1;
        route("recordings");
      });
    });
  } catch (err) {
    document.getElementById("src-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
  }
}

function openSourceModal(s, onDone) {
  if (!s) return;
  const { modal, close } = openModal("src-modal", `
    <div class="modal-card" role="dialog">
      <div class="modal-head">
        <h3>Xonani tahrirlash</h3>
        <button class="modal-close">${I.close}</button>
      </div>
      <form id="src-form" class="modal-body">
        <label class="field"><span class="label">Audiotap nomi</span>
          <input type="text" value="${escapeAttr(s.audiotap_name)}" disabled></label>
        <label class="field"><span class="label">Ko'rsatiladigan nom *</span>
          <input type="text" name="display_name" required maxlength="80" value="${escapeAttr(s.display_name || "")}" placeholder="Masalan: 204-auditoriya"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="field"><span class="label">Bino</span>
            <input type="text" name="building" maxlength="60" value="${escapeAttr(s.building || "")}" placeholder="A bino"></label>
          <label class="field"><span class="label">Xona raqami</span>
            <input type="text" name="room" maxlength="30" value="${escapeAttr(s.room || "")}" placeholder="204"></label>
        </div>
        <label class="remember-row">
          <input type="checkbox" name="active" ${s.active ? "checked" : ""}>
          <span>Faol</span>
        </label>
        <div class="error" id="src-err"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="src-cancel">Bekor qilish</button>
          <button type="submit" class="btn-primary">${I.ok} Saqlash</button>
        </div>
      </form>
    </div>
  `);
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("#src-cancel").addEventListener("click", close);
  modal.querySelector("#src-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = modal.querySelector("#src-err");
    err.classList.remove("show");
    const fd = new FormData(e.target);
    const f = Object.fromEntries(fd.entries());
    f.active = fd.get("active") ? 1 : 0;
    try {
      await api(`/api/sources/${s.id}`, { method: "PATCH", body: JSON.stringify(f) });
      toast("Saqlandi", "success");
      close();
      onDone && onDone();
    } catch (ex) { err.textContent = ex.message; err.classList.add("show"); }
  });
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS — tizim holati, webhook, profil
// ═══════════════════════════════════════════════════════════════
async function renderSettings() {
  setBreadcrumbs([{ label: "Dashboard", route: "dashboard" }, { label: "Sozlamalar" }]);
  setMain(`
    <div class="page-header">
      <div><h1 class="page-title">Sozlamalar</h1><div class="page-subtitle">Tizim holati, audiotap ulanishi va profil</div></div>
      <div class="page-actions">
        <button class="btn-secondary btn-sm" id="st-refresh">${I.refresh} Yangilash</button>
      </div>
    </div>
    <div id="st-body">${skeletonBlock(320)}</div>
  `);
  document.getElementById("st-refresh").addEventListener("click", () => renderSettings());

  let sys;
  try { sys = await api("/api/system"); }
  catch (err) { document.getElementById("st-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`; return; }

  const u = Auth.user || {};
  const ok = (v) => v ? `<span class="tag" style="color:var(--success)">${I.ok} O'rnatilgan</span>` : `<span class="tag" style="color:var(--danger)">${I.xmark} O'rnatilmagan</span>`;
  const row = (k, v) => `
    <div style="display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid var(--border);align-items:center">
      <span class="sub">${escapeHtml(k)}</span><span style="text-align:right">${v}</span>
    </div>`;
  const counts = sys.counts || {};
  const statusOrder = ["queued", "downloading", "stored", "transcribing", "awaiting_assignment", "analyzing", "done", "failed", "skipped"];

  document.getElementById("st-body").innerHTML = `
    <div class="dash-grid">
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">Audiotap webhook</div><div class="card-subtitle">Audio capture server shu manzilga hodisa yuboradi</div></div>
          ${sys.secrets?.webhook ? `<span class="pill success">Tayyor</span>` : `<span class="pill danger">Secret yo'q</span>`}
        </div>
        <div class="card-body">
          <label class="field"><span class="label">Webhook URL (audiotap → «Webhook target»)</span>
            <div class="password-row">
              <input type="text" value="${escapeAttr(sys.webhook_url)}" readonly style="font-family:'JetBrains Mono',monospace;font-size:12.5px">
              <button type="button" class="pw-toggle" id="copy-webhook" title="Nusxalash">${I.copy}</button>
            </div>
          </label>
          ${row("Hodisa turi", `<span class="tag">recording.available</span>`)}
          ${row("Imzo secret'i (AUDIOTAP_WEBHOOK_SECRET)", ok(sys.secrets?.webhook))}
          ${row("Qayta ishlanadigan profil", `<span class="tag">${escapeHtml(sys.vars?.target_profile || "speech")}</span>`)}
          ${row("Audiotap manzili (AUDIOTAP_BASE_URL)", `<span class="tag" style="${sys.audiotap_base_is_local ? "color:var(--danger)" : ""}">${escapeHtml(sys.vars?.audiotap_base_url || "—")}</span>`)}
          ${row("Oxirgi webhook", `<b>${fmtDateTime(sys.last_webhook_at)}</b>`)}
          ${row("Bazaga yozilmay qolganlar (R2 zaxira)", sys.pending_webhooks > 0
            ? `<span class="tag" style="color:var(--warning)">${sys.pending_webhooks} ta</span> <button class="btn-secondary btn-sm" id="replay-btn">${I.refresh} Qayta ishlash</button>`
            : sys.pending_webhooks === -1 ? `<span class="tag muted">noma'lum</span>` : `<span class="tag" style="color:var(--success)">yo'q</span>`)}
          ${sys.audiotap_base_is_local ? `<div class="cov-note" style="margin-top:12px">${I.warn} AUDIOTAP_BASE_URL hali lokal manzil — Cloudflare Worker unga ulana olmaydi. Audiotap serverning tashqi (public) manzilini <code>wrangler.toml</code> ga yozib deploy qiling.</div>` : ""}
          ${!sys.last_webhook_at ? `<div class="cov-note" style="margin-top:12px">${I.info} Hali birorta webhook kelmagan. Audiotap'da webhook target yaratib, yuqoridagi URL va secret'ni kiriting.</div>` : ""}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div><div class="card-title">AI va cheklovlar</div><div class="card-subtitle">Gemini STT + 5 mezonli baholash</div></div>
          ${sys.secrets?.gemini_key ? `<span class="pill success">Faol</span>` : `<span class="pill danger">Kalit yo'q</span>`}
        </div>
        <div class="card-body">
          ${row("Gemini modeli", `<span class="tag">${escapeHtml(sys.vars?.gemini_model || "—")}</span>`)}
          ${row("GEMINI_API_KEY", ok(sys.secrets?.gemini_key))}
          ${row("JWT_SECRET", ok(sys.secrets?.jwt))}
          ${row("Maksimal audio hajmi", `<b>${escapeHtml(sys.vars?.max_ingest_mb || "90")} MB</b>`)}
          ${row("Server vaqti (UTC)", `<span class="sub">${escapeHtml(String(sys.time || "").replace("T", " ").slice(0, 19))}</span>`)}
          <div class="sub" style="margin-top:12px">Secret va sozlamalar Cloudflare'da o'rnatiladi: <code>wrangler secret put</code> / <code>wrangler.toml</code>. Bu sahifa faqat holatni ko'rsatadi.</div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><div><div class="card-title">Konveyer holati</div><div class="card-subtitle">Barcha yozuvlar status bo'yicha</div></div></div>
      <div class="card-body">
        <div class="kpi-grid">
          ${statusOrder.filter(k => counts[k] != null || ["done", "failed", "awaiting_assignment"].includes(k)).map(k => {
            const st = REC_STATUS[k] || { label: k, color: "var(--text-faint)" };
            return `<div class="kpi kpi-clickable" data-route="recordings:${k}"><div class="kpi-head"><div class="kpi-label" style="color:${st.color}">${escapeHtml(st.label)}</div></div><div class="kpi-value">${counts[k] || 0}</div></div>`;
          }).join("")}
        </div>
      </div>
    </div>

    <div class="dash-grid">
      <div class="card">
        <div class="card-header"><div><div class="card-title">Profil</div><div class="card-subtitle">Joriy foydalanuvchi</div></div></div>
        <div class="card-body">
          <div class="cell-person" style="margin-bottom:14px">
            <div class="avatar"${avatarStyle(u.name)}>${escapeHtml(initials(u.name || "A"))}</div>
            <div class="p-info"><div class="p-name">${escapeHtml(u.name || "Administrator")}</div><div class="p-email">${escapeHtml(u.email || "")} · ${escapeHtml(u.role || "admin")}</div></div>
          </div>
          <form id="pw-form">
            <div class="card-title" style="font-size:13px;margin-bottom:8px">${I.lock} Parolni o'zgartirish</div>
            <label class="field"><span class="label">Joriy parol</span><input type="password" name="current_password" required autocomplete="current-password"></label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <label class="field"><span class="label">Yangi parol (8+)</span><input type="password" name="new_password" required minlength="8" autocomplete="new-password"></label>
              <label class="field"><span class="label">Takrorlang</span><input type="password" name="confirm" required minlength="8" autocomplete="new-password"></label>
            </div>
            <div class="error" id="pw-err"></div>
            <div class="modal-actions" style="padding-top:4px">
              <button type="submit" class="btn-primary btn-sm">${I.ok} Saqlash</button>
            </div>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div><div class="card-title">Foydalanuvchilar</div><div class="card-subtitle">Admin panelga kirish huquqi borlar</div></div></div>
        <div class="card-body" style="padding:0">
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>Foydalanuvchi</th><th>Rol</th><th>Holati</th><th>Qo'shilgan</th></tr></thead>
            <tbody>${(sys.users || []).map(x => `
              <tr>
                <td><div class="cell-person">
                  <div class="avatar"${avatarStyle(x.name || x.email)}>${escapeHtml(initials(x.name || x.email))}</div>
                  <div class="p-info"><div class="p-name">${escapeHtml(x.name || "—")}</div><div class="p-email">${escapeHtml(x.email)}</div></div>
                </div></td>
                <td><span class="tag">${escapeHtml(x.role)}</span></td>
                <td>${x.active ? '<span class="tag" style="color:var(--success)">Faol</span>' : '<span class="tag" style="color:var(--danger)">Nofaol</span>'}</td>
                <td><span style="color:var(--text-subtle);font-size:12.5px">${fmtDate(x.created_at)}</span></td>
              </tr>`).join("")}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  `;

  const body = document.getElementById("st-body");
  wireClickable(body, ".kpi-clickable");
  document.getElementById("copy-webhook").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(sys.webhook_url); toast("Webhook URL nusxalandi", "success"); }
    catch { toast("Nusxalab bo'lmadi — qo'lda belgilab oling", "error"); }
  });
  document.getElementById("replay-btn")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const r = await api("/api/system/replay-webhooks", { method: "POST" });
      toast(`Qayta ishlandi: ${r.replayed} ta${r.failed ? `, xato: ${r.failed} (${r.error || ""})` : ""}`, r.failed ? "error" : "success", 6000);
      renderSettings();
    } catch (ex) { toast(ex.message, "error"); e.target.disabled = false; }
  });
  const pwForm = document.getElementById("pw-form");
  pwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("pw-err");
    err.classList.remove("show");
    if (pwForm.new_password.value !== pwForm.confirm.value) {
      err.textContent = "Yangi parollar mos kelmadi"; err.classList.add("show"); return;
    }
    try {
      await api("/api/me/password", { method: "POST", body: JSON.stringify({
        current_password: pwForm.current_password.value, new_password: pwForm.new_password.value,
      }) });
      toast("Parol o'zgartirildi", "success");
      pwForm.reset();
    } catch (ex) { err.textContent = ex.message; err.classList.add("show"); }
  });
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
render();
