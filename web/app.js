// ═══════════════════════════════════════════════════════════════
// EduLensAI Admin (tatuziyo / tuit.eyeziyo.uz) — admin.eyeziyo.uz bilan bir xil,
// HEMIS'siz; darslar audiotap yozuvlaridan keladi (Yozuvlar bo'limi).
// Adaptive UI for university / school / training center
// ═══════════════════════════════════════════════════════════════

const API = ""; // frontend va API bitta domenda (tuit.eyeziyo.uz)
const root = document.getElementById("app");
const toastRoot = document.getElementById("toast-container");

// ═══════════════════════════════════════════════════════════════
// STORAGE + PREFS
// ═══════════════════════════════════════════════════════════════
const Auth = {
  get token() { return localStorage.getItem("eyeziyo_token"); },
  set token(v) { v ? localStorage.setItem("eyeziyo_token", v) : localStorage.removeItem("eyeziyo_token"); },
  get user() {
    const raw = localStorage.getItem("eyeziyo_user");
    return raw ? JSON.parse(raw) : null;
  },
  set user(u) { u ? localStorage.setItem("eyeziyo_user", JSON.stringify(u)) : localStorage.removeItem("eyeziyo_user"); },
  clear() { this.token = null; this.user = null; localStorage.removeItem("eyeziyo_inst"); }
};

const Prefs = {
  get theme() { return localStorage.getItem("eyeziyo_theme") || "light"; },
  set theme(v) { localStorage.setItem("eyeziyo_theme", v); document.documentElement.setAttribute("data-theme", v); },
  get sidebarCollapsed() { return localStorage.getItem("eyeziyo_sb") === "1"; },
  set sidebarCollapsed(v) { localStorage.setItem("eyeziyo_sb", v ? "1" : "0"); },
};
document.documentElement.setAttribute("data-theme", Prefs.theme);

const AppState = {
  institution: null,
};

// ═══════════════════════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════════════════════
async function api(path, opts = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {})
  };
  if (Auth.token) headers["Authorization"] = `Bearer ${Auth.token}`;
  let res;
  try {
    res = await fetch(API + path, { ...opts, headers });
  } catch (e) {
    throw new Error("Serverga ulanib bo'lmadi. Internet yoki backend holatini tekshiring.");
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
    err.code = data?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

// ═══════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════
const I = {
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  teachers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11v6M12 2l10 5-10 5L2 7z"/><path d="M6 9.5V16c3 3 9 3 12 0V9.5"/></svg>',
  students: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  groups: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  subjects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  // institution types
  university: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
  school: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  center: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  // hierarchy
  faculty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M3 12h18M17 4v16"/></svg>',
  department: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h6M9 12h6M9 17h4"/></svg>',
  course: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></svg>',
  parallel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/></svg>',
  direction: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
  level: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  // ui
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
  // data
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 9H4a2 2 0 0 1-2-2V5h5M17 9h3a2 2 0 0 0 2-2V5h-5"/></svg>',
  trending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3 5-5"/><circle cx="12" cy="12" r="10"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  starFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  room: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg>',
};

// ═══════════════════════════════════════════════════════════════
// INSTITUTION CONFIG — adaptive UI per type
// ═══════════════════════════════════════════════════════════════
const INST_CONFIG = {
  university: {
    label: "Universitet",
    icon: I.university,
    levels: [
      { key: "faculty", label: "Fakultet", plural: "Fakultetlar", icon: I.faculty },
      { key: "direction", label: "Yo'nalish", plural: "Yo'nalishlar", icon: I.direction },
      { key: "course", label: "Kurs", plural: "Kurslar", icon: I.course },
    ],
    hasSubjects: true,
    subjectScope: "by_department",
    groupLabel: "Guruh",
  },
  school: {
    label: "Maktab",
    icon: I.school,
    levels: [
      { key: "parallel", label: "Sinf", plural: "Sinflar", icon: I.parallel },
    ],
    hasSubjects: true,
    subjectScope: "by_grades",
    groupLabel: "Bo'lim",
  },
  center: {
    label: "O'quv markazi",
    icon: I.center,
    levels: [
      { key: "direction", label: "Yo'nalish", plural: "Yo'nalishlar", icon: I.direction, hint: "Masalan: IT, Ingliz tili, Matematika" },
      { key: "level", label: "Kurs (daraja)", plural: "Kurslar", icon: I.level, hint: "Masalan: Beginner, Intermediate, Advanced" },
    ],
    hasSubjects: false,
    subjectScope: null,
    groupLabel: "Guruh",
  },
};

function currentConfig() {
  const t = AppState.institution?.type;
  return INST_CONFIG[t] || INST_CONFIG.center;
}

// ═══════════════════════════════════════════════════════════════
// ROUTER + STATE
// ═══════════════════════════════════════════════════════════════
const State = {
  view: null,
  params: null,
};

function route(view, params) {
  State.view = view;
  State.params = params || {};
  if (view === "login") return renderLogin();
  if (view === "onboard") return renderOnboard();

  ensureShell();
  highlightNav(view);

  if (view === "dashboard") renderDashboard();
  else if (view === "teachers") renderTeachers();
  else if (view === "teacher") renderTeacher(params.id);
  else if (view === "students") renderStudents();
  else if (view === "student") renderStudent(params.id);
  else if (view === "groups") renderGroups();
  else if (view === "group") renderGroup(params.id);
  else if (view === "subjects") renderSubjects();
  else if (view === "auditoriums") renderAuditoriums();
  else if (view === "recordings") renderRecordings();
  else if (view === "recording") renderRecordingDetail(params.id);
  else if (view === "evals") renderEvalQuestions();
  else if (view === "settings") renderSettings();
  else if (view && view.startsWith("hier:")) renderHierarchy(view.split(":")[1]);
}

async function init() {
  if (!Auth.token || !Auth.user || Auth.user.role !== "admin") {
    route("login");
    return;
  }
  // Bootstrap: fetch institution
  try {
    const inst = await api("/api/admin/institution");
    AppState.institution = inst;
    if (!inst) {
      route("onboard");
    } else {
      route("dashboard");
    }
  } catch (err) {
    if (err.status === 401) return;
    console.error("Init failed:", err);
    route("login");
  }
}

// ═══════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════
function renderLogin() {
  const tpl = document.getElementById("view-login").content.cloneNode(true);
  root.innerHTML = "";
  root.appendChild(tpl);
  document.getElementById("bootstrap-btn")?.addEventListener("click", openBootstrapModal);

  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");
  const btn = document.getElementById("login-btn");
  const pw = document.getElementById("pw");
  const pwToggle = document.getElementById("pw-toggle");
  pwToggle.addEventListener("click", () => {
    const showing = pw.type === "password";
    pw.type = showing ? "text" : "password";
    pwToggle.setAttribute("aria-label", showing ? "Parolni yashirish" : "Parolni ko'rsatish");
  });

  document.getElementById("forgot-btn")?.addEventListener("click", () => {
    toast("Parolni tiklash uchun muassasa administratori bilan bog'laning.", "info");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.remove("show");
    btn.disabled = true;
    btn.textContent = "Kirilmoqda...";
    try {
      const r = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.email.value.trim(), password: form.password.value }),
      });
      Auth.token = r.access_token;
      const me = await api("/api/users/me");
      if (me.role !== "admin") {
        Auth.clear();
        throw new Error("Faqat administrator kirishi mumkin");
      }
      Auth.user = me;
      init();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.add("show");
      btn.disabled = false;
      btn.textContent = "Tizimga kirish";
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════
function renderOnboard() {
  root.innerHTML = `
    <div class="onboard-wrap">
      <div class="onboard-card">
        <div class="onboard-header">
          <img class="onboard-logo" src="/logo_eyeziyo.png" alt="">
          <h1>Muassasangizni sozlang</h1>
          <p>EduLensAI sizning universitet, maktab yoki o'quv markazingizga moslashadi. Bu qadam faqat bir marta bajariladi.</p>
        </div>

        <div class="onboard-step">
          <div class="step-label">1. Muassasa turini tanlang</div>
          <div class="type-picker">
            <button class="type-card" data-type="university">
              <div class="tc-icon">${I.university}</div>
              <div class="tc-title">Universitet</div>
              <div class="tc-desc">Fakultet → yo'nalish → kurs → guruh</div>
            </button>
            <button class="type-card" data-type="school">
              <div class="tc-icon">${I.school}</div>
              <div class="tc-title">Maktab</div>
              <div class="tc-desc">Sinf → bo'lim</div>
            </button>
            <button class="type-card" data-type="center">
              <div class="tc-icon">${I.center}</div>
              <div class="tc-title">O'quv markazi</div>
              <div class="tc-desc">Yo'nalish → daraja → guruh</div>
            </button>
          </div>
        </div>

        <form id="onb-form" class="onboard-step" style="display:none">
          <div class="step-label">2. Muassasa ma'lumotlari</div>
          <label class="field">
            <span class="label">Muassasa nomi *</span>
            <input type="text" name="name" required maxlength="150" placeholder="Masalan: Toshkent Axborot Texnologiyalari Universiteti">
          </label>
          <label class="field">
            <span class="label">Qisqa nom (ixtiyoriy)</span>
            <input type="text" name="short_name" maxlength="30" placeholder="TATU">
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <label class="field">
              <span class="label">Manzil (ixtiyoriy)</span>
              <input type="text" name="address" maxlength="200" placeholder="Toshkent shahri...">
            </label>
            <label class="field">
              <span class="label">Telefon (ixtiyoriy)</span>
              <input type="text" name="phone" maxlength="30" placeholder="+998 71 ...">
            </label>
          </div>
          <label class="field">
            <span class="label">O'quv yili (ixtiyoriy)</span>
            <input type="text" name="academic_year" maxlength="20" placeholder="2025-2026">
          </label>
          <div class="error" id="onb-error"></div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" id="onb-back">← Orqaga</button>
            <button type="submit" class="btn-primary" id="onb-submit">Yaratish</button>
          </div>
        </form>
      </div>
    </div>
  `;

  let chosenType = null;
  const form = document.getElementById("onb-form");
  const errorEl = document.getElementById("onb-error");

  root.querySelectorAll(".type-card").forEach(c => {
    c.addEventListener("click", () => {
      chosenType = c.dataset.type;
      root.querySelectorAll(".type-card").forEach(x => x.classList.toggle("selected", x === c));
      form.style.display = "";
      setTimeout(() => form.name.focus(), 100);
      form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  document.getElementById("onb-back").addEventListener("click", () => {
    form.style.display = "none";
    root.querySelectorAll(".type-card").forEach(x => x.classList.remove("selected"));
    chosenType = null;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!chosenType) return;
    errorEl.classList.remove("show");
    const btn = document.getElementById("onb-submit");
    btn.disabled = true;
    btn.textContent = "Yaratilmoqda...";
    try {
      const inst = await api("/api/admin/institution", {
        method: "POST",
        body: JSON.stringify({
          type: chosenType,
          name: form.name.value.trim(),
          short_name: form.short_name.value.trim(),
          address: form.address.value.trim(),
          phone: form.phone.value.trim(),
          academic_year: form.academic_year.value.trim(),
        }),
      });
      AppState.institution = inst;
      toast("Muassasa yaratildi!", "success");
      route("dashboard");
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.add("show");
      btn.disabled = false;
      btn.textContent = "Yaratish";
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// SHELL + SIDEBAR
// ═══════════════════════════════════════════════════════════════
function buildNavItems() {
  const cfg = currentConfig();
  const items = [
    { section: "Asosiy" },
    { key: "dashboard", label: "Dashboard", icon: I.dash },
    { section: "Tuzilma" },
    ...cfg.levels.map(l => ({ key: `hier:${l.key}`, label: l.plural, icon: l.icon || I.groups })),
    { key: "groups", label: cfg.groupLabel === "Bo'lim" ? "Bo'limlar" : "Guruhlar", icon: I.groups },
    ...(cfg.hasSubjects ? [{ key: "subjects", label: "Fanlar", icon: I.subjects }] : []),
    ...(AppState.institution?.type === "university" ? [{ key: "auditoriums", label: "Xonalar", icon: I.room }] : []),
    { key: "evals", label: "Baholash savollari", icon: I.star },
    { section: "Audio" },
    { key: "recordings", label: "Yozuvlar", icon: I.mic },
    { section: "Odamlar" },
    { key: "teachers", label: "O'qituvchilar", icon: I.teachers },
    { key: "students", label: cfg.groupLabel === "Bo'lim" ? "O'quvchilar" : "O'quvchilar", icon: I.students },
    { section: "Tizim" },
    { key: "settings", label: "Sozlamalar", icon: I.settings },
  ];
  return items;
}

function ensureShell() {
  if (root.querySelector(".shell")) {
    rebuildSidebarNav();
    updateOrgChip();
    return;
  }
  const tpl = document.getElementById("view-shell").content.cloneNode(true);
  root.innerHTML = "";
  root.appendChild(tpl);

  const u = Auth.user || {};
  document.getElementById("uc-name").textContent = u.name || "Administrator";
  document.getElementById("uc-email").textContent = u.email || "";
  document.getElementById("uc-avatar").textContent = (u.avatar || u.name?.[0] || "A").toUpperCase();

  rebuildSidebarNav();
  updateOrgChip();

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
    AppState.institution = null;
    route("login");
  });

  document.getElementById("global-search").addEventListener("input", (e) => {
    const q = e.target.value;
    if (State.view === "teachers") {
      const box = document.getElementById("flt-search");
      if (box) { box.value = q; box.dispatchEvent(new Event("input", { bubbles: true })); }
    } else if (State.view === "students") {
      const box = document.getElementById("flt-search");
      if (box) { box.value = q; box.dispatchEvent(new Event("input", { bubbles: true })); }
    }
  });
}

function rebuildSidebarNav() {
  const nav = document.getElementById("sidebar-nav");
  if (!nav) return;
  const items = buildNavItems();
  nav.innerHTML = items.map(item => {
    if (item.section) return `<div class="side-section-title">${item.section}</div>`;
    return `<button class="side-item" data-route="${item.key}">
      ${item.icon}<span class="side-item-label">${item.label}</span>
    </button>`;
  }).join("");

  nav.querySelectorAll(".side-item[data-route]").forEach(b => {
    b.addEventListener("click", () => route(b.dataset.route));
  });
}

function updateOrgChip() {
  const inst = AppState.institution;
  if (!inst) return;
  const cfg = INST_CONFIG[inst.type];
  const nameEl = document.getElementById("org-name");
  const typeEl = document.getElementById("org-type");
  const badgeEl = document.getElementById("org-badge");
  if (nameEl) nameEl.textContent = inst.short_name || inst.name;
  if (typeEl) typeEl.textContent = cfg?.label || "";
  if (badgeEl) badgeEl.textContent = (inst.short_name || inst.name || "E")[0].toUpperCase();
}

function highlightNav(view) {
  let navView = view;
  if (view === "teacher") navView = "teachers";
  else if (view === "student") navView = "students";
  else if (view === "recording") navView = "recordings";
  else if (view === "group") navView = "groups";
  root.querySelectorAll(".side-item[data-route]").forEach(b => {
    b.classList.toggle("active", b.dataset.route === navView);
  });
}

function setBreadcrumbs(items) {
  const el = document.getElementById("breadcrumbs");
  if (!el) return;
  el.innerHTML = items.map((it, i) => {
    const isLast = i === items.length - 1;
    if (it.route && !isLast) {
      return `<button class="crumb link" data-br="${it.route}">${escapeHtml(it.label)}</button>` + `<span class="sep">/</span>`;
    }
    return `<span class="crumb ${isLast ? "active" : ""}">${escapeHtml(it.label)}</span>` + (isLast ? "" : `<span class="sep">/</span>`);
  }).join("");
  el.querySelectorAll("[data-br]").forEach(b => {
    b.addEventListener("click", () => route(b.dataset.br));
  });
}

function setMain(html) { document.getElementById("main-content").innerHTML = html; }
function skeletonBlock(h = 120) { return `<div class="skel" style="height:${h}px;margin-bottom:12px"></div>`; }

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
async function renderDashboard() {
  setBreadcrumbs([{ label: "Boshqaruv paneli" }]);
  const cfg = currentConfig();
  const inst = AppState.institution;
  let today = "";
  try { today = new Date().toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" }); }
  catch { today = new Date().toISOString().slice(0, 10); }
  setMain(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Boshqaruv paneli</h1>
        <div class="page-subtitle">${escapeHtml(inst?.name || "Muassasa")} · ${escapeHtml(cfg.label)}</div>
      </div>
      <div class="page-actions">
        <span class="date-chip">${I.cal} ${escapeHtml(today)}</span>
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
    const [teachers, stats, students, groups, subjects, topLevel, dash] = await Promise.all([
      api("/api/admin/teachers"),
      api("/api/admin/stats"),
      api("/api/admin/students").catch(() => []),
      api("/api/admin/groups").catch(() => []),
      cfg.hasSubjects ? api("/api/admin/subjects").catch(() => []) : Promise.resolve([]),
      api(`/api/admin/hierarchy?type=${cfg.levels[0].key}&parent_id=null`).catch(() => []),
      api("/api/admin/dashboard").catch(() => null),
    ]);
    const sorted = [...teachers].sort((a, b) => b.average_score - a.average_score);

    // Collect level counts for hierarchy summary
    const levelCounts = await Promise.all(cfg.levels.map(lv =>
      api(`/api/admin/hierarchy?type=${lv.key}`).then(arr => arr.length).catch(() => 0)
    ));

    // New rich endpoint may be missing on an older worker — derive a fallback.
    const D = dash || fallbackDashboard(teachers, stats);

    renderKPIs({ teachers, stats, students, groups, subjects, topLevel, D });
    renderDashBody({ D, sorted, teachers, students, groups, levelCounts, stats });
  } catch (err) {
    document.getElementById("dash-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
    toast(err.message, "error");
  }
}

// Client-side fallback when /api/admin/dashboard isn't available yet.
function fallbackDashboard(teachers, stats) {
  const scores = teachers.map(t => t.average_score).filter(Boolean);
  const eng = stats?.average_engagement_score || Math.round(scores.reduce((s, v) => s + v, 0) / (scores.length || 1)) || 0;
  const per = Math.round((eng / 5) * 10) / 10;
  const dist = { excellent: 0, good: 0, average: 0, weak: 0 };
  scores.forEach(s => {
    if (s >= 85) dist.excellent++; else if (s >= 70) dist.good++;
    else if (s >= 50) dist.average++; else dist.weak++;
  });
  return {
    criteria: { topic: per, speech: per, method: per, interaction: per, feedback: per },
    criteria_count: scores.length,
    recent_lessons: [],
    score_trend: buildTrendPoints(scores).map((v, i) => ({ label: `${i + 1}`, value: v })),
    distribution: dist,
    heatmap: Array.from({ length: 7 }, () => [0, 0, 0, 0]),
    alerts: teachers.filter(t => t.average_score && t.average_score < 60)
      .sort((a, b) => a.average_score - b.average_score).slice(0, 5)
      .map(t => ({ teacher_id: t.user_id, teacher_name: t.name, score: t.average_score, lessons: t.total_lessons || 0, level: t.average_score < 45 ? "danger" : "warning" })),
    speaking: { teacher: Math.round(100 - (22 + (per / 20) * 26)), student: Math.round(22 + (per / 20) * 26) },
    evaluated_lessons: scores.length,
  };
}

function renderKPIs({ teachers, stats, students, groups, subjects, topLevel, D }) {
  const cfg = currentConfig();
  const kpi = document.getElementById("dash-kpis");
  const engagement = stats?.average_engagement_score || 0;
  const trend = (D?.score_trend || []).map(p => p.value);
  // Real delta for the AI-score card from the last two trend buckets.
  let scoreDelta = null;
  if (trend.length >= 2) scoreDelta = trend[trend.length - 1] - trend[trend.length - 2];

  const kpis = [
    { icon: I.trending, color: "green", label: "Umumiy AI baho", value: `${engagement}%`,
      spark: trend.length ? trend : sparkSeed(engagement, 4), sparkColor: "var(--success)", delta: scoreDelta, deltaSuffix: "%" },
    { icon: I.mic, color: "blue", label: "Jami darslar", value: stats?.total_lessons ?? 0,
      spark: sparkSeed(stats?.total_lessons ?? 0, 11), sparkColor: "var(--brand)" },
    { icon: I.teachers, color: "cyan", label: "O'qituvchilar", value: teachers.length, route: "teachers",
      spark: sparkSeed(teachers.length, 23), sparkColor: "var(--cyan)" },
    { icon: I.students, color: "violet", label: "O'quvchilar", value: stats?.total_students ?? (students?.length || 0), route: "students",
      spark: sparkSeed(stats?.total_students ?? (students?.length || 0), 37), sparkColor: "var(--accent)" },
    { icon: I.groups, color: "amber", label: cfg.groupLabel === "Bo'lim" ? "Bo'limlar" : "Guruhlar", value: groups.length, route: "groups",
      spark: sparkSeed(groups.length, 53), sparkColor: "var(--warning)" },
    { icon: I.quiz, color: "slate", label: "O'rtacha test bali", value: `${stats?.average_test_score ?? 0}%`,
      spark: sparkSeed(stats?.average_test_score ?? 0, 71), sparkColor: "var(--text-muted)" },
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

  // Wire up navigation. Click + Enter/Space for keyboard accessibility.
  kpi.querySelectorAll(".kpi-clickable").forEach((el) => {
    const dest = el.getAttribute("data-route");
    if (!dest) return;
    el.addEventListener("click", () => route(dest));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); route(dest); }
    });
  });
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
    const ramp = 0.72 + (i / (n - 1)) * 0.28; // slight upward drift
    out.push(base * (ramp + noise));
  }
  out[n - 1] = base;
  return out;
}

// Pedagogik mezon meta (5 mezon, har biri 0-20 ball).
const CRITERIA_META = [
  { key: "topic",       label: "Mavzu mosligi",  hint: "Mavzu va terminologiya",  color: "#2563EB" },
  { key: "speech",      label: "Nutq tozaligi",  hint: "Akademik nutq maqsadliligi", color: "#06B6D4" },
  { key: "method",      label: "Metodika",       hint: "Tuzilma va misollar",     color: "#7C3AED" },
  { key: "interaction", label: "Interaktivlik",  hint: "Dialog va savollar",      color: "#059669" },
  { key: "feedback",    label: "Teskari aloqa",  hint: "Baholash va feedback",    color: "#D97706" },
];
const CRITERIA_ADVICE = {
  topic: "Mavzuni reja/sillabusga aniq bog'lang va tayanch atamalarni oldindan belgilang.",
  speech: "Darsni mavzudan chetlashtirmang — shaxsiy hikoya va parazit so'zlarni kamaytiring.",
  method: "Darsni aniq bosqichlarga bo'ling (kirish · asosiy qism · xulosa) va hayotiy misollar keltiring.",
  interaction: "Ko'proq ochiq savol bering va o'quvchilarni dialogga jalb qiling — monologdan qoching.",
  feedback: "O'quvchi javoblariga izohli munosabat bildiring va mustahkamlash savollarini bering.",
};

function renderDashBody({ D, sorted, teachers, students, groups, levelCounts = [], stats }) {
  const body = document.getElementById("dash-body");
  const cfg = currentConfig();
  const topN = sorted.slice(0, 5);
  const maxScore = topN[0]?.average_score || 100;
  const engagement = stats?.average_engagement_score || 0;

  const hierarchySummary = cfg.levels.map((lv, i) => ({
    label: lv.plural, count: levelCounts[i] || 0, icon: lv.icon, route: `hier:${lv.key}`,
  })).concat([
    { label: cfg.groupLabel === "Bo'lim" ? "Bo'limlar" : "Guruhlar", count: groups.length, icon: I.groups, route: "groups" },
  ]);

  const criteria = D.criteria || {};
  const critList = CRITERIA_META.map(m => ({ ...m, value: criteria[m.key] || 0, pct: Math.round(((criteria[m.key] || 0) / 20) * 100) }));
  const sortedCrit = [...critList].sort((a, b) => b.pct - a.pct);
  const strongest = sortedCrit[0];
  const weakest = sortedCrit[sortedCrit.length - 1];

  const dist = D.distribution || { excellent: 0, good: 0, average: 0, weak: 0 };
  const distBars = [
    { label: "A'lo (85+)", key: "excellent", count: dist.excellent, color: "var(--success)" },
    { label: "Yaxshi (70-84)", key: "good", count: dist.good, color: "var(--brand)" },
    { label: "O'rtacha (50-69)", key: "average", count: dist.average, color: "var(--warning)" },
    { label: "Zaif (<50)", key: "weak", count: dist.weak, color: "var(--danger)" },
  ];
  const distTotal = distBars.reduce((s, b) => s + b.count, 0) || 1;

  const alerts = D.alerts || [];
  const recent = D.recent_lessons || [];

  const week = D.week || null;
  const coverage = D.coverage || null;
  const idleTeachers = D.idle_teachers || [];
  const groupPerf = D.group_perf || [];
  const covPct = coverage && coverage.total_teachers
    ? Math.round((coverage.with_lessons / coverage.total_teachers) * 100) : 0;
  const activePct = coverage && coverage.total_teachers
    ? Math.round((coverage.active_7d / coverage.total_teachers) * 100) : 0;
  const maxGroupScore = groupPerf[0]?.average_score || 100;

  const weekDelta = (m, suffix = "") => {
    const d = (m?.current || 0) - (m?.previous || 0);
    if (d === 0) return `<span class="kpi-delta">o'zgarishsiz</span>`;
    return `<span class="kpi-delta ${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d)}${suffix}</span>`;
  };
  const weekRows = week ? [
    { label: "Yozilgan darslar", m: week.lessons, suffix: "" },
    { label: "O'rtacha AI baho", m: week.avg_score, suffix: "%", isPct: true },
    { label: "Jami vaqt (min)", m: week.minutes, suffix: "" },
  ] : [];

  const insightsSection = (week || coverage) ? `
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
                ${weekDelta(r.m, r.suffix)}
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
            <div class="card-subtitle">Platformadan real foydalanish darajasi</div>
          </div>
        </div>
        <div class="card-body">
          ${coverage ? `
            <div class="cov-list">
              <div class="cov-row">
                <div class="cov-top"><span>Kamida 1 dars yozganlar</span><b>${coverage.with_lessons} / ${coverage.total_teachers}</b></div>
                <div class="crit-bar-wrap"><div class="crit-bar" style="width:${covPct}%;background:var(--brand)"></div></div>
                <div class="cov-pct">${covPct}%</div>
              </div>
              <div class="cov-row">
                <div class="cov-top"><span>So'nggi 7 kunda faol</span><b>${coverage.active_7d} / ${coverage.total_teachers}</b></div>
                <div class="crit-bar-wrap"><div class="crit-bar" style="width:${activePct}%;background:var(--success)"></div></div>
                <div class="cov-pct">${activePct}%</div>
              </div>
            </div>
            ${covPct < 50 ? `<div class="cov-note">${I.info} O'qituvchilarning katta qismi hali dars yozmagan — ularni platformaga jalb qilish sifat monitoringini kengaytiradi.</div>` : ""}
          ` : `<div class="empty-note">Ma'lumot yo'q</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Sifat taqsimoti</div>
            <div class="card-subtitle">${D.evaluated_lessons || 0} ta baholangan dars</div>
          </div>
        </div>
        <div class="card-body">
          <div class="dist-stacked" style="display:flex;height:26px;border-radius:8px;overflow:hidden;gap:2px;margin-bottom:14px">
            ${distBars.map(b => {
              const w = Math.round((b.count / distTotal) * 100);
              return w > 0 ? `<div title="${b.label}: ${b.count}" style="width:${w}%;background:${b.color};min-width:${w > 3 ? 0 : 4}px"></div>` : "";
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
  ` : "";

  const idleCard = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Sustlashgan o'qituvchilar</div>
          <div class="card-subtitle">14+ kun dars yozmaganlar</div>
        </div>
        ${idleTeachers.length ? `<span class="pill warning">${idleTeachers.length}</span>` : ""}
      </div>
      <div class="card-body" style="padding:0">
        ${idleTeachers.length === 0
          ? `<div class="empty-note">${I.ok} Barcha faol o'qituvchilar muntazam yozmoqda</div>`
          : idleTeachers.map(t => `
            <div class="alert-row" data-tid="${t.teacher_id}">
              <span class="alert-ico warning">${I.clock}</span>
              <div class="alert-body">
                <div class="alert-title">${escapeHtml(t.teacher_name)}</div>
                <div class="alert-sub">Oxirgi dars: ${escapeHtml(fmtDate(t.last_lesson_at))} · jami ${t.lessons} dars</div>
              </div>
            </div>
          `).join("")}
      </div>
    </div>`;

  const groupPerfCard = groupPerf.length ? `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Guruhlar reytingi</div>
          <div class="card-subtitle">Baholangan darslar bo'yicha o'rtacha ball</div>
        </div>
      </div>
      <div class="card-body">
        <div class="rank-list">
          ${groupPerf.map((g, i) => `
            <div class="rank-item">
              <div class="idx">#${i + 1}</div>
              <div class="body">
                <div class="nm">${escapeHtml(g.group_name)} <span class="rank-meta">· ${g.lessons} dars</span></div>
                <div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.max(4, (g.average_score / maxGroupScore * 100))}%"></div></div>
              </div>
              <div class="v">${g.average_score}%</div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  ` : "";

  body.innerHTML = `
    <!-- Sifat gauge + AI yordamchi -->
    <div class="dash-grid">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Umumiy dars sifati</div>
            <div class="card-subtitle">${D.criteria_count || 0} ta baholangan dars · 5 pedagogik mezon</div>
          </div>
        </div>
        <div class="card-body">
          <div class="quality-wrap">
            <div class="quality-gauge">${gaugeRing(engagement)}</div>
            <div class="criteria-list">
              ${critList.map(c => {
                const pctClamped = Math.min(100, Math.max(0, c.pct));
                const tag = pctClamped >= 80 ? "A'lo" : pctClamped >= 60 ? "Yaxshi" : pctClamped >= 40 ? "O'rta" : "Zaif";
                const tagCls = pctClamped >= 80 ? "success" : pctClamped >= 60 ? "brand" : pctClamped >= 40 ? "warning" : "danger";
                return `
                <div class="crit-row">
                  <div class="crit-top">
                    <span class="crit-name">${escapeHtml(c.label)} <span class="ai-tag ${tagCls}" style="font-size:10px;padding:1px 6px">${tag}</span></span>
                    <span class="crit-val">${c.value.toFixed(1)}<span class="crit-max">/20</span></span>
                  </div>
                  <div class="crit-bar-wrap"><div class="crit-bar" style="width:${pctClamped}%;background:${c.color}"></div></div>
                </div>`;
              }).join("")}
            </div>
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
            ${alerts.length ? `<div class="ai-fact"><span class="dot warn"></span> <b>${alerts.length} o'qituvchi</b> past baho bilan e'tibor talab qiladi</div>` : ""}
          </div>
          <div class="ai-reco">
            <div class="ai-reco-title">${I.trending} Tavsiya</div>
            <p>${escapeHtml(CRITERIA_ADVICE[weakest?.key] || "Darslarni yozib, baholashni davom ettiring — tahlil boyiydi.")}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Haftalik dinamika + qamrov + sifat taqsimoti -->
    ${insightsSection}

    <!-- Ogohlantirishlar + tavsiyalar + top o'qituvchilar -->
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
              <div class="alert-row" data-tid="${a.teacher_id}">
                <span class="alert-ico ${a.level}">${I.warn}</span>
                <div class="alert-body">
                  <div class="alert-title">${escapeHtml(a.teacher_name)}</div>
                  <div class="alert-sub">O'rtacha baho past · ${a.lessons} dars</div>
                </div>
                <span class="score-chip ${scoreColor(a.score)}">${a.score}%</span>
              </div>
            `).join("")}
        </div>
      </div>

      ${idleCard}

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Top o'qituvchilar</div>
            <div class="card-subtitle">O'rtacha ball bo'yicha</div>
          </div>
          <button class="btn-ghost btn-sm" id="see-all-t">Hammasi →</button>
        </div>
        <div class="card-body">
          <div class="rank-list">
            ${topN.length === 0 ? `<div class="empty-note">Ma'lumot yo'q</div>` : topN.map((t, i) => `
              <div class="rank-item rank-click" data-tid="${t.user_id}">
                <div class="idx">#${i + 1}</div>
                <div class="body">
                  <div class="nm">${escapeHtml(t.name)}</div>
                  <div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.max(4, (t.average_score / maxScore * 100))}%"></div></div>
                </div>
                <div class="v">${t.average_score}%</div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>

    <!-- Guruhlar reytingi + so'nggi darslar + faoliyat tarixi -->
    <div class="${groupPerf.length ? "dash-grid-3" : "dash-grid"}">
      ${groupPerfCard}
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">So'nggi darslar</div>
            <div class="card-subtitle">Oxirgi baholangan darslar</div>
          </div>
        </div>
        <div class="card-body" style="padding:0">
          ${recent.length === 0
            ? `<div class="empty-note">Hozircha dars yo'q</div>`
            : recent.map(l => `
              <div class="lesson-row" data-lid="${l.id}" style="grid-template-columns:36px 1fr auto;cursor:pointer">
                <div class="l-icon">${I.mic}</div>
                <div class="l-main">
                  <div class="l-title">${escapeHtml(l.topic || "Dars")}</div>
                  <div class="l-sub">${escapeHtml(l.teacher_name || "")}${l.group_name ? " · " + escapeHtml(l.group_name) : ""}</div>
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

    <!-- Muassasa tuzilmasi -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div>
          <div class="card-title">Muassasa tuzilmasi</div>
          <div class="card-subtitle">Iyerarxiya bo'yicha umumiy ko'rsatkichlar</div>
        </div>
      </div>
      <div class="card-body">
        <div class="hier-flow">
          ${hierarchySummary.map((h, i) => `
            <div class="hier-step${h.route ? " hier-step-clickable" : ""}"${h.route ? ` data-route="${escapeAttr(h.route)}" tabindex="0" role="button" aria-label="${escapeAttr(h.label)} bo'limiga o'tish"` : ""}>
              <div class="hier-icon">${h.icon}</div>
              <div class="hier-body">
                <div class="hier-count">${h.count}</div>
                <div class="hier-label">${escapeHtml(h.label)}</div>
              </div>
            </div>
            ${i < hierarchySummary.length - 1 ? `<div class="hier-arrow">${I.arrow}</div>` : ""}
          `).join("")}
        </div>
      </div>
    </div>
  `;

  document.getElementById("see-all-t")?.addEventListener("click", () => route("teachers"));
  body.querySelectorAll(".lesson-row[data-lid]").forEach(el => {
    el.addEventListener("click", () => route("teacher", { id: parseInt(el.dataset.lid) }));
  });
  body.querySelectorAll(".alert-row[data-tid], .rank-click[data-tid]").forEach(el => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => route("teacher", { id: parseInt(el.dataset.tid) }));
  });
  body.querySelectorAll(".hier-step-clickable").forEach((el) => {
    const dest = el.getAttribute("data-route");
    if (!dest) return;
    el.addEventListener("click", () => route(dest));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); route(dest); }
    });
  });
}

function qualityLabel(pct) {
  if (pct >= 85) return "A'lo";
  if (pct >= 70) return "Yaxshi";
  if (pct >= 50) return "O'rtacha";
  if (pct > 0) return "Zaif";
  return "Ma'lumot yo'q";
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

// ═══════════════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════════════
function buildTrendPoints(scores) {
  if (scores.length === 0) return [0, 0, 0, 0, 0, 0, 0];
  const N = 7;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const slice = scores.slice(i * 3, i * 3 + Math.max(1, Math.floor(scores.length / N)));
    const slicePts = slice.length ? slice : scores;
    const avg = slicePts.reduce((s, v) => s + v, 0) / slicePts.length;
    pts.push(Math.round(avg));
  }
  return pts;
}

function lineChart(points, labelsArr) {
  const W = 600, H = 200, P = 30;
  const max = Math.max(100, Math.max(...points));
  const scaleX = (i) => P + (i * (W - P * 2)) / (points.length - 1 || 1);
  const scaleY = (v) => H - P - (v / max) * (H - P * 2);
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${scaleX(i).toFixed(1)},${scaleY(v).toFixed(1)}`).join(" ");
  const areaPath = path + ` L${scaleX(points.length - 1).toFixed(1)},${H - P} L${scaleX(0).toFixed(1)},${H - P} Z`;
  const gridLines = [0, 25, 50, 75, 100].map(v => `
    <line class="grid-line" x1="${P}" y1="${scaleY(v)}" x2="${W - P}" y2="${scaleY(v)}"/>
    <text class="axis-label" x="${P - 6}" y="${scaleY(v) + 3}" text-anchor="end">${v}</text>
  `).join("");
  const dots = points.map((v, i) => `<circle class="dot" cx="${scaleX(i)}" cy="${scaleY(v)}" r="3"/>`).join("");
  const defaultLabels = ["1h", "2h", "3h", "4h", "5h", "6h", "7h"];
  const lbArr = (labelsArr && labelsArr.length) ? labelsArr : defaultLabels;
  const labels = points.map((_, i) => `
    <text class="axis-label" x="${scaleX(i)}" y="${H - 8}" text-anchor="middle">${escapeHtml(lbArr[i] ?? "")}</text>
  `).join("");
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="line-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#2563EB" stop-opacity="0.24"/>
          <stop offset="100%" stop-color="#2563EB" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <path class="line-area" d="${areaPath}"/>
      <path class="line" d="${path}"/>
      ${dots}
      ${labels}
    </svg>
  `;
}

const DONUT_COLORS = ["#2563EB", "#7C3AED", "#059669", "#D97706", "#0891B2", "#EC4899"];
function donutColor(i) { return DONUT_COLORS[i % DONUT_COLORS.length]; }

function donutChart(items) {
  if (items.length === 0) {
    return `<svg class="chart" viewBox="0 0 200 180"><circle cx="100" cy="90" r="60" fill="none" stroke="var(--bg-subtle)" stroke-width="24"/></svg>`;
  }
  const total = items.reduce((s, it) => s + it.count, 0) || 1;
  const cx = 100, cy = 90, r = 60, sw = 22;
  let acc = 0;
  const C = 2 * Math.PI * r;
  const segs = items.map((it, i) => {
    const frac = it.count / total;
    const dashArray = `${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`;
    const offset = -(acc * C);
    acc += frac;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${donutColor(i)}"
              stroke-width="${sw}" stroke-dasharray="${dashArray}" stroke-dashoffset="${offset.toFixed(2)}"
              transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt"/>`;
  }).join("");
  return `
    <svg class="chart" viewBox="0 0 200 180" style="max-height:180px">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-subtle)" stroke-width="${sw}"/>
      ${segs}
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" style="font-size:22px;font-weight:700;fill:var(--text)">${total}</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" style="font-size:11px;fill:var(--text-subtle)">Jami</text>
    </svg>
  `;
}

// ═══════════════════════════════════════════════════════════════
// HIERARCHY PAGE (faculty / direction / course / parallel / level)
// ═══════════════════════════════════════════════════════════════
const HierState = { q: "", parentFilter: "" };

async function renderHierarchy(nodeType) {
  const cfg = currentConfig();
  const level = cfg.levels.find(l => l.key === nodeType);
  if (!level) { setMain(`<div class="error show">Noto'g'ri tur</div>`); return; }
  const levelIdx = cfg.levels.indexOf(level);
  const parentLevel = levelIdx > 0 ? cfg.levels[levelIdx - 1] : null;

  setBreadcrumbs([{ label: "Dashboard", route: "dashboard" }, { label: level.plural }]);
  setMain(`
    <div class="page-header">
      <div>
        <h1 class="page-title">${escapeHtml(level.plural)}</h1>
        <div class="page-subtitle">${escapeHtml(level.label)} ro'yxati va boshqaruvi</div>
      </div>
      <div class="page-actions">
        <button class="btn-secondary btn-sm" id="h-refresh">${I.refresh} Yangilash</button>
        <button class="btn-primary btn-sm" id="h-add">${I.add} Yangi ${escapeHtml(level.label.toLowerCase())}</button>
      </div>
    </div>
    <div id="h-body">${skeletonBlock(400)}</div>
  `);

  document.getElementById("h-refresh").addEventListener("click", () => renderHierarchy(nodeType));
  document.getElementById("h-add").addEventListener("click", () => openHierarchyModal(null, level, parentLevel));

  const body = document.getElementById("h-body");
  try {
    const parents = parentLevel ? await api(`/api/admin/hierarchy?type=${parentLevel.key}`) : [];
    let url = `/api/admin/hierarchy?type=${nodeType}`;
    if (HierState.parentFilter) url += `&parent_id=${HierState.parentFilter}`;
    const items = await api(url);

    // name lookup for parents
    const parentMap = {};
    for (const p of parents) parentMap[p.id] = p.name;

    // filter by search
    const q = HierState.q.toLowerCase();
    const filtered = q ? items.filter(x => x.name.toLowerCase().includes(q)) : items;

    body.innerHTML = `
      <div class="filters-bar">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="h-search" placeholder="Qidirish..." value="${escapeAttr(HierState.q)}">
        </div>
        ${parentLevel ? `
          <select id="h-parent">
            <option value="">Barcha ${escapeHtml(parentLevel.plural.toLowerCase())}</option>
            ${parents.map(p => `<option value="${p.id}" ${String(p.id) === HierState.parentFilter ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
          </select>
        ` : ""}
        <div class="spacer"></div>
      </div>

      ${filtered.length === 0 ? emptyStateHtml(`${level.plural} topilmadi`, `Yangi ${level.label.toLowerCase()} qo'shing.`) : `
        <div class="card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Qisqa</th>
                  ${parentLevel ? `<th>${escapeHtml(parentLevel.label)}</th>` : ""}
                  <th class="num" title="Ichki elementlar">Ichki</th>
                  <th class="num" title="Guruhlar">${cfg.groupLabel === "Bo'lim" ? "Bo'limlar" : "Guruhlar"}</th>
                  <th class="num">O'qituvchilar</th>
                  <th class="num">O'quvchilar</th>
                  <th class="num" style="width:120px">Amal</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(it => `
                  <tr>
                    <td><div style="display:flex;align-items:center;gap:8px">
                      <div class="l-icon" style="width:28px;height:28px">${level.icon}</div>
                      <strong>${escapeHtml(it.name)}</strong>
                    </div></td>
                    <td><span class="tag">${escapeHtml(it.short_name || "—")}</span></td>
                    ${parentLevel ? `<td>${escapeHtml(parentMap[it.parent_id] || "—")}</td>` : ""}
                    <td class="num">${it.child_count || 0}</td>
                    <td class="num">${it.group_count || 0}</td>
                    <td class="num">${it.teacher_count || 0}</td>
                    <td class="num">${it.student_count || 0}</td>
                    <td class="num">
                      <button class="btn-icon h-edit" data-id="${it.id}" title="Tahrirlash">${I.edit}</button>
                      <button class="btn-icon h-del" data-id="${it.id}" style="color:var(--danger)" title="O'chirish">${I.trash}</button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;

    document.getElementById("h-search").addEventListener("input", debounce((e) => { HierState.q = e.target.value; renderHierarchy(nodeType); }, 150));
    const parentSel = document.getElementById("h-parent");
    if (parentSel) parentSel.addEventListener("change", (e) => { HierState.parentFilter = e.target.value; renderHierarchy(nodeType); });

    body.querySelectorAll(".h-edit").forEach(b => {
      b.addEventListener("click", () => {
        const item = filtered.find(x => x.id === parseInt(b.dataset.id));
        openHierarchyModal(item, level, parentLevel);
      });
    });
    body.querySelectorAll(".h-del").forEach(b => {
      b.addEventListener("click", () => {
        const item = filtered.find(x => x.id === parseInt(b.dataset.id));
        confirmDelete(`${level.label}ni o'chirasizmi?`, `"${item.name}" o'chiriladi. Ichki elementlar bo'lsa o'chirilmaydi.`, async () => {
          await api(`/api/admin/hierarchy/${item.id}`, { method: "DELETE" });
          toast("O'chirildi", "success");
          renderHierarchy(nodeType);
        });
      });
    });
  } catch (err) {
    body.innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
  }
}

function openHierarchyModal(existing, level, parentLevel) {
  const isEdit = existing != null;

  // Parents list will be fetched on open
  const parentId = existing?.parent_id || "";

  const { modal, close } = openModal("h-modal", `
    <div class="modal-card" role="dialog">
      <div class="modal-head">
        <h3>${isEdit ? `${level.label}ni tahrirlash` : `Yangi ${level.label.toLowerCase()}`}</h3>
        <button class="modal-close">${I.close}</button>
      </div>
      <form id="h-form" class="modal-body">
        ${parentLevel ? `
          <label class="field">
            <span class="label">${escapeHtml(parentLevel.label)} *</span>
            <select name="parent_id" required ${isEdit ? "disabled" : ""}>
              <option value="">Yuklanmoqda...</option>
            </select>
          </label>
        ` : ""}
        <label class="field">
          <span class="label">Nomi *</span>
          <input type="text" name="name" required maxlength="100" value="${escapeAttr(existing?.name || "")}" placeholder="Masalan: ${escapeAttr(level.label)} nomi">
        </label>
        <label class="field">
          <span class="label">Qisqa nom (ixtiyoriy)</span>
          <input type="text" name="short_name" maxlength="30" value="${escapeAttr(existing?.short_name || "")}" placeholder="SHR">
        </label>
        <div class="error" id="h-error"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="h-cancel">Bekor qilish</button>
          <button type="submit" class="btn-primary">${isEdit ? "Saqlash" : "Qo'shish"}</button>
        </div>
      </form>
    </div>
  `);
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("#h-cancel").addEventListener("click", close);

  // Load parents
  if (parentLevel) {
    api(`/api/admin/hierarchy?type=${parentLevel.key}`).then(parents => {
      const sel = modal.querySelector("[name=parent_id]");
      sel.innerHTML = `<option value="">— tanlang —</option>` + parents.map(p => `<option value="${p.id}" ${String(p.id) === String(parentId) ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("");
    }).catch(() => {});
  }

  const form = modal.querySelector("#h-form");
  const errorEl = modal.querySelector("#h-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.remove("show");
    try {
      const payload = {
        name: form.name.value.trim(),
        short_name: form.short_name.value.trim(),
      };
      if (parentLevel && !isEdit) {
        const pid = form.parent_id.value;
        if (!pid) throw new Error(`Avval ${parentLevel.label.toLowerCase()} tanlang`);
        payload.parent_id = parseInt(pid);
      }
      if (isEdit) {
        await api(`/api/admin/hierarchy/${existing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast("Saqlandi", "success");
      } else {
        payload.node_type = level.key;
        await api("/api/admin/hierarchy", { method: "POST", body: JSON.stringify(payload) });
        toast("Qo'shildi", "success");
      }
      close();
      renderHierarchy(level.key);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.add("show");
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// SUBJECTS
// ═══════════════════════════════════════════════════════════════
const SubjectsState = { q: "" };
const AuditoriumsState = { q: "" };

async function renderSubjects() {
  setBreadcrumbs([{ label: "Dashboard", route: "dashboard" }, { label: "Fanlar" }]);
  setMain(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Fanlar</h1>
        <div class="page-subtitle">O'qitiladigan fanlar ro'yxati</div>
      </div>
      <div class="page-actions">
        <button class="btn-secondary btn-sm" id="sub-refresh">${I.refresh} Yangilash</button>
        <button class="btn-primary btn-sm" id="sub-add">${I.add} Yangi fan</button>
      </div>
    </div>
    <div id="sub-body">${skeletonBlock(300)}</div>
  `);
  document.getElementById("sub-refresh").addEventListener("click", () => renderSubjects());
  document.getElementById("sub-add").addEventListener("click", () => openSubjectModal(null));

  try {
    const items = await api("/api/admin/subjects");
    const q = SubjectsState.q.toLowerCase();
    const filtered = q ? items.filter(x => x.name.toLowerCase().includes(q)) : items;

    document.getElementById("sub-body").innerHTML = `
      <div class="filters-bar">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="sub-search" placeholder="Fan nomi..." value="${escapeAttr(SubjectsState.q)}">
        </div>
        <div class="spacer"></div>
      </div>
      ${filtered.length === 0 ? emptyStateHtml("Fanlar topilmadi", "Yangi fan qo'shing.") : `
        <div class="card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Fan nomi</th>
                  <th>Qisqa</th>
                  <th class="num">Kredit</th>
                  <th class="num">O'qituvchilar</th>
                  <th class="num">Guruhlar</th>
                  <th class="num">O'quvchilar (yetib borganlar)</th>
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
                    <td><span class="tag">${escapeHtml(s.short_name || "—")}</span></td>
                    <td class="num">${s.credit_hours || 0}</td>
                    <td class="num">${s.teacher_count || 0}</td>
                    <td class="num">${s.group_count || 0}</td>
                    <td class="num">${s.student_count || 0}</td>
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
      b.addEventListener("click", () => {
        const item = filtered.find(x => x.id === parseInt(b.dataset.id));
        openSubjectModal(item);
      });
    });
    body.querySelectorAll(".sub-del").forEach(b => {
      b.addEventListener("click", () => {
        const item = filtered.find(x => x.id === parseInt(b.dataset.id));
        confirmDelete("Fanni o'chirasizmi?", `"${item.name}" o'chiriladi. Bu fandagi barcha o'qituvchi tayinlashlari ham olib tashlanadi.`, async () => {
          await api(`/api/admin/subjects/${item.id}`, { method: "DELETE" });
          toast("Fan o'chirildi", "success");
          renderSubjects();
        });
      });
    });
  } catch (err) {
    document.getElementById("sub-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// AUDITORIUMS (HEMIS rooms — read-only reference)
// ═══════════════════════════════════════════════════════════════
async function renderAuditoriums() {
  setBreadcrumbs([{ label: "Dashboard", route: "dashboard" }, { label: "Xonalar" }]);
  setMain(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Xonalar</h1>
        <div class="page-subtitle">Audiotap mikrofonlari o'rnatilgan auditoriyalar — birinchi yozuv kelganda avtomatik qo'shiladi</div>
      </div>
      <div class="page-actions">
        <button class="btn-secondary btn-sm" id="aud-refresh">${I.refresh} Yangilash</button>
      </div>
    </div>
    <div id="aud-body">${skeletonBlock(300)}</div>
  `);
  document.getElementById("aud-refresh").addEventListener("click", () => renderAuditoriums());

  try {
    const items = await api("/api/admin/auditoriums");
    const q = AuditoriumsState.q.toLowerCase();
    const filtered = q
      ? items.filter(x =>
          (x.name || "").toLowerCase().includes(q) ||
          (x.building_name || "").toLowerCase().includes(q) ||
          (x.type_name || "").toLowerCase().includes(q))
      : items;

    document.getElementById("aud-body").innerHTML = `
      <div class="filters-bar">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="aud-search" placeholder="Xona, bino yoki tur..." value="${escapeAttr(AuditoriumsState.q)}">
        </div>
        <div class="spacer"></div>
        <span class="tag">Jami: ${items.length}</span>
      </div>
      ${filtered.length === 0 ? emptyStateHtml("Xonalar topilmadi", "Audiotap'dan birinchi webhook kelganda bu yerda avtomatik paydo bo'ladi.") : `
        <div class="card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Xona</th>
                  <th>Bino</th>
                  <th>Turi</th>
                  <th class="num">Yozuvlar</th>
                  <th>Holati</th>
                  <th class="num" style="width:80px">Amal</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(a => `
                  <tr>
                    <td><div style="display:flex;align-items:center;gap:8px">
                      <div class="l-icon" style="width:28px;height:28px">${I.room}</div>
                      <strong>${escapeHtml(a.name || "—")}</strong>
                    </div></td>
                    <td>${escapeHtml(a.building_name || "—")}</td>
                    <td>${a.type_name ? `<span class="tag">${escapeHtml(a.type_name)}</span>` : "—"}</td>
                    <td class="num">${a.recording_count || 0}</td>
                    <td>${a.active ? '<span class="tag" style="color:var(--success)">Faol</span>' : '<span class="tag" style="color:var(--danger)">Nofaol</span>'}</td>
                    <td class="num"><button class="btn-icon aud-edit" data-id="${a.id}" title="Tahrirlash">${I.edit}</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;

    document.getElementById("aud-search").addEventListener("input", debounce((e) => { AuditoriumsState.q = e.target.value; renderAuditoriums(); }, 150));
    document.querySelectorAll("#aud-body .aud-edit").forEach(b => {
      b.addEventListener("click", () => openSourceModal(items.find(x => x.id === parseInt(b.dataset.id)), () => renderAuditoriums()));
    });
  } catch (err) {
    document.getElementById("aud-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// AUDIOTAP YOZUVLARI — tatuziyo konveyeri (admin-web dizayni bilan)
// Yozuv: audiotap → yuklab olish → transkript → biriktirish → AI baho → dars.
// Baholangan yozuv `lessons` ga tushadi, shuning uchun dashboard va
// o'qituvchi profili eyeziyo bilan bir xil ishlaydi.
// ═══════════════════════════════════════════════════════════════
Object.assign(I, {
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
});

const RecordingsState = { q: "", status: "", page: 1, pageSize: 25 };

// Ijro etilayotgan blob URL — qayta render bo'lganda tozalanadi.
let currentAudioUrl = null;
function releaseAudioUrl() {
  if (currentAudioUrl) { URL.revokeObjectURL(currentAudioUrl); currentAudioUrl = null; }
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
function fmtDateTime(raw) {
  if (!raw) return "—";
  try {
    const s = String(raw);
    const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
    if (isNaN(d)) return s;
    return `${d.getDate()} ${UZ_MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return String(raw); }
}

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
const REC_IN_PROGRESS = ["queued", "downloading", "stored", "transcribing", "analyzing"];
const REC_CRITERIA = [
  ["topic_score", "Mavzu mosligi", "#2563EB"],
  ["speech_score", "Nutq tozaligi", "#06B6D4"],
  ["method_score", "Metodika", "#7C3AED"],
  ["interaction_score", "Interaktivlik", "#059669"],
  ["feedback_score", "Teskari aloqa", "#D97706"],
];

function recCriteriaHtml(an) {
  return `<div class="criteria-list">${REC_CRITERIA.map(([key, label, color]) => {
    const v = Number(an[key]) || 0;
    const pct = Math.min(100, Math.max(0, Math.round(v / 20 * 100)));
    const tag = pct >= 80 ? "A'lo" : pct >= 60 ? "Yaxshi" : pct >= 40 ? "O'rta" : "Zaif";
    const tagCls = pct >= 80 ? "success" : pct >= 60 ? "brand" : pct >= 40 ? "warning" : "danger";
    return `
    <div class="crit-row">
      <div class="crit-top">
        <span class="crit-name">${escapeHtml(label)} <span class="ai-tag ${tagCls}" style="font-size:10px;padding:1px 6px">${tag}</span></span>
        <span class="crit-val">${v}<span class="crit-max">/20</span></span>
      </div>
      <div class="crit-bar-wrap"><div class="crit-bar" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
  }).join("")}</div>`;
}

async function renderRecordings() {
  releaseAudioUrl();
  setBreadcrumbs([{ label: "Dashboard", route: "dashboard" }, { label: "Yozuvlar" }]);
  setMain(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Audio yozuvlar</h1>
        <div class="page-subtitle">Audiotap mikrofonlaridan kelgan dars yozuvlari — transkript, biriktirish, AI baho</div>
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
    const inProg = REC_IN_PROGRESS.reduce((a, s) => a + cnt(s), 0);
    const visible = Object.entries(c).filter(([k]) => k !== "skipped").reduce((a, [, n]) => a + Number(n || 0), 0);
    const total = Number(d.total) || 0;
    const totalPages = Math.max(1, Math.ceil(total / RecordingsState.pageSize));
    const page = Math.min(RecordingsState.page, totalPages);

    document.getElementById("rec-body").innerHTML = `
      <div class="kpi-grid">
        <div class="kpi kpi-clickable" data-st=""><div class="kpi-head"><div class="kpi-label">Jami yozuv</div><div class="kpi-icon blue">${I.mic}</div></div><div class="kpi-value">${visible}</div></div>
        <div class="kpi kpi-clickable" data-st="done"><div class="kpi-head"><div class="kpi-label">Tayyor</div><div class="kpi-icon green">${I.ok}</div></div><div class="kpi-value">${cnt("done")}</div></div>
        <div class="kpi kpi-clickable" data-st="in_progress"><div class="kpi-head"><div class="kpi-label">Jarayonda</div><div class="kpi-icon amber">${I.clock}</div></div><div class="kpi-value">${inProg}</div></div>
        <div class="kpi kpi-clickable" data-st="awaiting_assignment"><div class="kpi-head"><div class="kpi-label">Biriktirish kutilmoqda</div><div class="kpi-icon violet">${I.info}</div></div><div class="kpi-value">${cnt("awaiting_assignment")}</div></div>
        <div class="kpi kpi-clickable" data-st="failed"><div class="kpi-head"><div class="kpi-label">Xato</div><div class="kpi-icon red">${I.warn}</div></div><div class="kpi-value">${cnt("failed")}</div></div>
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
        RecordingsState.q || RecordingsState.status ? "Filtrlarni o'zgartirib ko'ring." : "Audiotap webhook'i sozlanganini va yozuv olinganini tekshiring (Sozlamalar)."
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
                  <tr data-open="${r.id}" style="cursor:pointer">
                    <td><div style="display:flex;align-items:center;gap:8px">
                      <div class="l-icon" style="width:28px;height:28px">${I.mic}</div>
                      <div><strong>${escapeHtml(r.source_display || r.source_name || "—")}</strong>
                        ${r.completeness === "partial" ? `<div class="sub" style="color:var(--warning)">Qismiy yozuv</div>` : ""}</div>
                    </div></td>
                    <td>${r.teacher_name ? escapeHtml(r.teacher_name) : '<span class="sub">Biriktirilmagan</span>'}</td>
                    <td>${r.subject_name ? `<span class="tag">${escapeHtml(r.subject_name)}</span> ` : ""}${escapeHtml(r.topic || "—")}${r.group_name ? ` <span class="sub">· ${escapeHtml(r.group_name)}</span>` : ""}</td>
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
    body.querySelectorAll("[data-st]").forEach(b => {
      b.style.cursor = "pointer";
      b.addEventListener("click", () => { RecordingsState.status = b.dataset.st; RecordingsState.page = 1; renderRecordings(); });
    });
    body.querySelectorAll("tr[data-open]").forEach(tr => {
      const go = () => route("recording", { id: parseInt(tr.dataset.open) });
      tr.addEventListener("click", go);
      makeRowAccessible(tr, go, "Yozuvni ochish");
    });
    body.querySelectorAll(".pagination [data-page]").forEach(b =>
      b.addEventListener("click", () => { RecordingsState.page = parseInt(b.dataset.page); renderRecordings(); }));
  } catch (err) {
    document.getElementById("rec-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
  }
}

// ── Yozuv detali ──
async function renderRecordingDetail(id) {
  releaseAudioUrl();
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
        ${r.lesson_id ? `<button class="btn-secondary btn-sm" id="d-lesson">${I.book} Dars detali</button>` : ""}
        ${r.r2_key ? `<button class="btn-secondary btn-sm" id="d-play">${I.play} Tinglash</button>
        <button class="btn-secondary btn-sm" id="d-dl">${I.download} Yuklab olish</button>` : ""}
        <button class="btn-secondary btn-sm" id="d-reproc">${I.refresh} ${tr ? "Qayta baholash" : r.r2_key ? "Qayta transkripsiya" : "Qayta yuklab olish"}</button>
        ${tr && r.r2_key ? `<button class="btn-ghost btn-sm" id="d-retranscribe">${I.refresh} Qayta transkripsiya</button>` : ""}
        <button class="btn-ghost btn-sm" id="d-del" style="color:var(--danger)">${I.trash} O'chirish</button>
      </div>
    </section>

    ${r.error ? `<div class="error show" style="margin-bottom:14px">${escapeHtml(r.error)}</div>` : ""}
    ${r.status === "awaiting_assignment" ? `<div class="cov-note" style="margin-bottom:14px">${I.info} Transkript tayyor. O'qituvchi, fan va mavzuni biriktiring — AI baholash avtomatik boshlanadi va dars ro'yxatga tushadi.</div>` : ""}
    ${r.status === "skipped" ? `<div class="cov-note" style="margin-bottom:14px">${I.warn} Bu artifact profili (${escapeHtml(r.profile || "—")}) qayta ishlanadigan profilga mos emas — audiotap'da "speech" profilini yoqing.</div>` : ""}
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
          ${an ? `${recCriteriaHtml(an)}${an.summary ? `<p style="margin-top:14px;font-size:13px;line-height:1.65">${escapeHtml(an.summary)}</p>` : ""}`
            : emptyStateHtml(
              r.status === "awaiting_assignment" ? "Biriktirish kutilmoqda" : "Baho hali tayyor emas",
              r.status === "awaiting_assignment" ? "O'qituvchi, fan va mavzu biriktirilgach AI avtomatik baholaydi." : "Qayta ishlash tugagach natija shu yerda chiqadi."
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
        <div class="ai-head"><span class="ai-badge">AI</span>
          <div><div class="card-title">Metodik tavsiyalar</div><div class="card-subtitle">${an.advice.length} ta tavsiya</div></div></div>
      </div>
      <div class="card-body" style="padding:0">
        ${an.advice.map((x, i) => `
          <div class="reco-row">
            <span class="reco-ico" style="color:${REC_CRITERIA[i % REC_CRITERIA.length][2]}">${I.info}</span>
            <div class="reco-body"><div class="reco-sub" style="color:var(--text)">${escapeHtml(x)}</div></div>
          </div>`).join("")}
      </div>
    </div>` : ""}

    ${tr ? `
    <div class="card" style="margin-bottom:18px">
      <div class="card-header">
        <div><div class="card-title">Transkript</div><div class="card-subtitle">${tr.word_count} so'z · ${tr.char_count} belgi${tr.model ? " · " + escapeHtml(tr.model) : ""}</div></div>
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
              <td>${e.status === "error" ? `<span class="tag" style="color:var(--danger)">xato</span>`
                  : e.status === "ok" ? `<span class="tag" style="color:var(--success)">ok</span>`
                  : `<span class="tag">${escapeHtml(e.status)}</span>`}</td>
              <td class="sub">${escapeHtml(e.message || "")}${e.duration_ms ? ` · ${(e.duration_ms / 1000).toFixed(1)}s` : ""}</td>
            </tr>`).join("")}
          </tbody>
        </table></div>` : emptyStateHtml("Jurnal bo'sh", "")}
      </div>
    </div>
  `);

  document.getElementById("d-assign").addEventListener("click", () => openAssignModal(r, () => renderRecordingDetail(id)));
  document.getElementById("d-lesson")?.addEventListener("click", () => openLessonDetailModal(r.lesson_id));

  const reprocess = async (from) => {
    try {
      await api(`/api/recordings/${id}/reprocess?from=${from}`, { method: "POST" });
      toast(from === "analyze" ? "Qayta baholash boshlandi" : from === "transcribe" ? "Qayta transkripsiya boshlandi" : "Qayta yuklab olish boshlandi", "success");
      setTimeout(() => renderRecordingDetail(id), 900);
    } catch (e) { toast(e.message, "error"); }
  };
  document.getElementById("d-reproc").addEventListener("click", () => reprocess(tr ? "analyze" : r.r2_key ? "transcribe" : "download"));
  document.getElementById("d-retranscribe")?.addEventListener("click", () => reprocess("transcribe"));

  document.getElementById("d-del").addEventListener("click", () =>
    confirmDelete("Yozuvni o'chirish", `#${id} yozuv, transkript, baho, audio va undan yaratilgan dars butunlay o'chiriladi.`, async () => {
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
  if (playBtn) playBtn.addEventListener("click", () => playRecording(id, r, playBtn));
  const dlBtn = document.getElementById("d-dl");
  if (dlBtn) dlBtn.addEventListener("click", () => downloadRecording(id, r, dlBtn));
}

/** Audio R2 dan admin token bilan olinadi — <audio src> to'g'ridan ishlamaydi, blob qilamiz. */
async function fetchRecordingBlob(id) {
  const res = await fetch(`${API}/api/recordings/${id}/audio`, { headers: { Authorization: `Bearer ${Auth.token}` } });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.blob();
}

async function playRecording(id, row, btn) {
  const old = btn.innerHTML;
  btn.disabled = true; btn.textContent = "Yuklanmoqda…";
  try {
    const blob = await fetchRecordingBlob(id);
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

async function downloadRecording(id, row, btn) {
  btn.disabled = true;
  try {
    const blob = await fetchRecordingBlob(id);
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

// ── Biriktirish: o'qituvchi (users) + fan (subjects) + guruh (groups_v2) + mavzu ──
async function openAssignModal(r, onDone) {
  let teachers = [], subjects = [], groups = [];
  try {
    [teachers, subjects, groups] = await Promise.all([
      api("/api/admin/teachers"),
      api("/api/admin/subjects").catch(() => []),
      api("/api/admin/groups").catch(() => []),
    ]);
  } catch (e) { toast(e.message, "error"); return; }
  if (!teachers.length) { toast("Avval O'qituvchilar bo'limida o'qituvchi qo'shing", "error"); return; }
  if (!subjects.length) { toast("Avval Fanlar bo'limida fan qo'shing", "error"); return; }

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
            ${teachers.map(t => `<option value="${t.user_id}" ${t.user_id === r.teacher_id ? "selected" : ""}>${escapeHtml(t.name)}${t.course_type ? ` — ${escapeHtml(t.course_type)}` : ""}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Fan *</span>
          <select name="subject_id" required>
            <option value="">— tanlang —</option>
            ${subjects.map(s => `<option value="${s.id}" ${s.id === r.subject_id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Guruh</span>
          <select name="group_id">
            <option value="">— tanlanmagan —</option>
            ${groups.map(g => `<option value="${g.id}" ${g.id === r.group_id ? "selected" : ""}>${escapeHtml(g.name)}${g.parent_name ? ` (${escapeHtml(g.parent_name)})` : ""}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Guruh nomi (ro'yxatda bo'lmasa)</span>
          <input type="text" name="group_name" maxlength="60" value="${escapeAttr(r.group_id ? "" : (r.group_name || ""))}" placeholder="Masalan: 210-21">
        </label>
        <label class="field">
          <span class="label">Dars mavzusi *</span>
          <input type="text" name="topic" required maxlength="200" value="${escapeAttr(r.topic || "")}" placeholder="Masalan: Algoritmlar nazariyasi. Saralash usullari">
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

// ── Birinchi admin (login sahifasidagi havola) ──
function openBootstrapModal() {
  const { modal, close } = openModal("bootstrap-modal", `
    <div class="modal-card" role="dialog">
      <div class="modal-head"><h3>Birinchi administratorni yaratish</h3><button class="modal-close">${I.close}</button></div>
      <form id="bs-form" class="modal-body">
        <p class="muted" style="margin-bottom:12px">Faqat tizim birinchi marta sozlanayotganda (foydalanuvchilar bo'sh bo'lsa) ishlaydi.</p>
        <label class="field"><span class="label">Ism *</span><input type="text" name="name" required maxlength="80" placeholder="Ism Familiya"></label>
        <label class="field"><span class="label">Email *</span><input type="email" name="email" required placeholder="admin@tuit.uz"></label>
        <label class="field"><span class="label">Parol * (kamida 8 belgi)</span><input type="password" name="password" required minlength="8"></label>
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

// ── Xona (audiotap manbasi) tahrirlash — "Xonalar" sahifasidan ──
function openSourceModal(s, onDone) {
  if (!s) return;
  const { modal, close } = openModal("src-modal", `
    <div class="modal-card" role="dialog">
      <div class="modal-head"><h3>Xonani tahrirlash</h3><button class="modal-close">${I.close}</button></div>
      <form id="src-form" class="modal-body">
        <label class="field"><span class="label">Audiotap nomi</span><input type="text" value="${escapeAttr(s.audiotap_name || s.name)}" disabled></label>
        <label class="field"><span class="label">Ko'rsatiladigan nom *</span><input type="text" name="display_name" required maxlength="80" value="${escapeAttr(s.display_name || "")}" placeholder="Masalan: 204-auditoriya"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="field"><span class="label">Bino</span><input type="text" name="building" maxlength="60" value="${escapeAttr(s.building || "")}" placeholder="A bino"></label>
          <label class="field"><span class="label">Xona raqami</span><input type="text" name="room" maxlength="30" value="${escapeAttr(s.room || "")}" placeholder="204"></label>
        </div>
        <label class="remember-row"><input type="checkbox" name="active" ${s.active ? "checked" : ""}><span>Faol</span></label>
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

// ── Sozlamalar sahifasiga audiotap/konveyer kartalari (renderSettings oxirida chaqiriladi) ──
async function injectAudiotapSettings() {
  const main = document.getElementById("main-content");
  if (!main) return;
  const box = document.createElement("div");
  box.id = "audiotap-settings";
  box.style.marginTop = "16px";
  box.innerHTML = skeletonBlock(200);
  main.appendChild(box);

  let sys;
  try { sys = await api("/api/system"); }
  catch (err) { box.innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`; return; }

  const ok = (v) => v ? `<span class="tag" style="color:var(--success)">${I.ok} O'rnatilgan</span>` : `<span class="tag" style="color:var(--danger)">${I.xmark} O'rnatilmagan</span>`;
  const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid var(--border);align-items:center"><span class="sub">${escapeHtml(k)}</span><span style="text-align:right">${v}</span></div>`;
  const counts = sys.counts || {};
  const order = ["queued", "downloading", "stored", "transcribing", "awaiting_assignment", "analyzing", "done", "failed", "skipped"];
  const u = Auth.user || {};

  box.innerHTML = `
    <div class="dash-grid">
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">Audiotap webhook</div><div class="card-subtitle">Audio capture server shu manzilga hodisa yuboradi</div></div>
          ${sys.secrets?.webhook ? `<span class="pill success">Tayyor</span>` : `<span class="pill danger">Secret yo'q</span>`}
        </div>
        <div class="card-body">
          <label class="field"><span class="label">Webhook URL</span>
            <div class="password-row">
              <input type="text" value="${escapeAttr(sys.webhook_url)}" readonly style="font-family:'JetBrains Mono',monospace;font-size:12.5px">
              <button type="button" class="pw-toggle" id="copy-webhook" title="Nusxalash">${I.copy}</button>
            </div>
          </label>
          ${row("Hodisa turi", `<span class="tag">recording.available</span>`)}
          ${row("Imzo secret'i", ok(sys.secrets?.webhook))}
          ${row("Qayta ishlanadigan profil", `<span class="tag">${escapeHtml(sys.vars?.target_profile || "speech")}</span>`)}
          ${row("Audiotap manzili", `<span class="tag" style="${sys.audiotap_base_is_local ? "color:var(--danger)" : ""}">${escapeHtml(sys.vars?.audiotap_base_url || "—")}</span>`)}
          ${row("Oxirgi webhook", `<b>${fmtDateTime(sys.last_webhook_at)}</b>`)}
          ${row("Bazaga yozilmay qolganlar (R2 zaxira)", sys.pending_webhooks > 0
            ? `<span class="tag" style="color:var(--warning)">${sys.pending_webhooks} ta</span> <button class="btn-secondary btn-sm" id="replay-btn">${I.refresh} Qayta ishlash</button>`
            : sys.pending_webhooks === -1 ? `<span class="tag muted">noma'lum</span>` : `<span class="tag" style="color:var(--success)">yo'q</span>`)}
          ${!sys.last_webhook_at ? `<div class="cov-note" style="margin-top:12px">${I.info} Hali birorta webhook kelmagan. Audiotap'da webhook target yaratib, yuqoridagi URL va secret'ni kiriting.</div>` : ""}
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">AI konveyer</div><div class="card-subtitle">Gemini STT + 5 mezonli baholash</div></div>
          ${sys.secrets?.gemini_key ? `<span class="pill success">Faol</span>` : `<span class="pill danger">Kalit yo'q</span>`}
        </div>
        <div class="card-body">
          ${row("Gemini modeli", `<span class="tag">${escapeHtml(sys.vars?.gemini_model || "—")}</span>`)}
          ${row("GEMINI_API_KEY", ok(sys.secrets?.gemini_key))}
          ${row("Maksimal audio hajmi", `<b>${escapeHtml(sys.vars?.max_ingest_mb || "90")} MB</b>`)}
          <div class="kpi-grid" style="margin-top:14px">
            ${order.filter(k => counts[k] != null || ["done", "failed", "awaiting_assignment"].includes(k)).map(k => {
              const st = REC_STATUS[k] || { label: k, color: "var(--text-faint)" };
              return `<div class="kpi kpi-clickable" data-st="${k}"><div class="kpi-head"><div class="kpi-label" style="color:${st.color}">${escapeHtml(st.label)}</div></div><div class="kpi-value">${counts[k] || 0}</div></div>`;
            }).join("")}
          </div>
        </div>
      </div>
    </div>
    <div class="card" style="max-width:640px;margin-top:16px">
      <div class="card-header"><div><div class="card-title">${I.lock} Parolni o'zgartirish</div><div class="card-subtitle">${escapeHtml(u.email || "")}</div></div></div>
      <form id="pw-form" class="card-body">
        <label class="field"><span class="label">Joriy parol</span><input type="password" name="current_password" required autocomplete="current-password"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="field"><span class="label">Yangi parol (8+)</span><input type="password" name="new_password" required minlength="8" autocomplete="new-password"></label>
          <label class="field"><span class="label">Takrorlang</span><input type="password" name="confirm" required minlength="8" autocomplete="new-password"></label>
        </div>
        <div class="error" id="pw-err"></div>
        <div class="modal-actions" style="padding-top:4px"><button type="submit" class="btn-primary btn-sm">${I.ok} Saqlash</button></div>
      </form>
    </div>
  `;

  box.querySelectorAll(".kpi-clickable[data-st]").forEach(el => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => { RecordingsState.status = el.dataset.st; RecordingsState.page = 1; RecordingsState.q = ""; route("recordings"); });
  });
  document.getElementById("copy-webhook")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(sys.webhook_url); toast("Webhook URL nusxalandi", "success"); }
    catch { toast("Nusxalab bo'lmadi — qo'lda belgilab oling", "error"); }
  });
  document.getElementById("replay-btn")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const r = await api("/api/system/replay-webhooks", { method: "POST" });
      toast(`Qayta ishlandi: ${r.replayed} ta${r.failed ? `, xato: ${r.failed}` : ""}`, r.failed ? "error" : "success", 6000);
      renderSettings();
    } catch (ex) { toast(ex.message, "error"); e.target.disabled = false; }
  });
  const pwForm = document.getElementById("pw-form");
  pwForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("pw-err");
    err.classList.remove("show");
    if (pwForm.new_password.value !== pwForm.confirm.value) { err.textContent = "Yangi parollar mos kelmadi"; err.classList.add("show"); return; }
    try {
      await api("/api/me/password", { method: "POST", body: JSON.stringify({ current_password: pwForm.current_password.value, new_password: pwForm.new_password.value }) });
      toast("Parol o'zgartirildi", "success");
      pwForm.reset();
    } catch (ex) { err.textContent = ex.message; err.classList.add("show"); }
  });
}


function openSubjectModal(existing) {
  const isEdit = existing != null;
  const cfg = currentConfig();
  const isSchool = AppState.institution?.type === "school";

  const { modal, close } = openModal("sub-modal", `
    <div class="modal-card" role="dialog">
      <div class="modal-head">
        <h3>${isEdit ? "Fanni tahrirlash" : "Yangi fan"}</h3>
        <button class="modal-close">${I.close}</button>
      </div>
      <form id="sub-form" class="modal-body">
        <label class="field">
          <span class="label">Fan nomi *</span>
          <input type="text" name="name" required maxlength="100" value="${escapeAttr(existing?.name || "")}" placeholder="Masalan: Matematika">
        </label>
        <label class="field">
          <span class="label">Qisqa nom</span>
          <input type="text" name="short_name" maxlength="20" value="${escapeAttr(existing?.short_name || "")}" placeholder="MAT">
        </label>
        <label class="field">
          <span class="label">Kredit/soat</span>
          <input type="number" name="credit_hours" min="0" max="500" value="${existing?.credit_hours || 0}">
        </label>
        ${isSchool ? `
          <label class="field">
            <span class="label">Qaysi sinflarga (vergul bilan, masalan: 5,6,7)</span>
            <input type="text" name="grades" maxlength="100" value="${escapeAttr((existing?.applicable_grades || []).join(","))}" placeholder="5,6,7,8,9">
          </label>
        ` : ""}
        <div class="error" id="sub-error"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="sub-cancel">Bekor qilish</button>
          <button type="submit" class="btn-primary">${isEdit ? "Saqlash" : "Qo'shish"}</button>
        </div>
      </form>
    </div>
  `);
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("#sub-cancel").addEventListener("click", close);

  const form = modal.querySelector("#sub-form");
  const errorEl = modal.querySelector("#sub-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.remove("show");
    try {
      const payload = {
        name: form.name.value.trim(),
        short_name: form.short_name.value.trim(),
        credit_hours: parseInt(form.credit_hours.value) || 0,
      };
      if (isSchool && form.grades) {
        payload.applicable_grades = form.grades.value.split(",").map(s => parseInt(s.trim())).filter(Number.isInteger);
      }
      if (isEdit) {
        await api(`/api/admin/subjects/${existing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast("Saqlandi", "success");
      } else {
        await api("/api/admin/subjects", { method: "POST", body: JSON.stringify(payload) });
        toast("Fan qo'shildi", "success");
      }
      close();
      renderSubjects();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.add("show");
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// EVALUATION QUESTIONS
// ═══════════════════════════════════════════════════════════════
const EvalState = { q: "", filterScope: "all" };

async function renderEvalQuestions() {
  setBreadcrumbs([{ label: "Dashboard", route: "dashboard" }, { label: "Baholash savollari" }]);
  setMain(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Baholash savollari</h1>
        <div class="page-subtitle">Talaba dars yakunidan keyin baholash uchun ko'radigan savollar</div>
      </div>
      <div class="page-actions">
        <button class="btn-secondary btn-sm" id="eval-refresh">${I.refresh} Yangilash</button>
        <button class="btn-primary btn-sm" id="eval-add">${I.add} Yangi savol</button>
      </div>
    </div>
    <div id="eval-body">${skeletonBlock(300)}</div>
  `);
  document.getElementById("eval-refresh").addEventListener("click", () => renderEvalQuestions());
  document.getElementById("eval-add").addEventListener("click", () => openEvalQuestionModal(null));

  try {
    const cfg = currentConfig();
    const [questions, subjects] = await Promise.all([
      api("/api/admin/evaluation-questions"),
      cfg.hasSubjects ? api("/api/admin/subjects").catch(() => []) : Promise.resolve([]),
    ]);

    const q = EvalState.q.toLowerCase();
    let filtered = q ? questions.filter(x => x.text.toLowerCase().includes(q)) : questions;
    if (EvalState.filterScope === "global") filtered = filtered.filter(x => !x.subject_ids || x.subject_ids.length === 0);
    else if (EvalState.filterScope === "subject") filtered = filtered.filter(x => x.subject_ids && x.subject_ids.length > 0);

    document.getElementById("eval-body").innerHTML = `
      <div class="filters-bar">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="eval-search" placeholder="Savol matni..." value="${escapeAttr(EvalState.q)}">
        </div>
        <div class="filter-pills">
          <button class="pill ${EvalState.filterScope === "all" ? "active" : ""}" data-scope="all">Hammasi (${questions.length})</button>
          <button class="pill ${EvalState.filterScope === "global" ? "active" : ""}" data-scope="global">Umumiy (${questions.filter(x => !x.subject_ids || x.subject_ids.length === 0).length})</button>
          <button class="pill ${EvalState.filterScope === "subject" ? "active" : ""}" data-scope="subject">Fanga oid (${questions.filter(x => x.subject_ids && x.subject_ids.length > 0).length})</button>
        </div>
      </div>
      ${filtered.length === 0 ? emptyStateHtml("Savollar topilmadi", "Yangi savol qo'shing — talabaga dars yakunidan keyin ko'rinadi.") : `
        <div class="card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width:40px">#</th>
                  <th>Savol</th>
                  <th>Qamrov</th>
                  <th class="num">Shkala</th>
                  <th class="num">Javoblar</th>
                  <th class="num">O'rt. ball</th>
                  <th class="num">Status</th>
                  <th class="num" style="width:120px">Amal</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map((q, i) => `
                  <tr>
                    <td class="num" style="color:var(--text-muted)">${i + 1}</td>
                    <td>
                      <div style="font-weight:500">${escapeHtml(q.text)}</div>
                    </td>
                    <td>
                      ${!q.subject_ids || q.subject_ids.length === 0
                        ? `<span class="tag" style="background:var(--brand-50);color:var(--brand)">Barcha fanlar</span>`
                        : q.subject_names.map(n => `<span class="tag" style="margin:2px 4px 2px 0;display:inline-block">${escapeHtml(n)}</span>`).join("")}
                    </td>
                    <td class="num">1–${q.scale}</td>
                    <td class="num">${q.response_count || 0}</td>
                    <td class="num">${q.avg_rating != null ? `<strong style="color:var(--brand)">${q.avg_rating}</strong>` : "—"}</td>
                    <td class="num">
                      ${q.active
                        ? `<span class="tag" style="background:var(--success-50);color:var(--success)">Faol</span>`
                        : `<span class="tag" style="background:var(--bg-subtle);color:var(--text-muted)">O'chirilgan</span>`}
                    </td>
                    <td class="num">
                      <button class="btn-icon eval-edit" data-id="${q.id}" title="Tahrirlash">${I.edit}</button>
                      <button class="btn-icon eval-del" data-id="${q.id}" style="color:var(--danger)" title="O'chirish">${I.trash}</button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;

    document.getElementById("eval-search").addEventListener("input", debounce((e) => { EvalState.q = e.target.value; renderEvalQuestions(); }, 150));
    document.querySelectorAll(".filter-pills .pill").forEach((b) => {
      b.addEventListener("click", () => { EvalState.filterScope = b.dataset.scope; renderEvalQuestions(); });
    });

    const body = document.getElementById("eval-body");
    body.querySelectorAll(".eval-edit").forEach((b) => {
      b.addEventListener("click", () => {
        const item = filtered.find((x) => x.id === parseInt(b.dataset.id));
        openEvalQuestionModal(item, subjects);
      });
    });
    body.querySelectorAll(".eval-del").forEach((b) => {
      b.addEventListener("click", () => {
        const item = filtered.find((x) => x.id === parseInt(b.dataset.id));
        confirmDelete(
          "Savolni o'chirasizmi?",
          `"${item.text}" — barcha javoblar bilan o'chiriladi.`,
          async () => {
            await api(`/api/admin/evaluation-questions/${item.id}`, { method: "DELETE" });
            toast("Savol o'chirildi", "success");
            renderEvalQuestions();
          }
        );
      });
    });
  } catch (err) {
    document.getElementById("eval-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
  }
}

function openEvalQuestionModal(existing, subjects = null) {
  const isEdit = existing != null;
  const cfg = currentConfig();
  const hasSubjects = cfg.hasSubjects;
  const selectedIds = new Set(existing?.subject_ids || []);

  // Lazy-fetch subjects if not provided
  const subjectsPromise = subjects != null ? Promise.resolve(subjects)
    : (hasSubjects ? api("/api/admin/subjects").catch(() => []) : Promise.resolve([]));

  subjectsPromise.then((subjList) => {
    const subjectCheckboxes = subjList.map((s) => `
      <label style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:13px;transition:background .1s">
        <input type="checkbox" name="subject_ids" value="${s.id}" ${selectedIds.has(s.id) ? "checked" : ""} style="accent-color:var(--brand,#3b82f6);flex-shrink:0;width:16px;height:16px;cursor:pointer">
        <span style="line-height:1.3">${escapeHtml(s.name)}</span>
      </label>
    `).join("");

    const { modal, close } = openModal("eval-modal", `
      <div class="modal-card modal-form" role="dialog">
        <div class="modal-head">
          <h3>${isEdit ? "Savolni tahrirlash" : "Yangi baholash savoli"}</h3>
          <button class="modal-close">${I.close}</button>
        </div>
        <form id="eval-form" class="modal-body">
          <label class="field">
            <span class="label">Savol matni *</span>
            <textarea name="text" required maxlength="300" rows="2" placeholder="Masalan: O'qituvchining mavzuni tushuntirish darajasini baholang">${escapeHtml(existing?.text || "")}</textarea>
            <span class="hint">Talabaga dars yakunidan keyin ko'rinadi. Pastida 1 dan shkala raqamigacha tugmalar chiqadi.</span>
          </label>
          ${hasSubjects && subjList.length > 0 ? `
            <div class="field">
              <span class="label">Qamrov (fanlar)</span>
              <div id="eval-subj-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:6px;display:grid;grid-template-columns:repeat(2,1fr);gap:0">
                ${subjectCheckboxes}
              </div>
              <span class="hint">Hech biri tanlanmasa — barcha fanlarga tegishli (umumiy). Bir yoki bir nechta fan tanlasangiz — faqat shu fan darslarida ko'rinadi.</span>
            </div>
          ` : ""}
          <div class="grid-2">
            <label class="field">
              <span class="label">Shkala (tugmalar soni)</span>
              <input type="number" name="scale" min="2" max="10" value="${existing?.scale || 5}">
              <span class="hint">2–10 oralig'ida (default: 5)</span>
            </label>
            <label class="field">
              <span class="label">Tartib</span>
              <input type="number" name="sort_order" value="${existing?.sort_order || 0}">
              <span class="hint">Kichik raqam — yuqorida ko'rinadi</span>
            </label>
          </div>
          <label class="field-row" style="display:flex;align-items:center;gap:10px;padding:8px 0">
            <input type="checkbox" name="active" id="eval-active" ${existing?.active === 0 ? "" : "checked"}>
            <label for="eval-active" style="cursor:pointer;font-size:14px">Faol (talabaga ko'rinadi)</label>
          </label>
          <div class="error" id="eval-error"></div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" id="eval-cancel">Bekor qilish</button>
            <button type="submit" class="btn-primary">${isEdit ? "Saqlash" : "Qo'shish"}</button>
          </div>
        </form>
      </div>
    `);
    modal.querySelector(".modal-close").addEventListener("click", close);
    modal.querySelector("#eval-cancel").addEventListener("click", close);

    const form = modal.querySelector("#eval-form");
    const errorEl = modal.querySelector("#eval-error");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.classList.remove("show");
      try {
        const checkedBoxes = form.querySelectorAll('input[name="subject_ids"]:checked');
        const subjectIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
        const payload = {
          text: form.text.value.trim(),
          scale: parseInt(form.scale.value) || 5,
          sort_order: parseInt(form.sort_order.value) || 0,
          active: form.active.checked,
          subject_ids: subjectIds,
        };
        if (isEdit) {
          await api(`/api/admin/evaluation-questions/${existing.id}`, { method: "PUT", body: JSON.stringify(payload) });
          toast("Saqlandi", "success");
        } else {
          await api("/api/admin/evaluation-questions", { method: "POST", body: JSON.stringify(payload) });
          toast("Savol qo'shildi", "success");
        }
        close();
        renderEvalQuestions();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add("show");
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// GROUPS (v2)
// ═══════════════════════════════════════════════════════════════
const GroupsState = { q: "", parentFilter: "" };

async function renderGroups() {
  const cfg = currentConfig();
  const parentLevel = cfg.levels[cfg.levels.length - 1]; // groups attach to deepest level
  const groupLabel = cfg.groupLabel === "Bo'lim" ? "Bo'limlar" : "Guruhlar";

  setBreadcrumbs([{ label: "Dashboard", route: "dashboard" }, { label: groupLabel }]);
  setMain(`
    <div class="page-header">
      <div>
        <h1 class="page-title">${groupLabel}</h1>
        <div class="page-subtitle">${cfg.groupLabel} ro'yxati, tayinlangan o'qituvchilar va o'quvchilar</div>
      </div>
      <div class="page-actions">
        <button class="btn-secondary btn-sm" id="g-refresh">${I.refresh} Yangilash</button>
        <button class="btn-primary btn-sm" id="g-add">${I.add} Yangi ${cfg.groupLabel.toLowerCase()}</button>
      </div>
    </div>
    <div id="g-body">${skeletonBlock(400)}</div>
  `);

  document.getElementById("g-refresh").addEventListener("click", () => renderGroups());
  document.getElementById("g-add").addEventListener("click", () => openGroupModal(null));

  try {
    const [groups, parents] = await Promise.all([
      api("/api/admin/groups"),
      api(`/api/admin/hierarchy?type=${parentLevel.key}`).catch(() => []),
    ]);

    const q = GroupsState.q.toLowerCase();
    let filtered = groups;
    if (q) filtered = filtered.filter(g => g.name.toLowerCase().includes(q));
    if (GroupsState.parentFilter) filtered = filtered.filter(g => String(g.parent_node_id) === GroupsState.parentFilter);

    document.getElementById("g-body").innerHTML = `
      <div class="filters-bar">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="g-search" placeholder="Guruh nomi..." value="${escapeAttr(GroupsState.q)}">
        </div>
        <select id="g-parent">
          <option value="">Barcha ${escapeHtml(parentLevel.plural.toLowerCase())}</option>
          ${parents.map(p => `<option value="${p.id}" ${String(p.id) === GroupsState.parentFilter ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
        </select>
        <div class="spacer"></div>
      </div>
      ${filtered.length === 0 ? emptyStateHtml(`${groupLabel} topilmadi`, `Yangi ${cfg.groupLabel.toLowerCase()} qo'shing.`) : `
        <div class="card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>${escapeHtml(parentLevel.label)}</th>
                  <th>Jadval</th>
                  <th class="num">O'qituvchilar</th>
                  <th class="num">O'quvchilar</th>
                  <th class="num">Darslar</th>
                  <th class="num">O'rtacha ball</th>
                  <th class="num" style="width:120px">Amal</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(g => {
                  const avg = Number(g.avg_score || 0);
                  const col = g.lesson_count > 0 ? scoreColor(avg) : "muted";
                  return `
                  <tr data-gid="${g.id}" style="cursor:pointer">
                    <td><div style="display:flex;align-items:center;gap:8px">
                      <div class="l-icon" style="width:28px;height:28px">${I.groups}</div>
                      <strong>${escapeHtml(g.name)}</strong>
                    </div></td>
                    <td>${escapeHtml(g.parent_name || "—")}</td>
                    <td><span class="tag">${escapeHtml(g.schedule || "—")}</span></td>
                    <td class="num">${g.teacher_count || 0}</td>
                    <td class="num">${g.student_count || 0}</td>
                    <td class="num">${g.lesson_count || 0}</td>
                    <td class="num"><span class="score-chip ${col}">${g.lesson_count > 0 ? avg + "%" : "—"}</span></td>
                    <td class="num">
                      <button class="btn-icon g-edit" data-id="${g.id}" title="Tahrirlash">${I.edit}</button>
                      <button class="btn-icon g-del" data-id="${g.id}" style="color:var(--danger)" title="O'chirish">${I.trash}</button>
                    </td>
                  </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;

    document.getElementById("g-search").addEventListener("input", debounce((e) => { GroupsState.q = e.target.value; renderGroups(); }, 150));
    document.getElementById("g-parent").addEventListener("change", (e) => { GroupsState.parentFilter = e.target.value; renderGroups(); });

    const body = document.getElementById("g-body");
    body.querySelectorAll("tr[data-gid]").forEach(tr => {
      const go = (e) => {
        if (e.target.closest(".btn-icon")) return;
        route("group", { id: parseInt(tr.dataset.gid) });
      };
      tr.addEventListener("click", go);
      makeRowAccessible(tr, go, "Guruhni ochish");
    });
    body.querySelectorAll(".g-edit").forEach(b => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const g = filtered.find(x => x.id === parseInt(b.dataset.id));
        openGroupModal(g);
      });
    });
    body.querySelectorAll(".g-del").forEach(b => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const g = filtered.find(x => x.id === parseInt(b.dataset.id));
        confirmDelete("Guruhni o'chirasizmi?", `"${g.name}" va unga bog'liq o'qituvchi/o'quvchi biriktirishlari o'chiriladi.`, async () => {
          await api(`/api/admin/groups/${g.id}`, { method: "DELETE" });
          toast("O'chirildi", "success");
          renderGroups();
        });
      });
    });
  } catch (err) {
    document.getElementById("g-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
  }
}

const WEEK_DAYS = [
  { key: "Du", full: "Dushanba" },
  { key: "Se", full: "Seshanba" },
  { key: "Ch", full: "Chorshanba" },
  { key: "Pa", full: "Payshanba" },
  { key: "Ju", full: "Juma" },
  { key: "Sh", full: "Shanba" },
  { key: "Ya", full: "Yakshanba" },
];

function parseSchedule(raw) {
  // Format: "Du, Ch, Ju · 14:00–16:00" or "Du, Ch · 14:00" or legacy "Du/Ch/Ju 14:00"
  const empty = { days: [], from: "", to: "" };
  if (!raw) return empty;
  const parsed = { ...empty };
  // Extract times (HH:MM[–HH:MM])
  const timeMatch = raw.match(/(\d{1,2}:\d{2})\s*[–\-~]\s*(\d{1,2}:\d{2})|(\d{1,2}:\d{2})/);
  if (timeMatch) {
    if (timeMatch[1] && timeMatch[2]) { parsed.from = timeMatch[1]; parsed.to = timeMatch[2]; }
    else if (timeMatch[3]) { parsed.from = timeMatch[3]; }
  }
  // Extract day codes
  const dayCodes = WEEK_DAYS.map(d => d.key);
  const foundDays = [];
  for (const code of dayCodes) {
    const re = new RegExp(`\\b${code}\\b`, "g");
    if (re.test(raw)) foundDays.push(code);
  }
  parsed.days = foundDays;
  return parsed;
}

function hourSelect(id, selected) {
  const sel = String(selected || "").padStart(2, "0");
  const opts = ['<option value="">--</option>'];
  for (let h = 0; h < 24; h++) {
    const v = String(h).padStart(2, "0");
    opts.push(`<option value="${v}" ${v === sel ? "selected" : ""}>${v}</option>`);
  }
  return `<select class="sched-select" id="${id}">${opts.join("")}</select>`;
}

function minuteSelect(id, selected) {
  const sel = String(selected || "").padStart(2, "0");
  const opts = ['<option value="">--</option>'];
  for (let m = 0; m < 60; m += 5) {
    const v = String(m).padStart(2, "0");
    opts.push(`<option value="${v}" ${v === sel ? "selected" : ""}>${v}</option>`);
  }
  // Ensure the selected value is present even if not on 5-min grid
  if (sel && !opts.some(o => o.includes(`value="${sel}"`))) {
    opts.splice(1, 0, `<option value="${sel}" selected>${sel}</option>`);
  }
  return `<select class="sched-select" id="${id}">${opts.join("")}</select>`;
}

function buildSchedule({ days, from, to }) {
  if (days.length === 0 && !from) return "";
  const daysPart = days.join(", ");
  let timePart = "";
  if (from && to) timePart = `${from}–${to}`;
  else if (from) timePart = from;
  if (daysPart && timePart) return `${daysPart} · ${timePart}`;
  return daysPart || timePart;
}

function openGroupModal(existing) {
  const isEdit = existing != null;
  const cfg = currentConfig();
  const parentLevel = cfg.levels[cfg.levels.length - 1];
  const initialSchedule = parseSchedule(existing?.schedule || "");

  const { modal, close } = openModal("g-modal", `
    <div class="modal-card modal-form" role="dialog">
      <div class="modal-head">
        <h3>${isEdit ? "Guruhni tahrirlash" : `Yangi ${cfg.groupLabel.toLowerCase()}`}</h3>
        <button class="modal-close">${I.close}</button>
      </div>
      <form id="g-form" class="modal-body">
        <label class="field">
          <span class="label">${escapeHtml(parentLevel.label)} *</span>
          <select name="parent_node_id" required>
            <option value="">Yuklanmoqda...</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Guruh nomi *</span>
          <input type="text" name="name" required maxlength="80" value="${escapeAttr(existing?.name || "")}" placeholder="Masalan: BE-23-01">
        </label>

        <div class="field">
          <span class="label">Jadval <span style="color:var(--text-faint);font-weight:400">(ixtiyoriy)</span></span>
          <div class="schedule-picker">
            <div class="sched-days" id="sched-days">
              ${WEEK_DAYS.map(d => `
                <button type="button" class="sched-day ${initialSchedule.days.includes(d.key) ? 'selected' : ''}" data-day="${d.key}" title="${d.full}">${d.key}</button>
              `).join("")}
            </div>
            <div class="sched-times">
              <div class="sched-time">
                <span class="sched-time-lbl">Boshlanish</span>
                <div class="sched-time-row">
                  ${hourSelect("sched-from-h", initialSchedule.from?.split(":")[0])}
                  <span class="sched-colon">:</span>
                  ${minuteSelect("sched-from-m", initialSchedule.from?.split(":")[1])}
                </div>
              </div>
              <span class="sched-sep">—</span>
              <div class="sched-time">
                <span class="sched-time-lbl">Tugash</span>
                <div class="sched-time-row">
                  ${hourSelect("sched-to-h", initialSchedule.to?.split(":")[0])}
                  <span class="sched-colon">:</span>
                  ${minuteSelect("sched-to-m", initialSchedule.to?.split(":")[1])}
                </div>
              </div>
            </div>
            <div class="sched-preview" id="sched-preview"></div>
          </div>
        </div>

        <label class="field">
          <span class="label">Boshlanish sanasi <span style="color:var(--text-faint);font-weight:400">(ixtiyoriy)</span></span>
          <input type="date" name="start_date" value="${escapeAttr(existing?.start_date || "")}">
        </label>
        <div class="error" id="g-error"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="g-cancel">Bekor qilish</button>
          <button type="submit" class="btn-primary">${isEdit ? "Saqlash" : "Qo'shish"}</button>
        </div>
      </form>
    </div>
  `);
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("#g-cancel").addEventListener("click", close);

  // Load parent options
  api(`/api/admin/hierarchy?type=${parentLevel.key}`).then(parents => {
    const sel = modal.querySelector("[name=parent_node_id]");
    sel.innerHTML = `<option value="">— tanlang —</option>` + parents.map(p => {
      const sel = existing?.parent_node_id === p.id ? "selected" : "";
      return `<option value="${p.id}" ${sel}>${escapeHtml(p.name)}</option>`;
    }).join("");
  });

  // Schedule picker wiring
  const preview = modal.querySelector("#sched-preview");
  const fromH = modal.querySelector("#sched-from-h");
  const fromM = modal.querySelector("#sched-from-m");
  const toH = modal.querySelector("#sched-to-h");
  const toM = modal.querySelector("#sched-to-m");
  const joinTime = (h, m) => (h && m) ? `${h}:${m}` : "";
  const getScheduleState = () => ({
    days: [...modal.querySelectorAll(".sched-day.selected")].map(b => b.dataset.day),
    from: joinTime(fromH.value, fromM.value),
    to: joinTime(toH.value, toM.value),
  });
  const updatePreview = () => {
    const built = buildSchedule(getScheduleState());
    preview.textContent = built ? `Natija: ${built}` : "Kun va vaqtni tanlang";
    preview.classList.toggle("empty", !built);
  };
  modal.querySelectorAll(".sched-day").forEach(b => {
    b.addEventListener("click", () => { b.classList.toggle("selected"); updatePreview(); });
  });
  [fromH, fromM, toH, toM].forEach(el => el.addEventListener("change", updatePreview));
  updatePreview();

  const form = modal.querySelector("#g-form");
  const errorEl = modal.querySelector("#g-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.remove("show");
    try {
      const payload = {
        name: form.name.value.trim(),
        parent_node_id: parseInt(form.parent_node_id.value) || null,
        schedule: buildSchedule(getScheduleState()),
        start_date: form.start_date.value,
      };
      if (!payload.parent_node_id) throw new Error(`${parentLevel.label} tanlang`);
      if (isEdit) {
        await api(`/api/admin/groups/${existing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast("Saqlandi", "success");
      } else {
        await api("/api/admin/groups", { method: "POST", body: JSON.stringify(payload) });
        toast("Guruh qo'shildi", "success");
      }
      close();
      renderGroups();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.add("show");
    }
  });
}

async function renderGroup(id) {
  const cfg = currentConfig();
  setBreadcrumbs([
    { label: "Dashboard", route: "dashboard" },
    { label: cfg.groupLabel === "Bo'lim" ? "Bo'limlar" : "Guruhlar", route: "groups" },
    { label: "Detail" },
  ]);
  setMain(`<div id="g-detail">${skeletonBlock(300)}</div>`);
  try {
    const g = await api(`/api/admin/groups/${id}`);
    setBreadcrumbs([
      { label: "Dashboard", route: "dashboard" },
      { label: cfg.groupLabel === "Bo'lim" ? "Bo'limlar" : "Guruhlar", route: "groups" },
      { label: g.name },
    ]);
    const stats = g.stats || {};
    const maxTeacherScore = g.teachers.reduce((m, t) => Math.max(m, Number(t.avg_score || 0)), 0) || 100;

    document.getElementById("g-detail").innerHTML = `
      <section class="detail-header">
        <div class="detail-avatar" style="background:linear-gradient(135deg,#0891B2,#2563EB)">${escapeHtml(g.name.substring(0, 2).toUpperCase())}</div>
        <div class="detail-info">
          <div class="name">${escapeHtml(g.name)}</div>
          <div class="course">${escapeHtml(g.parent_name || "—")}</div>
          ${g.schedule ? `<div class="email">${escapeHtml(g.schedule)}</div>` : ""}
          <div class="detail-pills">
            <span class="detail-pill">${I.teachers} ${g.teachers.length} o'qituvchi</span>
            <span class="detail-pill">${I.students} ${g.students.length} o'quvchi</span>
            <span class="detail-pill">${I.mic} ${stats.lesson_count || 0} dars</span>
            ${stats.avg_score > 0 ? `<span class="detail-pill">${I.trophy} O'rtacha ${stats.avg_score}%</span>` : ""}
            ${g.start_date ? `<span class="detail-pill">${I.cal} ${escapeHtml(g.start_date)}</span>` : ""}
          </div>
        </div>
      </section>

      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">Jami darslar</div><div class="kpi-icon blue">${I.mic}</div></div><div class="kpi-value">${stats.lesson_count || 0}</div></div>
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">O'rtacha ball</div><div class="kpi-icon green">${I.trophy}</div></div><div class="kpi-value">${stats.lesson_count > 0 ? stats.avg_score + "%" : "—"}</div></div>
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">Jami vaqt</div><div class="kpi-icon amber">${I.clock}</div></div><div class="kpi-value">${stats.total_minutes || 0} <span style="font-size:14px;color:var(--text-subtle);font-weight:500">min</span></div></div>
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">Test urinishlari</div><div class="kpi-icon violet">${I.quiz}</div></div><div class="kpi-value">${stats.test_attempts || 0}</div></div>
      </div>

      <div class="section-title"><div><h2>O'qituvchilar va ularning ulushi</h2><div class="sub">${g.teachers.length} ta o'qituvchi · har birining bu guruhdagi natijasi</div></div></div>
      ${g.teachers.length === 0 ? emptyStateHtml("Hali o'qituvchi biriktirilmagan", "O'qituvchilar sahifasida biriktirishingiz mumkin.") : `
        <div class="card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>O'qituvchi</th>
                  <th>Fan(lar)</th>
                  <th class="num">Darslar</th>
                  <th class="num">Vaqt (min)</th>
                  <th>Ulush</th>
                  <th class="num">O'rtacha ball</th>
                </tr>
              </thead>
              <tbody>
                ${g.teachers.map(t => {
                  const avg = Number(t.avg_score || 0);
                  const col = t.lesson_count > 0 ? scoreColor(avg) : "muted";
                  const share = maxTeacherScore > 0 ? Math.max(4, (avg / maxTeacherScore) * 100) : 0;
                  const colVar = col === 'success' ? 'var(--success)' : col === 'warning' ? 'var(--warning)' : col === 'danger' ? 'var(--danger)' : 'var(--text-faint)';
                  return `
                    <tr data-tid="${t.id}">
                      <td><div class="cell-person">
                        <div class="avatar"${avatarStyle(t.name)}>${escapeHtml(t.avatar || t.name.substring(0, 2).toUpperCase())}</div>
                        <div class="p-info"><div class="p-name">${escapeHtml(t.name)}</div><div class="p-email">${escapeHtml(t.email)}</div></div>
                      </div></td>
                      <td><span class="tag">${escapeHtml(t.subjects || "—")}</span></td>
                      <td class="num">${t.lesson_count || 0}</td>
                      <td class="num">${t.total_minutes || 0}</td>
                      <td style="min-width:140px">
                        <div class="rank-bar-wrap">
                          <div class="rank-bar" style="width:${share}%;background:${colVar}"></div>
                        </div>
                      </td>
                      <td class="num"><span class="score-chip ${col}">${t.lesson_count > 0 ? avg + "%" : "—"}</span></td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `}

      <div class="section-title" style="margin-top:20px"><div><h2>O'quvchilar</h2><div class="sub">${g.students.length} ta${stats.test_attempts > 0 ? ` · ${stats.test_attempts} test urinishi, o'rtacha ${stats.avg_test_score}%` : ""}</div></div></div>
      ${g.students.length === 0 ? emptyStateHtml("Hali o'quvchi biriktirilmagan", "O'quvchi qo'shayotganda guruhni tanlang.") : `
        <div class="card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>O'quvchi</th></tr></thead>
              <tbody>
                ${g.students.map(s => `
                  <tr data-sid="${s.id}">
                    <td><div class="cell-person">
                      <div class="avatar"${avatarStyle(s.name)}>${escapeHtml(s.avatar || s.name[0].toUpperCase())}</div>
                      <div class="p-info"><div class="p-name">${escapeHtml(s.name)}</div><div class="p-email">${escapeHtml(s.email)}</div></div>
                    </div></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;
    document.querySelectorAll("[data-tid]").forEach(el => {
      const go = () => route("teacher", { id: parseInt(el.dataset.tid) });
      el.addEventListener("click", go);
      if (el.tagName === "TR") makeRowAccessible(el, go, "O'qituvchi profilini ochish");
    });
    document.querySelectorAll("[data-sid]").forEach(el => {
      const go = () => route("student", { id: parseInt(el.dataset.sid) });
      el.addEventListener("click", go);
      if (el.tagName === "TR") makeRowAccessible(el, go, "O'quvchi profilini ochish");
    });
  } catch (err) {
    document.getElementById("g-detail").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// TEACHERS
// ═══════════════════════════════════════════════════════════════
const TeachersState = {
  data: [], q: "", group: "", subject: "", sort: "score", view: "table", page: 1, pageSize: 10,
};

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
  document.getElementById("add-teacher-btn").addEventListener("click", openAddTeacherModal);
  document.getElementById("t-refresh").addEventListener("click", () => renderTeachers());

  try {
    const teachers = await api("/api/admin/teachers");
    TeachersState.data = teachers;
    TeachersState.page = 1;
    renderTeachersBody();
  } catch (err) {
    document.getElementById("t-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
  }
}

function renderTeachersBody() {
  const body = document.getElementById("t-body");
  const { data, q, group, subject, sort, view, page, pageSize } = TeachersState;

  const groups = [...new Set(data.flatMap(t => (t.groups || []).map(g => typeof g === "string" ? g : g.name)))].filter(Boolean).sort();
  const subjects = [...new Set(data.map(t => t.course_type).filter(Boolean))].sort();

  let filtered = data.filter(t => {
    if (q && !`${t.name} ${t.email}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (group && !(t.groups || []).some(g => (typeof g === "string" ? g : g.name) === group)) return false;
    if (subject && t.course_type !== subject) return false;
    return true;
  });
  filtered.sort((a, b) => {
    // Darsi (demo darslari) bor o'qituvchilar doim ro'yxat boshida turadi
    const aHas = (a.total_lessons || 0) > 0 ? 1 : 0;
    const bHas = (b.total_lessons || 0) > 0 ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    if (sort === "score") return b.average_score - a.average_score;
    if (sort === "lessons") return b.total_lessons - a.total_lessons;
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "duration") return (b.total_duration_minutes || 0) - (a.total_duration_minutes || 0);
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const topScore = data.reduce((m, t) => Math.max(m, t.average_score || 0), 0);

  body.innerHTML = `
    <div class="filters-bar">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="flt-search" placeholder="Ism yoki email..." value="${escapeAttr(q)}">
      </div>
      <select id="flt-group">
        <option value="">Barcha guruhlar</option>
        ${groups.map(g => `<option value="${escapeAttr(g)}" ${g === group ? "selected" : ""}>${escapeHtml(g)}</option>`).join("")}
      </select>
      <select id="flt-subject">
        <option value="">Barcha fanlar</option>
        ${subjects.map(s => `<option value="${escapeAttr(s)}" ${s === subject ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
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
      ${filtered.length === 0 ? emptyStateHtml("O'qituvchilar topilmadi", "Filterlarni o'zgartiring yoki yangi o'qituvchi qo'shing.") :
        view === "table" ? teachersTableHtml(pageData, topScore) : teachersCardHtml(pageData, topScore)}
    </div>
    ${filtered.length > pageSize ? paginationHtml(currentPage, totalPages, filtered.length, pageSize) : ""}
  `;

  document.getElementById("flt-search").addEventListener("input", debounce((e) => { TeachersState.q = e.target.value; TeachersState.page = 1; renderTeachersBody(); }, 150));
  document.getElementById("flt-group").addEventListener("change", (e) => { TeachersState.group = e.target.value; TeachersState.page = 1; renderTeachersBody(); });
  document.getElementById("flt-subject").addEventListener("change", (e) => { TeachersState.subject = e.target.value; TeachersState.page = 1; renderTeachersBody(); });
  document.getElementById("flt-sort").addEventListener("change", (e) => { TeachersState.sort = e.target.value; renderTeachersBody(); });
  document.getElementById("view-table").addEventListener("click", () => { TeachersState.view = "table"; renderTeachersBody(); });
  document.getElementById("view-card").addEventListener("click", () => { TeachersState.view = "card"; renderTeachersBody(); });

  body.querySelectorAll(".pagination [data-page]").forEach(b => b.addEventListener("click", () => { TeachersState.page = parseInt(b.dataset.page); renderTeachersBody(); }));
  body.querySelectorAll("[data-tid]").forEach(el => {
    const go = (e) => {
      if (e.target.closest(".btn-icon")) return;
      route("teacher", { id: parseInt(el.dataset.tid) });
    };
    el.addEventListener("click", go);
    if (el.tagName === "TR") makeRowAccessible(el, go, "O'qituvchi profilini ochish");
  });
  body.querySelectorAll(".t-edit").forEach(b => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = data.find(x => x.user_id === parseInt(b.dataset.id));
      if (t) openEditTeacherModal(t);
    });
  });
  body.querySelectorAll(".t-del").forEach(b => {
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const t = data.find(x => x.user_id === parseInt(b.dataset.id));
      if (!t) return;
      confirmDelete(
        "O'qituvchini o'chirasizmi?",
        `${t.name} va uning ${t.total_lessons} ta darsi, barcha baholari butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi.`,
        async () => {
          await api(`/api/admin/teachers/${t.user_id}`, { method: "DELETE" });
          toast("O'qituvchi o'chirildi", "success");
          renderTeachers();
        }
      );
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
              <th>Fan</th>
              <th>Guruhlar</th>
              <th class="num">Darslar</th>
              <th class="num">Vaqt (min)</th>
              <th>Oxirgi dars</th>
              <th class="num">O'rtacha ball</th>
              <th class="num">Amallar</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(t => {
              const col = scoreColor(t.average_score);
              const isTop = t.average_score === topScore && topScore > 0;
              const gs = (t.groups || []).map(g => typeof g === "string" ? g : g.name);
              return `
                <tr data-tid="${t.user_id}">
                  <td><div class="cell-person">
                    <div class="avatar"${avatarStyle(t.name)}>${escapeHtml(t.avatar || t.name.substring(0, 2).toUpperCase())}</div>
                    <div class="p-info"><div class="p-name">${escapeHtml(t.name)} ${isTop ? '<span style="color:#F59E0B">★</span>' : ''}</div><div class="p-email">${escapeHtml(t.email)}</div></div>
                  </div></td>
                  <td><span class="tag">${escapeHtml(t.course_type || "—")}</span></td>
                  <td><div class="cell-tags">
                    ${gs.slice(0, 3).map(g => `<span class="tag">${escapeHtml(g)}</span>`).join("")}
                    ${gs.length > 3 ? `<span class="tag muted">+${gs.length - 3}</span>` : ""}
                    ${gs.length === 0 ? `<span class="tag muted">guruh yo'q</span>` : ""}
                  </div></td>
                  <td class="num">${t.total_lessons}</td>
                  <td class="num">${t.total_duration_minutes || 0}</td>
                  <td><span style="color:var(--text-subtle);font-size:12.5px">${fmtDate(t.last_lesson_date)}</span></td>
                  <td class="num"><span class="score-chip ${col}">${t.average_score}%</span></td>
                  <td class="num">
                    <button class="btn-icon t-edit" data-id="${t.user_id}" title="Tahrirlash">${I.edit}</button>
                    <button class="btn-icon t-del" data-id="${t.user_id}" style="color:var(--danger)" title="O'chirish">${I.trash}</button>
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

function teachersCardHtml(list, topScore) {
  return `
    <div class="card-grid">
      ${list.map((t, i) => {
        const col = scoreColor(t.average_score);
        const isTop = t.average_score === topScore && topScore > 0;
        const gs = (t.groups || []).map(g => typeof g === "string" ? g : g.name);
        return `
          <div style="position:relative">
            <button class="person-card" data-tid="${t.user_id}">
              <div class="pc-top">
                <div class="pc-avatar"${avatarStyle(t.name)}>${escapeHtml(t.avatar || t.name.substring(0, 2).toUpperCase())}</div>
                <div class="pc-info"><div class="pc-name">${escapeHtml(t.name)}</div><div class="pc-meta">${escapeHtml(t.course_type || "O'qituvchi")}</div></div>
                <div class="pc-rank ${i < 3 ? 'r' + (i + 1) : ''}">${isTop ? '★ ' : ''}#${i + 1}</div>
              </div>
              <div class="pc-tags">
                ${gs.slice(0, 4).map(g => `<span class="tag">${escapeHtml(g)}</span>`).join("") || `<span class="tag muted">guruh yo'q</span>`}
              </div>
              <div class="pc-stats">
                <div class="pc-stat"><div class="v">${t.total_lessons}</div><div class="l">Darslar</div></div>
                <div class="pc-stat"><div class="v ${col}">${t.average_score}%</div><div class="l">O'rtacha ball</div></div>
              </div>
            </button>
            <button class="btn-icon t-del" data-id="${t.user_id}" title="O'chirish"
              style="position:absolute;top:10px;right:44px;color:var(--danger);background:var(--bg-elev,#fff);border-radius:6px">${I.trash}</button>
          </div>`;
      }).join("")}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// STUDENTS
// ═══════════════════════════════════════════════════════════════
const StudentsState = { data: [], allGroups: [], q: "", group: "", sort: "score", view: "table", page: 1, pageSize: 10 };

async function renderStudents() {
  setBreadcrumbs([{ label: "Dashboard", route: "dashboard" }, { label: "O'quvchilar" }]);
  setMain(`
    <div class="page-header">
      <div>
        <h1 class="page-title">O'quvchilar</h1>
        <div class="page-subtitle">Barcha o'quvchilar va test natijalari</div>
      </div>
      <div class="page-actions">
        <button class="btn-secondary btn-sm" id="s-refresh">${I.refresh} Yangilash</button>
        <button class="btn-primary btn-sm" id="add-student-btn">${I.add} Yangi o'quvchi</button>
      </div>
    </div>
    <div id="s-body">${skeletonBlock(400)}</div>
  `);
  document.getElementById("s-refresh").addEventListener("click", () => renderStudents());
  document.getElementById("add-student-btn").addEventListener("click", () => openAddStudentModal(null));

  try {
    const [students, teachers, groupsV2] = await Promise.all([
      api("/api/admin/students"),
      api("/api/admin/teachers"),
      api("/api/admin/groups").catch(() => []),
    ]);
    StudentsState.data = students;
    // combine legacy groups (from teachers) + groups_v2 into picker
    const legacy = [...new Set(teachers.flatMap(t => (t.groups || []).map(g => typeof g === "string" ? g : g.name)))].filter(Boolean);
    StudentsState.allGroups = [...new Set([...legacy, ...groupsV2.map(g => g.name)])].sort();
    window.__allGroups = StudentsState.allGroups;
    window.__groupsV2 = groupsV2;
    StudentsState.page = 1;
    renderStudentsBody();
  } catch (err) {
    document.getElementById("s-body").innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
  }
}

function renderStudentsBody() {
  const body = document.getElementById("s-body");
  const { data, q, group, sort, view, page, pageSize } = StudentsState;
  const groups = [...new Set(data.flatMap(s => s.groups || []))].filter(Boolean).sort();

  let filtered = data.filter(s => {
    if (q && !`${s.name} ${s.email}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (group && !(s.groups || []).includes(group)) return false;
    return true;
  });
  filtered.sort((a, b) => {
    if (sort === "score") return (b.avg_score || 0) - (a.avg_score || 0);
    if (sort === "attempts") return (b.attempts_count || 0) - (a.attempts_count || 0);
    if (sort === "name") return a.name.localeCompare(b.name);
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageData = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  body.innerHTML = `
    <div class="filters-bar">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="flt-search" placeholder="Ism yoki email..." value="${escapeAttr(q)}">
      </div>
      <select id="flt-group">
        <option value="">Barcha guruhlar</option>
        ${groups.map(g => `<option value="${escapeAttr(g)}" ${g === group ? "selected" : ""}>${escapeHtml(g)}</option>`).join("")}
      </select>
      <select id="flt-sort">
        <option value="score" ${sort === "score" ? "selected" : ""}>O'rtacha ball</option>
        <option value="attempts" ${sort === "attempts" ? "selected" : ""}>Urinishlar</option>
        <option value="name" ${sort === "name" ? "selected" : ""}>Ism</option>
      </select>
      <div class="spacer"></div>
      <div class="view-toggle">
        <button id="view-table" class="${view === "table" ? "active" : ""}">${I.tableView} Jadval</button>
        <button id="view-card" class="${view === "card" ? "active" : ""}">${I.gridView} Karta</button>
      </div>
    </div>
    <div id="s-content">
      ${filtered.length === 0 ? emptyStateHtml("O'quvchilar topilmadi", "Filterlarni o'zgartiring yoki yangi o'quvchi qo'shing.") :
        view === "table" ? studentsTableHtml(pageData) : studentsCardHtml(pageData)}
    </div>
    ${filtered.length > pageSize ? paginationHtml(currentPage, totalPages, filtered.length, pageSize) : ""}
  `;

  document.getElementById("flt-search").addEventListener("input", debounce((e) => { StudentsState.q = e.target.value; StudentsState.page = 1; renderStudentsBody(); }, 150));
  document.getElementById("flt-group").addEventListener("change", (e) => { StudentsState.group = e.target.value; StudentsState.page = 1; renderStudentsBody(); });
  document.getElementById("flt-sort").addEventListener("change", (e) => { StudentsState.sort = e.target.value; renderStudentsBody(); });
  document.getElementById("view-table").addEventListener("click", () => { StudentsState.view = "table"; renderStudentsBody(); });
  document.getElementById("view-card").addEventListener("click", () => { StudentsState.view = "card"; renderStudentsBody(); });

  body.querySelectorAll(".pagination [data-page]").forEach(b => b.addEventListener("click", () => { StudentsState.page = parseInt(b.dataset.page); renderStudentsBody(); }));
  body.querySelectorAll("[data-sid]").forEach(el => {
    const go = () => route("student", { id: parseInt(el.dataset.sid) });
    el.addEventListener("click", go);
    if (el.tagName === "TR") makeRowAccessible(el, go, "O'quvchi profilini ochish");
  });
}

function studentsTableHtml(list) {
  return `
    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>O'quvchi</th>
              <th>Guruhlar</th>
              <th class="num">Urinishlar</th>
              <th>Oxirgi urinish</th>
              <th class="num">O'rtacha ball</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(s => {
              const col = s.attempts_count === 0 ? "muted" : scoreColor(s.avg_score);
              return `
                <tr data-sid="${s.id}">
                  <td><div class="cell-person">
                    <div class="avatar"${avatarStyle(s.name)}>${escapeHtml((s.avatar || s.name.substring(0, 1)).toUpperCase())}</div>
                    <div class="p-info"><div class="p-name">${escapeHtml(s.name)}</div><div class="p-email">${escapeHtml(s.email)}</div></div>
                  </div></td>
                  <td><div class="cell-tags">
                    ${(s.groups || []).slice(0, 3).map(g => `<span class="tag">${escapeHtml(g)}</span>`).join("")}
                    ${(s.groups || []).length > 3 ? `<span class="tag muted">+${s.groups.length - 3}</span>` : ""}
                    ${(s.groups || []).length === 0 ? `<span class="tag muted">guruhsiz</span>` : ""}
                  </div></td>
                  <td class="num">${s.attempts_count}</td>
                  <td><span style="color:var(--text-subtle);font-size:12.5px">${fmtDate(s.last_attempt_at)}</span></td>
                  <td class="num"><span class="score-chip ${col}">${s.attempts_count > 0 ? s.avg_score + "%" : "—"}</span></td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function studentsCardHtml(list) {
  return `
    <div class="card-grid">
      ${list.map(s => {
        const col = s.attempts_count === 0 ? "muted" : scoreColor(s.avg_score);
        return `
          <button class="person-card" data-sid="${s.id}">
            <div class="pc-top">
              <div class="pc-avatar"${avatarStyle(s.name)}>${escapeHtml((s.avatar || s.name.substring(0, 1)).toUpperCase())}</div>
              <div class="pc-info"><div class="pc-name">${escapeHtml(s.name)}</div><div class="pc-meta">${escapeHtml(s.email)}</div></div>
            </div>
            <div class="pc-tags">
              ${(s.groups || []).slice(0, 4).map(g => `<span class="tag">${escapeHtml(g)}</span>`).join("") || `<span class="tag muted">guruhsiz</span>`}
            </div>
            <div class="pc-stats">
              <div class="pc-stat"><div class="v">${s.attempts_count}</div><div class="l">Testlar</div></div>
              <div class="pc-stat"><div class="v ${col}">${s.attempts_count > 0 ? s.avg_score + "%" : "—"}</div><div class="l">O'rtacha</div></div>
            </div>
          </button>`;
      }).join("")}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// TEACHER / STUDENT DETAIL
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
    const [d, assign] = await Promise.all([
      api(`/api/admin/teachers/${id}/detail`),
      api(`/api/admin/teachers/${id}/assignments`).catch(() => ({ subjects: [], groups: [] })),
    ]);
    setBreadcrumbs([
      { label: "Dashboard", route: "dashboard" },
      { label: "O'qituvchilar", route: "teachers" },
      { label: d.name },
    ]);

    body.innerHTML = `
      <section class="detail-header">
        <div class="detail-avatar"${avatarStyle(d.name)}>${escapeHtml(d.avatar || d.name.substring(0, 2).toUpperCase())}</div>
        <div class="detail-info">
          <div class="name">${escapeHtml(d.name)}</div>
          <div class="course">${escapeHtml(d.course_type || "O'qituvchi")}</div>
          <div class="email">${escapeHtml(d.email)}</div>
          <div class="detail-pills">
            <span class="detail-pill">${I.trophy} O'rtacha ${d.average_score}%</span>
            <span class="detail-pill">${I.mic} ${d.total_lessons} dars</span>
            <span class="detail-pill">${I.groups} ${assign.groups.length} guruh</span>
            <span class="detail-pill">${I.subjects} ${assign.subjects.length} fan</span>
          </div>
        </div>
        <div class="detail-actions">
          <button class="btn-secondary btn-sm" id="edit-teacher-btn">${I.edit} Tahrirlash</button>
          <button class="btn-secondary btn-sm" id="assign-teacher-btn">${I.add} Biriktirish</button>
          <button class="btn-ghost btn-sm" id="delete-teacher-btn" style="color:var(--danger)">${I.trash} O'chirish</button>
        </div>
      </section>

      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">O'rtacha ball</div><div class="kpi-icon green">${I.trending}</div></div><div class="kpi-value">${d.average_score}%</div></div>
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">Jami darslar</div><div class="kpi-icon blue">${I.mic}</div></div><div class="kpi-value">${d.total_lessons}</div></div>
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">Jami vaqt</div><div class="kpi-icon amber">${I.clock}</div></div><div class="kpi-value">${d.total_duration_minutes || 0} <span style="font-size:14px;color:var(--text-subtle);font-weight:500">min</span></div></div>
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">Biriktirilgan guruhlar</div><div class="kpi-icon violet">${I.groups}</div></div><div class="kpi-value">${assign.groups.length}</div></div>
      </div>

      ${currentConfig().hasSubjects ? `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <div><div class="card-title">Biriktirilgan fanlar</div><div class="card-subtitle">${assign.subjects.length} ta fan</div></div>
          </div>
          <div class="card-body">
            ${assign.subjects.length === 0 ? `<div class="groups-empty">Hozircha fan biriktirilmagan</div>` : `
              <div class="groups-list">
                ${assign.subjects.map(s => `<div class="group-chip"><span>${escapeHtml(s.name)}${s.short_name ? ` <small>· ${escapeHtml(s.short_name)}</small>` : ""}</span></div>`).join("")}
              </div>
            `}
          </div>
        </div>
      ` : ""}

      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <div><div class="card-title">Biriktirilgan guruhlar</div><div class="card-subtitle">${assign.groups.length} ta guruh</div></div>
        </div>
        <div class="card-body">
          ${assign.groups.length === 0 ? `<div class="groups-empty">Hozircha guruh biriktirilmagan. Yuqorida "Biriktirish" tugmasini bosing.</div>` : `
            <div class="groups-list">
              ${assign.groups.map(g => `<div class="group-chip">
                <span>${escapeHtml(g.name)}${g.subject_name ? ` <small>· ${escapeHtml(g.subject_name)}</small>` : ""}${g.parent_name ? ` <small style="opacity:0.7">(${escapeHtml(g.parent_name)})</small>` : ""}</span>
              </div>`).join("")}
            </div>
          `}
        </div>
      </div>

      ${d.group_stats.length > 0 ? `
        <div class="section-title"><div><h2>Guruhlar kesimida (dars statistikasi)</h2><div class="sub">Dars natijalari bo'yicha</div></div></div>
        <div class="gstat-grid">
          ${d.group_stats.map(g => {
            const col = scoreColor(g.average_score);
            const colVar = col === 'success' ? 'var(--success)' : col === 'warning' ? 'var(--warning)' : 'var(--danger)';
            return `
              <div class="gstat-card">
                <div class="gtop">
                  <div class="gbadge">${I.book}</div>
                  <div class="ginfo"><div class="gname">${escapeHtml(g.group_name)}</div><div class="gcourse">${escapeHtml(g.course_type || "—")}</div></div>
                  <div class="gscore">${g.average_score}%</div>
                </div>
                <div class="progress"><div class="progress-fill" style="width:${g.average_score}%;background:${colVar}"></div></div>
                <div class="gmeta"><span>${I.mic} ${g.total_lessons} dars</span><span>${I.clock} ${g.total_duration_minutes} min</span><span>${I.cal} ${fmtDate(g.last_lesson_date)}</span></div>
              </div>`;
          }).join("")}
        </div>
      ` : ""}

      <div class="section-title" style="margin-top:20px"><div><h2>Oxirgi darslar</h2><div class="sub">${d.lessons.length} ta dars</div></div></div>
      ${d.lessons.length === 0 ? emptyStateHtml("Darslar yo'q", "Bu o'qituvchi hali dars o'tkazmagan.") : `
        <div class="lessons-list">
          ${d.lessons.slice(0, 30).map(l => {
            const col = l.score > 0 ? scoreColor(l.score) : "muted";
            const startDate = l.created_at ? new Date(l.created_at) : null;
            const durSec = l.duration_seconds || 0;
            const endDate = startDate && durSec > 0 ? new Date(startDate.getTime() + durSec * 1000) : null;
            const fmtTime = (dt) => dt ? dt.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
            const dateStr = startDate ? startDate.toLocaleDateString("uz-UZ", { year: "numeric", month: "short", day: "numeric" }) : "—";
            const timeStr = startDate ? (fmtTime(startDate) + (endDate ? " – " + fmtTime(endDate) : "")) : "";
            return `
              <div class="lesson-row" data-lesson-id="${l.id}" style="cursor:pointer" title="Batafsil ko'rish">
                <div class="l-icon">${I.mic}</div>
                <div class="l-main"><div class="l-title">${escapeHtml(l.topic || "Dars")}</div><div class="l-sub">${escapeHtml(l.group_name)}</div></div>
                <div class="l-date"><div style="font-size:12.5px;color:var(--text)">${dateStr}</div><div style="font-size:11px;color:var(--text-subtle)">${timeStr}</div></div>
                <div class="l-meta">${I.clock} ${Math.round(durSec / 60)} min</div>
                <span class="score-chip ${col}">${l.score > 0 ? l.score + "%" : "—"}</span>
              </div>`;
          }).join("")}
        </div>
      `}
    `;
    document.getElementById("edit-teacher-btn").addEventListener("click", () => openEditTeacherModal(d));
    document.getElementById("assign-teacher-btn").addEventListener("click", () => openAssignTeacherModal(d, assign));
    document.getElementById("delete-teacher-btn").addEventListener("click", () => openDeleteTeacherConfirm(d));
    body.querySelectorAll(".lesson-row[data-lesson-id]").forEach(row => {
      row.addEventListener("click", () => openLessonDetailModal(parseInt(row.dataset.lessonId)));
    });
  } catch (err) {
    body.innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
    toast(err.message, "error");
  }
}

async function renderStudent(id) {
  setBreadcrumbs([
    { label: "Dashboard", route: "dashboard" },
    { label: "O'quvchilar", route: "students" },
    { label: "Detail" },
  ]);
  setMain(`<div id="s-detail">${skeletonBlock(300)}</div>`);
  const body = document.getElementById("s-detail");
  try {
    const d = await api(`/api/admin/students/${id}`);
    setBreadcrumbs([
      { label: "Dashboard", route: "dashboard" },
      { label: "O'quvchilar", route: "students" },
      { label: d.name },
    ]);
    body.innerHTML = `
      <section class="detail-header">
        <div class="detail-avatar"${avatarStyle(d.name)}>${escapeHtml((d.avatar || d.name.substring(0, 1)).toUpperCase())}</div>
        <div class="detail-info">
          <div class="name">${escapeHtml(d.name)}</div>
          <div class="course">${(d.groups || []).join(" · ") || "Guruhsiz"}</div>
          <div class="email">${escapeHtml(d.email)}</div>
          <div class="detail-pills">
            <span class="detail-pill">${I.quiz} ${d.total_attempts} test</span>
            <span class="detail-pill">${I.trophy} O'rtacha ${d.average_score}%</span>
            <span class="detail-pill">${I.book} ${d.pending_lessons} kutilmoqda</span>
          </div>
        </div>
        <div class="detail-actions">
          <button class="btn-secondary btn-sm" id="edit-student-btn">${I.edit} Tahrirlash</button>
          <button class="btn-ghost btn-sm" id="delete-student-btn" style="color:var(--danger)">${I.trash} O'chirish</button>
        </div>
      </section>

      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">Bajarilgan testlar</div><div class="kpi-icon blue">${I.quiz}</div></div><div class="kpi-value">${d.total_attempts}</div></div>
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">O'rtacha natija</div><div class="kpi-icon green">${I.trophy}</div></div><div class="kpi-value">${d.average_score}%</div></div>
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">Kutilayotgan</div><div class="kpi-icon amber">${I.book}</div></div><div class="kpi-value">${d.pending_lessons}</div></div>
        <div class="kpi"><div class="kpi-head"><div class="kpi-label">Guruhlar</div><div class="kpi-icon violet">${I.groups}</div></div><div class="kpi-value">${(d.groups || []).length}</div></div>
      </div>

      ${(d.group_stats || []).length > 0 ? `
        <div class="section-title"><div><h2>Guruhlar kesimida</h2><div class="sub">Har guruh bo'yicha natija</div></div></div>
        <div class="gstat-grid">
          ${d.group_stats.map(g => {
            const col = g.attempts > 0 ? scoreColor(g.avg_score) : "muted";
            const colVar = col === 'success' ? 'var(--success)' : col === 'warning' ? 'var(--warning)' : col === 'danger' ? 'var(--danger)' : 'var(--text-faint)';
            return `
              <div class="gstat-card">
                <div class="gtop">
                  <div class="gbadge">${I.book}</div>
                  <div class="ginfo"><div class="gname">${escapeHtml(g.group_name)}</div><div class="gcourse">${g.attempts}/${g.total_lessons} ta test bajarilgan</div></div>
                  <div class="gscore">${g.attempts > 0 ? g.avg_score + "%" : "—"}</div>
                </div>
                <div class="progress"><div class="progress-fill" style="width:${g.total_lessons > 0 ? (g.attempts / g.total_lessons * 100) : 0}%;background:${colVar}"></div></div>
                <div class="gmeta">
                  <span>${I.quiz} ${g.attempts} urinish</span>
                  <span>${I.book} ${g.pending} kutilmoqda</span>
                  <span>${I.cal} ${fmtDate(g.last_attempt_at)}</span>
                </div>
              </div>`;
          }).join("")}
        </div>
      ` : ""}

      ${(d.recent_trend || []).length > 1 ? `
        <div class="section-title" style="margin-top:20px"><div><h2>Natija trendi</h2><div class="sub">Oxirgi ${d.recent_trend.length} ta test</div></div></div>
        <div class="card chart-card" style="margin-bottom:20px">
          <div class="chart-wrap">
            ${lineChart(d.recent_trend.map(r => r.score))}
          </div>
        </div>
      ` : ""}

      <div class="section-title"><div><h2>Test natijalari</h2><div class="sub">${d.attempts.length} ta urinish</div></div></div>
      ${d.attempts.length === 0 ? emptyStateHtml("Hali testlar bajarilmagan", "Bu o'quvchi hali biron test topshirmagan.") : `
        <div class="lessons-list">
          ${d.attempts.map(a => {
            const col = scoreColor(a.score);
            return `<div class="lesson-row">
              <div class="l-icon">${I.quiz}</div>
              <div class="l-main"><div class="l-title">${escapeHtml(a.topic || "Dars")}</div><div class="l-sub">${escapeHtml(a.group_name || "")} · ${escapeHtml(a.teacher_name || "")} · ${fmtDate(a.completed_at)}</div></div>
              <span class="score-chip ${col}">${a.score}%</span>
            </div>`;
          }).join("")}
        </div>
      `}
    `;
    document.getElementById("edit-student-btn").addEventListener("click", () => openAddStudentModal(d));
    document.getElementById("delete-student-btn").addEventListener("click", () => openDeleteStudentConfirm(d));
  } catch (err) {
    body.innerHTML = `<div class="error show">${escapeHtml(err.message)}</div>`;
    toast(err.message, "error");
  }
}

// ═══════════════════════════════════════════════════════════════
// LESSON DETAIL MODAL
// ═══════════════════════════════════════════════════════════════
async function openLessonDetailModal(lessonId) {
  const { modal, close } = openModal("lesson-detail-modal", `
    <div class="modal-card la-modal" role="dialog">
      <div class="modal-body la-body">${skeletonBlock(260)}</div>
    </div>
  `);

  try {
    const d = await api(`/api/admin/lessons/${lessonId}`);
    const cfg = currentConfig();
    const e = d.ai_evaluation;
    const durMin = Math.round((d.duration_seconds || 0) / 60);
    const overallCol = e ? cssScoreColor(e.overall_score) : "var(--text-subtle)";

    // ── helpers ──────────────────────────────────────────────
    function scoreBar(value, label, delay, max = 100) {
      const val = Math.max(0, Math.min(max, Math.round(value || 0)));
      const ratio = max > 0 ? val / max : 0;
      const col = ratio >= 0.7 ? "var(--success)" : ratio >= 0.5 ? "var(--warning)" : "var(--danger)";
      return `<div class="la-score">
        <div class="la-score-head"><span class="l">${escapeHtml(label)}</span><span class="v" style="color:${col}">${val}<span class="max">/${max}</span></span></div>
        <div class="la-score-track"><div class="la-score-fill" style="width:${Math.round(ratio * 100)}%;background:${col};animation-delay:${delay}ms"></div></div>
      </div>`;
    }
    function infoRow(icon, label, value) {
      if (!value) return "";
      return `<div class="la-info-row">
        <span class="la-info-ico">${icon}</span>
        <span class="la-info-lbl">${escapeHtml(label)}</span>
        <span class="la-info-val">${escapeHtml(String(value))}</span>
      </div>`;
    }

    // ── hero meta pills ──────────────────────────────────────
    const metaPills = [
      d.teacher_name ? `<span class="la-pill">${I.teachers}${escapeHtml(d.teacher_name)}</span>` : "",
      d.group_name ? `<span class="la-pill">${I.groups}${escapeHtml(d.group_name)}</span>` : "",
      `<span class="la-pill">${I.clock}${durMin} daqiqa</span>`,
      `<span class="la-pill">${I.cal}${fmtDate(d.created_at)}</span>`,
    ].filter(Boolean).join("");

    // ── left: Dars ma'lumotlari ──────────────────────────────
    const infoCard = `
      <div class="la-card">
        <div class="la-card-title"><span class="la-ico" style="background:var(--brand-50);color:var(--brand)">${I.book}</span> Dars ma'lumotlari</div>
        ${infoRow(I.book, cfg.hasSubjects ? "Fan" : "Yo'nalish", d.course_type)}
        ${infoRow(I.teachers, "O'qituvchi", d.teacher_name)}
        ${infoRow(I.groups, cfg.groupLabel || "Guruh", d.group_name)}
        ${infoRow(I.clock, "Davomiyligi", durMin + " daqiqa")}
        ${infoRow(I.cal, "Sana", fmtDate(d.created_at))}
        ${d.student_evaluations && d.student_evaluations.length ? infoRow(I.students, "Baholagan talabalar", (d.student_evaluations[0]?.count || 0) + " nafar") : ""}
      </div>`;

    // ── left: Tahlil natijalari ──────────────────────────────
    const resultsCard = e ? `
      <div class="la-card">
        <div class="la-card-title"><span class="la-ico" style="background:var(--success-50);color:var(--success)">${I.quiz}</span> Tahlil natijalari</div>
        ${scoreBar(e.topic_score, "Mavzu mosligi va ilmiy terminologiya", 60, 20)}
        ${scoreBar(e.speech_score, "Nutq maqsadliligi va akademik tozalik", 120, 20)}
        ${scoreBar(e.method_score, "Metodik mahorat va tushuntirish uslubi", 180, 20)}
        ${scoreBar(e.interaction_score, "Interaktivlik va talabalar qamrovi", 240, 20)}
        ${scoreBar(e.feedback_score, "Baholash va teskari aloqa", 300, 20)}
        <div class="la-total">
          <span class="l">Umumiy ball</span>
          <span class="v" style="color:${overallCol}">${e.overall_score}<span class="max">/100</span></span>
        </div>
      </div>` : "";

    // ── right: AI tavsiyalari ────────────────────────────────
    const recs = (e && e.advice && e.advice.length ? e.advice : (e && e.improvements) || []);
    const recsCard = e ? `
      <div class="la-card la-card-rec">
        <div class="la-card-title"><span class="la-ico" style="background:var(--warning-50);color:var(--warning)">${I.star}</span> AI tavsiyalari</div>
        <div class="la-rec-list">
        ${recs.length ? recs.map((s, i) => `
          <div class="la-rec-card">
            <span class="la-rec-num">${i + 1}</span>
            <div class="la-rec-body"><div class="d">${escapeHtml(s)}</div></div>
          </div>`).join("") : `<div class="la-muted">Tavsiyalar mavjud emas.</div>`}
        </div>
        <div class="la-rec-foot">${I.info} Tavsiyalar o'qituvchining shaxsiy hisobotida ko'rsatiladi</div>
        ${d.transcript && d.transcript.trim() ? `<button class="btn-ghost btn-sm" id="reeval-btn" style="margin-top:10px">${I.trending} Qayta tahlil qilish</button>` : ""}
      </div>` : "";

    // ── summary callout ──────────────────────────────────────
    const summaryBlock = e && e.summary ? `
      <div class="la-summary">
        <span class="la-ico" style="background:var(--brand-50);color:var(--brand)">${I.info}</span>
        <div>${escapeHtml(e.summary)}</div>
      </div>` : "";

    // ── strengths / improvements ─────────────────────────────
    const strengthsBlock = e && (e.strengths.length || e.improvements.length) ? `
      <div class="la-grid-2">
        ${e.strengths.length ? `
          <div class="la-card">
            <div class="la-card-title"><span class="la-ico" style="background:var(--success-50);color:var(--success)">${I.ok}</span> Kuchli tomonlar</div>
            <ul class="la-list la-list-good">${e.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
          </div>` : ""}
        ${e.improvements.length ? `
          <div class="la-card">
            <div class="la-card-title"><span class="la-ico" style="background:var(--warning-50);color:var(--warning)">${I.trending}</span> Yaxshilash kerak</div>
            <ul class="la-list la-list-warn">${e.improvements.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
          </div>` : ""}
      </div>` : "";

    // ── student evaluations ──────────────────────────────────
    const studentSection = d.student_evaluations && d.student_evaluations.length ? `
      <div class="la-card">
        <div class="la-card-title"><span class="la-ico" style="background:var(--accent-50);color:var(--accent)">${I.students}</span> Talaba baholashlari</div>
        ${d.student_evaluations.map(q => {
          const avgPct = q.scale > 0 ? Math.round(q.average / q.scale * 100) : 0;
          return `<div class="la-sq">
            <div class="la-sq-head"><span>${escapeHtml(q.text)}</span><span class="la-sq-val">${q.average}/${q.scale}</span></div>
            <div class="la-score-track"><div class="la-score-fill" style="width:${avgPct}%;background:var(--accent)"></div></div>
            <div class="la-sq-count">${q.count} ta talaba baholagan</div>
          </div>`;
        }).join("")}
      </div>` : "";

    // ── transcript ───────────────────────────────────────────
    const transcriptSection = d.transcript && d.transcript.trim() ? `
      <div class="la-card">
        <div class="la-transcript-head">
          <div class="la-card-title" style="margin:0"><span class="la-ico" style="background:var(--bg-subtle);color:var(--text-muted)">${I.book}</span> Dars transkripsiyasi</div>
          <button class="btn-ghost btn-sm" id="toggle-transcript">${I.eye} Ko'rsatish</button>
        </div>
        <div id="transcript-body" class="la-transcript-body" style="display:none">${escapeHtml(d.transcript)}</div>
      </div>` : "";

    const hasAny = e || (d.student_evaluations && d.student_evaluations.length) || (d.transcript && d.transcript.trim());

    modal.querySelector(".la-body").innerHTML = `
      <div class="la-hero">
        <button class="la-hero-close">${I.close}</button>
        <div class="la-hero-eyebrow">${I.trending} AI DARS TAHLILI</div>
        <h3>${escapeHtml(d.topic || "Dars tahlili")}</h3>
        <div class="la-hero-meta">${metaPills}</div>
        ${e ? `<div class="la-hero-badge" style="--ring:${overallCol}"><div class="n">${e.overall_score}</div><div class="c">ball</div></div>` : ""}
      </div>
      <div class="la-content">
        ${hasAny ? `
          <div class="la-grid">
            <div class="la-col">${infoCard}${resultsCard}</div>
            <div class="la-col">${recsCard || infoCardFallback(d, cfg)}</div>
          </div>
          ${summaryBlock}
          ${strengthsBlock}
          ${studentSection}
          ${transcriptSection}
        ` : `<div class="la-empty">${I.info}<div>Bu dars uchun hali baholash yoki transkripsiya mavjud emas.</div></div>`}
      </div>
    `;

    modal.querySelector(".la-hero-close")?.addEventListener("click", close);

    // Re-run AI evaluation on the stored transcript, then re-open with fresh data
    const reevalBtn = modal.querySelector("#reeval-btn");
    if (reevalBtn) {
      reevalBtn.addEventListener("click", async () => {
        reevalBtn.disabled = true;
        reevalBtn.textContent = "Tahlil qilinmoqda…";
        try {
          await api(`/api/admin/lessons/${lessonId}/reevaluate`, { method: "POST" });
          toast("Dars qayta tahlil qilindi", "success");
          openLessonDetailModal(lessonId);
        } catch (err) {
          toast(err.message, "error");
          reevalBtn.disabled = false;
          reevalBtn.innerHTML = `${I.trending} Qayta tahlil qilish`;
        }
      });
    }

    // Toggle transcript
    const toggleBtn = modal.querySelector("#toggle-transcript");
    const transcriptBody = modal.querySelector("#transcript-body");
    if (toggleBtn && transcriptBody) {
      toggleBtn.addEventListener("click", () => {
        const hidden = transcriptBody.style.display === "none";
        transcriptBody.style.display = hidden ? "block" : "none";
        toggleBtn.innerHTML = hidden ? `${I.eye} Yashirish` : `${I.eye} Ko'rsatish`;
      });
    }
  } catch (err) {
    modal.querySelector(".la-body").innerHTML = `<div style="padding:24px"><div class="error show">${escapeHtml(err.message)}</div><div style="text-align:right;margin-top:14px"><button class="btn-secondary la-close-fallback">Yopish</button></div></div>`;
    modal.querySelector(".la-close-fallback")?.addEventListener("click", close);
  }
}

// Map a 0-100 score to a CSS color variable (for inline styling)
function cssScoreColor(score) {
  if (score >= 80) return "var(--success)";
  if (score >= 60) return "var(--brand)";
  if (score >= 40) return "var(--warning)";
  return "var(--danger)";
}

// Fallback for the right column when there's no AI evaluation but other data exists
function infoCardFallback(d, cfg) {
  return `<div class="la-card">
    <div class="la-card-title"><span class="la-ico" style="background:var(--bg-subtle);color:var(--text-muted)">${I.info}</span> AI tavsiyalari</div>
    <div class="la-muted">Bu dars uchun AI baholash hali tayyor emas.</div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// MODALS — common
// ═══════════════════════════════════════════════════════════════
function openModal(id, inner) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = id;
  modal.className = "modal-backdrop";
  modal.innerHTML = inner;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
  return { modal, close, onKey };
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

// ═══════════════════════════════════════════════════════════════
// LIST PICKER — searchable checkbox list (for subjects, groups, etc.)
// items: [{ id, name, parent_name? }]
// opts:  { placeholder, emptyLabel }
// ═══════════════════════════════════════════════════════════════
function setupListPicker(container, items, selectedIds, onChange, opts = {}) {
  const placeholder = opts.placeholder || "Qidirish...";
  const emptyLabel = opts.emptyLabel || "Elementlar yo'q";

  container.innerHTML = `
    <div class="sp-wrap">
      <div class="sp-search-row">
        <svg class="sp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="sp-search" placeholder="${escapeAttr(placeholder)}">
        <div class="sp-count-badge">0</div>
      </div>
      <div class="sp-list"></div>
    </div>
  `;

  const searchEl = container.querySelector(".sp-search");
  const listEl = container.querySelector(".sp-list");
  const countEl = container.querySelector(".sp-count-badge");

  function updateCount() {
    countEl.textContent = `${selectedIds.size}`;
    countEl.classList.toggle("has-selection", selectedIds.size > 0);
  }

  function renderList(query = "") {
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter(it =>
      it.name.toLowerCase().includes(q) ||
      (it.parent_name || "").toLowerCase().includes(q)
    ) : items;

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="sp-empty">${q ? "Topilmadi" : escapeHtml(emptyLabel)}</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(it => `
      <div class="sp-item ${selectedIds.has(it.id) ? 'selected' : ''}" data-id="${it.id}">
        <div class="sp-main">
          <div class="sp-name">${escapeHtml(it.name)}</div>
          ${it.parent_name ? `<div class="sp-parent">${escapeHtml(it.parent_name)}</div>` : ""}
        </div>
        <div class="sp-checkbox">${selectedIds.has(it.id) ? I.ok : ""}</div>
      </div>
    `).join("");

    listEl.querySelectorAll(".sp-item").forEach(el => {
      el.addEventListener("click", () => {
        const id = parseInt(el.dataset.id);
        if (selectedIds.has(id)) selectedIds.delete(id);
        else selectedIds.add(id);
        el.classList.toggle("selected");
        el.querySelector(".sp-checkbox").innerHTML = selectedIds.has(id) ? I.ok : "";
        updateCount();
        onChange(selectedIds);
      });
    });
  }

  searchEl.addEventListener("input", debounce((e) => renderList(e.target.value), 100));
  updateCount();
  renderList();
}

// Kept name for compatibility — now delegates to generic picker
function setupCascadingGroupPicker(container, cfg, nodes, groups, selectedIds, onChange) {
  setupListPicker(container, groups, selectedIds, onChange, {
    placeholder: `Guruh nomi yoki ${cfg.levels[0].label.toLowerCase()} bo'yicha qidirish...`,
    emptyLabel: "Guruh yo'q",
  });
}

// Teacher modals — unified add/edit with assignment
function openAddTeacherModal() { return openTeacherModal(null); }
function openEditTeacherModal(teacher) { return openTeacherModal(teacher); }

async function openTeacherModal(existing) {
  const isEdit = existing != null;
  const cfg = currentConfig();

  const { modal, close, onKey } = openModal("teacher-modal", `
    <div class="modal-card" role="dialog" style="max-width:560px">
      <div class="modal-head">
        <h3>${isEdit ? "O'qituvchini tahrirlash" : "Yangi o'qituvchi qo'shish"}</h3>
        <button class="modal-close">${I.close}</button>
      </div>
      <form id="t-form" class="modal-body">
        <div class="modal-section-title">Shaxsiy ma'lumotlar</div>
        <label class="field"><span class="label">Ism *</span><input type="text" name="name" required maxlength="100" value="${escapeAttr(existing?.name || "")}" placeholder="Masalan: Ali Valiyev"></label>
        <label class="field"><span class="label">Email *</span><input type="email" name="email" required value="${escapeAttr(existing?.email || "")}" placeholder="teacher@eyeziyo.uz" autocomplete="off"></label>
        <label class="field">
          <span class="label">${isEdit ? "Yangi parol (ixtiyoriy)" : "Parol *"}</span>
          <input type="password" name="password" ${isEdit ? "" : "required"} minlength="6" maxlength="100" placeholder="${isEdit ? "Bo'sh qoldirsangiz o'zgarmaydi" : "Kamida 6 ta belgi"}" autocomplete="new-password">
        </label>
        <label class="field"><span class="label">Fan/soha (bitta asosiy)</span><input type="text" name="course_type" maxlength="100" value="${escapeAttr(existing?.course_type || "")}" placeholder="Masalan: Backend dasturlash"></label>

        ${cfg.hasSubjects ? `
          <div class="modal-section-title" style="margin-top:16px">Biriktirilgan fanlar</div>
          <div class="field">
            <div id="subj-picker"><span style="font-size:12px;color:var(--text-subtle)">Yuklanmoqda...</span></div>
          </div>
        ` : ""}

        <div class="modal-section-title" style="margin-top:16px">Biriktirilgan ${cfg.groupLabel === "Bo'lim" ? "bo'limlar" : "guruhlar"}</div>
        <div class="field">
          <div id="grp-picker"><span style="font-size:12px;color:var(--text-subtle)">Yuklanmoqda...</span></div>
        </div>

        <div class="error" id="t-error"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="t-cancel">Bekor qilish</button>
          <button type="submit" class="btn-primary" id="t-submit">${isEdit ? `${I.edit} Saqlash` : `${I.add} Qo'shish va biriktirish`}</button>
        </div>
      </form>
    </div>
  `);
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("#t-cancel").addEventListener("click", close);

  // Load subjects + groups + hierarchy nodes + current assignments
  let currentSubjectIds = new Set();
  let selectedGroupIds = new Set();
  try {
    const [subjects, groups, nodes, assign] = await Promise.all([
      cfg.hasSubjects ? api("/api/admin/subjects") : Promise.resolve([]),
      api("/api/admin/groups"),
      api("/api/admin/hierarchy"),
      isEdit ? api(`/api/admin/teachers/${existing.user_id}/assignments`).catch(() => ({ subjects: [], groups: [] })) : Promise.resolve({ subjects: [], groups: [] }),
    ]);

    currentSubjectIds = new Set(assign.subjects.map(s => s.id));
    selectedGroupIds = new Set(assign.groups.map(g => g.id));

    // Subjects picker (searchable list)
    if (cfg.hasSubjects) {
      const subjPicker = modal.querySelector("#subj-picker");
      if (subjects.length === 0) {
        subjPicker.innerHTML = `<div class="cascade-empty-wrap">Hali fan yo'q. <a href="#" id="go-subj" style="color:var(--brand)">Fanlar sahifasiga o'tish</a></div>`;
        subjPicker.querySelector("#go-subj")?.addEventListener("click", (e) => { e.preventDefault(); close(); route("subjects"); });
      } else {
        setupListPicker(subjPicker, subjects, currentSubjectIds, () => {}, {
          placeholder: "Fan nomini qidirish...",
          emptyLabel: "Fan yo'q",
        });
      }
    }

    // Groups picker (searchable list)
    const grpPicker = modal.querySelector("#grp-picker");
    if (groups.length === 0) {
      grpPicker.innerHTML = `<div class="cascade-empty-wrap">Hali guruh yo'q. <a href="#" id="go-grp" style="color:var(--brand)">Guruhlar sahifasiga o'tish</a></div>`;
      grpPicker.querySelector("#go-grp")?.addEventListener("click", (e) => { e.preventDefault(); close(); route("groups"); });
    } else {
      setupListPicker(grpPicker, groups, selectedGroupIds, () => {}, {
        placeholder: `Guruh yoki ${cfg.levels[0].label.toLowerCase()} bo'yicha qidirish...`,
        emptyLabel: "Guruh yo'q",
      });
    }
  } catch (err) {
    toast("Ro'yxatlarni yuklashda xatolik: " + err.message, "error");
  }

  const form = modal.querySelector("#t-form");
  const errorEl = modal.querySelector("#t-error");
  const submitBtn = modal.querySelector("#t-submit");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.remove("show");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saqlanmoqda...";
    try {
      const subjectIds = [...currentSubjectIds];
      const groupIds = [...selectedGroupIds];
      const primarySubject = subjectIds[0] || null;

      let teacherId;
      if (isEdit) {
        const payload = {
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          course_type: form.course_type.value.trim(),
        };
        if (form.password.value) payload.password = form.password.value;
        await api(`/api/admin/teachers/${existing.user_id}`, { method: "PUT", body: JSON.stringify(payload) });
        teacherId = existing.user_id;
      } else {
        const created = await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email: form.email.value.trim(),
            password: form.password.value,
            name: form.name.value.trim(),
            role: "teacher",
            course_type: form.course_type.value.trim(),
            groups: [],
          }),
        });
        teacherId = created.id;
      }

      // Save assignments (subjects + groups)
      if (cfg.hasSubjects || groupIds.length > 0 || isEdit) {
        await api(`/api/admin/teachers/${teacherId}/assignments`, {
          method: "PUT",
          body: JSON.stringify({
            subject_ids: subjectIds,
            groups: groupIds.map(gid => ({ group_id: gid, subject_id: primarySubject })),
          }),
        });
      }

      close();
      document.removeEventListener("keydown", onKey);
      toast(isEdit ? "Saqlandi" : "O'qituvchi qo'shildi va biriktirildi", "success");
      if (isEdit) renderTeacher(teacherId);
      else renderTeachers();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.add("show");
      submitBtn.disabled = false;
      submitBtn.innerHTML = isEdit ? `${I.edit} Saqlash` : `${I.add} Qo'shish va biriktirish`;
    }
  });
  setTimeout(() => form.name.focus(), 50);
}

async function openAssignTeacherModal(teacher, currentAssign) {
  const cfg = currentConfig();
  const { modal, close, onKey } = openModal("assign-modal", `
    <div class="modal-card" role="dialog" style="max-width:560px">
      <div class="modal-head"><h3>${escapeHtml(teacher.name)} — biriktirish</h3><button class="modal-close">${I.close}</button></div>
      <form id="asg-form" class="modal-body">
        ${cfg.hasSubjects ? `
          <div class="field">
            <span class="label">Fanlar</span>
            <div class="group-picker" id="subjects-picker"><span style="font-size:12px;color:var(--text-subtle)">Yuklanmoqda...</span></div>
          </div>
        ` : ""}
        <div class="field">
          <span class="label">Guruhlar</span>
          <div class="group-picker" id="groups-picker"><span style="font-size:12px;color:var(--text-subtle)">Yuklanmoqda...</span></div>
        </div>
        <div class="error" id="asg-error"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="asg-cancel">Bekor qilish</button>
          <button type="submit" class="btn-primary">${I.ok} Saqlash</button>
        </div>
      </form>
    </div>
  `);
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("#asg-cancel").addEventListener("click", close);

  const selectedSubjects = new Set(currentAssign.subjects.map(s => s.id));
  const selectedGroups = new Set(currentAssign.groups.map(g => g.id));

  try {
    const [subjects, groups] = await Promise.all([
      cfg.hasSubjects ? api("/api/admin/subjects") : Promise.resolve([]),
      api("/api/admin/groups"),
    ]);

    if (cfg.hasSubjects) {
      modal.querySelector("#subjects-picker").innerHTML = subjects.length === 0
        ? `<span style="font-size:12px;color:var(--text-subtle)">Hali fan qo'shilmagan. <a href="#" id="go-subjects" style="color:var(--brand)">Qo'shish</a></span>`
        : subjects.map(s => `
          <label class="gp-chip ${selectedSubjects.has(s.id) ? 'selected' : ''}">
            <input type="checkbox" data-sid="${s.id}" ${selectedSubjects.has(s.id) ? 'checked' : ''}>
            <span>${escapeHtml(s.name)}</span>
          </label>`).join("");
      modal.querySelector("#go-subjects")?.addEventListener("click", (e) => { e.preventDefault(); close(); route("subjects"); });
    }

    modal.querySelector("#groups-picker").innerHTML = groups.length === 0
      ? `<span style="font-size:12px;color:var(--text-subtle)">Hali guruh qo'shilmagan. <a href="#" id="go-groups" style="color:var(--brand)">Qo'shish</a></span>`
      : groups.map(g => `
        <label class="gp-chip ${selectedGroups.has(g.id) ? 'selected' : ''}">
          <input type="checkbox" data-gid="${g.id}" ${selectedGroups.has(g.id) ? 'checked' : ''}>
          <span>${escapeHtml(g.name)}${g.parent_name ? ` <small style="opacity:0.7">(${escapeHtml(g.parent_name)})</small>` : ""}</span>
        </label>`).join("");
    modal.querySelector("#go-groups")?.addEventListener("click", (e) => { e.preventDefault(); close(); route("groups"); });

    modal.querySelectorAll('.gp-chip input').forEach(cb => {
      cb.addEventListener("change", () => cb.closest(".gp-chip").classList.toggle("selected", cb.checked));
    });
  } catch (err) {
    toast("Yuklashda xatolik: " + err.message, "error");
  }

  const form = modal.querySelector("#asg-form");
  const errorEl = modal.querySelector("#asg-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.remove("show");
    try {
      const subject_ids = [...modal.querySelectorAll('[data-sid]:checked')].map(cb => parseInt(cb.dataset.sid));
      const group_ids = [...modal.querySelectorAll('[data-gid]:checked')].map(cb => parseInt(cb.dataset.gid));
      const groups = group_ids.map(gid => ({ group_id: gid, subject_id: subject_ids[0] || null }));
      await api(`/api/admin/teachers/${teacher.user_id}/assignments`, {
        method: "PUT",
        body: JSON.stringify({ subject_ids, groups }),
      });
      close();
      document.removeEventListener("keydown", onKey);
      toast("Biriktirishlar saqlandi", "success");
      renderTeacher(teacher.user_id);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.add("show");
    }
  });
}

function openDeleteTeacherConfirm(teacher) {
  confirmDelete(
    "O'qituvchini o'chirasizmi?",
    `${teacher.name} va uning ${teacher.total_lessons} ta darsi, barcha baholari butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi.`,
    async () => {
      await api(`/api/admin/teachers/${teacher.user_id}`, { method: "DELETE" });
      toast("O'qituvchi o'chirildi", "success");
      route("teachers");
    }
  );
}

// Student modal — unified add/edit with cascading group picker
async function openAddStudentModal(existing) {
  const isEdit = existing != null;
  const cfg = currentConfig();

  const { modal, close, onKey } = openModal("add-student-modal", `
    <div class="modal-card" role="dialog" style="max-width:560px">
      <div class="modal-head"><h3>${isEdit ? "O'quvchini tahrirlash" : "Yangi o'quvchi"}</h3><button class="modal-close">${I.close}</button></div>
      <form id="as-form" class="modal-body">
        <div class="modal-section-title">Shaxsiy ma'lumotlar</div>
        <label class="field"><span class="label">Ism *</span><input type="text" name="name" required maxlength="100" value="${escapeAttr(existing?.name || "")}" placeholder="To'liq ismi"></label>
        <label class="field"><span class="label">Email *</span><input type="email" name="email" required value="${escapeAttr(existing?.email || "")}" placeholder="student@eyeziyo.uz" autocomplete="off"></label>
        <label class="field"><span class="label">${isEdit ? "Yangi parol (bo'sh = o'zgarmaydi)" : "Parol *"}</span><input type="password" name="password" ${isEdit ? "" : "required"} minlength="6" maxlength="100" placeholder="Kamida 6 ta belgi"></label>

        <div class="modal-section-title" style="margin-top:16px">Biriktirilgan ${cfg.groupLabel === "Bo'lim" ? "bo'limlar" : "guruhlar"} *</div>
        <div class="field">
          <div id="s-grp-picker"><span style="font-size:12px;color:var(--text-subtle)">Yuklanmoqda...</span></div>
        </div>

        <div class="error" id="as-error"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="as-cancel">Bekor qilish</button>
          <button type="submit" class="btn-primary">${isEdit ? I.edit + " Saqlash" : I.add + " Qo'shish va biriktirish"}</button>
        </div>
      </form>
    </div>
  `);
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("#as-cancel").addEventListener("click", close);

  const selectedGroupIds = new Set();
  let allGroups = [];
  try {
    const [groups, nodes] = await Promise.all([
      api("/api/admin/groups"),
      api("/api/admin/hierarchy"),
    ]);
    allGroups = groups;

    // Pre-select: if editing, match by group name (legacy) — find groups_v2 by name
    if (isEdit && existing.groups) {
      const byName = new Set(existing.groups);
      for (const g of groups) {
        if (byName.has(g.name)) selectedGroupIds.add(g.id);
      }
    }

    const grpPicker = modal.querySelector("#s-grp-picker");
    if (groups.length === 0 && nodes.length === 0) {
      grpPicker.innerHTML = `<div class="cascade-empty-wrap">Hali tuzilma va guruh yo'q. Avval <a href="#" id="go-grp2" style="color:var(--brand)">guruhlarni yarating</a>.</div>`;
      grpPicker.querySelector("#go-grp2")?.addEventListener("click", (e) => { e.preventDefault(); close(); route("groups"); });
    } else {
      setupCascadingGroupPicker(grpPicker, cfg, nodes, groups, selectedGroupIds, () => {});
    }
  } catch (err) {
    toast("Yuklashda xatolik: " + err.message, "error");
  }

  const form = modal.querySelector("#as-form");
  const errorEl = modal.querySelector("#as-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.remove("show");
    try {
      if (selectedGroupIds.size === 0) throw new Error("Kamida bitta guruh tanlang");
      const chosenGroups = allGroups.filter(g => selectedGroupIds.has(g.id));
      const chosenNames = chosenGroups.map(g => g.name);

      const payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        groups: chosenNames, // legacy string names for mobile compat
      };
      if (form.password.value) payload.password = form.password.value;

      let studentId;
      if (isEdit) {
        await api(`/api/teacher/students/${existing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        studentId = existing.id;
      } else {
        const created = await api("/api/teacher/students", { method: "POST", body: JSON.stringify(payload) });
        studentId = created.id;
      }

      // Attach to groups_v2 (structured link)
      await api(`/api/admin/students/${studentId}/groups`, {
        method: "PUT",
        body: JSON.stringify({ group_ids: [...selectedGroupIds] }),
      }).catch(() => {}); // best-effort

      close();
      document.removeEventListener("keydown", onKey);
      toast(isEdit ? "Saqlandi" : "O'quvchi qo'shildi va biriktirildi", "success");
      if (isEdit) renderStudent(studentId); else renderStudents();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.add("show");
    }
  });
  setTimeout(() => form.name.focus(), 50);
}

function openDeleteStudentConfirm(student) {
  confirmDelete(
    "O'quvchini o'chirasizmi?",
    `${student.name} va uning ${student.total_attempts} ta test natijasi, barcha chat tarixlari butunlay o'chiriladi.`,
    async () => {
      await api(`/api/teacher/students/${student.id}`, { method: "DELETE" });
      toast("O'quvchi o'chirildi", "success");
      route("students");
    }
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════
async function renderSettings() {
  setBreadcrumbs([{ label: "Dashboard", route: "dashboard" }, { label: "Sozlamalar" }]);
  const inst = AppState.institution;
  if (!inst) { setMain(`<div class="error show">Muassasa yo'q</div>`); return; }
  const cfg = INST_CONFIG[inst.type];

  setMain(`
    <div class="page-header">
      <div><h1 class="page-title">Sozlamalar</h1><div class="page-subtitle">Muassasa ma'lumotlari va sozlamalari</div></div>
    </div>

    <div class="card" style="max-width:640px">
      <div class="card-header"><div><div class="card-title">Muassasa ma'lumotlari</div><div class="card-subtitle">${escapeHtml(cfg.label)}</div></div></div>
      <form id="st-form" class="card-body">
        <label class="field"><span class="label">Muassasa nomi</span><input type="text" name="name" required maxlength="150" value="${escapeAttr(inst.name)}"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="field"><span class="label">Qisqa nom</span><input type="text" name="short_name" maxlength="30" value="${escapeAttr(inst.short_name || "")}"></label>
          <label class="field"><span class="label">O'quv yili</span><input type="text" name="academic_year" maxlength="20" value="${escapeAttr(inst.academic_year || "")}"></label>
        </div>
        <label class="field"><span class="label">Manzil</span><input type="text" name="address" maxlength="200" value="${escapeAttr(inst.address || "")}"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="field"><span class="label">Telefon</span><input type="text" name="phone" maxlength="30" value="${escapeAttr(inst.phone || "")}"></label>
          <label class="field"><span class="label">Email</span><input type="email" name="email" maxlength="100" value="${escapeAttr(inst.email || "")}"></label>
        </div>
        <div class="error" id="st-error"></div>
        <div class="modal-actions" style="padding-top:8px">
          <button type="submit" class="btn-primary">${I.ok} Saqlash</button>
        </div>
      </form>
    </div>

    <div class="card" style="max-width:640px;margin-top:16px">
      <div class="card-header"><div><div class="card-title">Muassasa turi</div><div class="card-subtitle">Tur bo'yicha sidebar va formalar moslashadi</div></div></div>
      <div class="card-body">
        <div class="type-picker" style="grid-template-columns:repeat(3,1fr)">
          ${Object.entries(INST_CONFIG).map(([k, v]) => `
            <button class="type-card ${k === inst.type ? 'selected' : ''}" data-type="${k}">
              <div class="tc-icon">${v.icon}</div>
              <div class="tc-title">${escapeHtml(v.label)}</div>
            </button>
          `).join("")}
        </div>
        <p style="font-size:12px;color:var(--text-subtle);margin-top:12px">Diqqat: har bir tur o'z alohida ma'lumotlariga ega (ierarxiya, guruhlar, fanlar, o'qituvchilar, o'quvchilar). Turni o'zgartirish boshqa turdagi ma'lumotlarni ko'rinmas qiladi — ular o'chirilmaydi, qaytib kelsangiz yana ko'rinadi.</p>
      </div>
    </div>
  `);

  injectAudiotapSettings();
  const form = document.getElementById("st-form");
  const errorEl = document.getElementById("st-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.remove("show");
    try {
      const updated = await api("/api/admin/institution", {
        method: "PUT",
        body: JSON.stringify({
          name: form.name.value.trim(),
          short_name: form.short_name.value.trim(),
          academic_year: form.academic_year.value.trim(),
          address: form.address.value.trim(),
          phone: form.phone.value.trim(),
          email: form.email.value.trim(),
        }),
      });
      AppState.institution = updated;
      updateOrgChip();
      toast("Saqlandi", "success");
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.add("show");
    }
  });

  root.querySelectorAll(".type-card[data-type]").forEach(c => {
    c.addEventListener("click", async () => {
      const newType = c.dataset.type;
      if (newType === inst.type) return;
      if (!confirm(`Turni "${INST_CONFIG[newType].label}" ga o'zgartirasizmi? Sidebar va formalar moslashadi.`)) return;
      try {
        const updated = await api("/api/admin/institution", {
          method: "PUT",
          body: JSON.stringify({ type: newType }),
        });
        AppState.institution = updated;
        rebuildSidebarNav();
        updateOrgChip();
        toast("Tur o'zgartirildi", "success");
        renderSettings();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// SHARED HTML
// ═══════════════════════════════════════════════════════════════
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

function emptyStateHtml(title, sub) {
  return `<div class="empty">
    <div class="e-icon">${I.info}</div>
    <div class="e-title">${escapeHtml(title)}</div>
    <div class="e-sub">${escapeHtml(sub || "")}</div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════
function scoreColor(v) {
  if (v >= 80) return "success";
  if (v >= 60) return "warning";
  if (v > 0) return "danger";
  return "muted";
}

// Deterministic per-name avatar color so people are visually distinguishable in lists.
const AVATAR_PALETTE = [
  ["#2563EB", "#7C3AED"], // blue→violet
  ["#0891B2", "#2563EB"], // cyan→blue
  ["#059669", "#0891B2"], // green→cyan
  ["#D97706", "#DC2626"], // amber→red
  ["#7C3AED", "#DB2777"], // violet→pink
  ["#DB2777", "#F59E0B"], // pink→amber
  ["#0D9488", "#059669"], // teal→green
  ["#4F46E5", "#2563EB"], // indigo→blue
];
function avatarStyle(name) {
  const s = String(name || "?");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const [a, b] = AVATAR_PALETTE[h % AVATAR_PALETTE.length];
  return ` style="background:linear-gradient(135deg,${a},${b})"`;
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
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
function fmtDate(raw) {
  if (!raw) return "—";
  try { const d = new Date(raw); return d.toLocaleDateString("uz-UZ", { day: "numeric", month: "short" }); }
  catch { return raw.substring(0, 10); }
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

init();
