/**
 * JE Interview Kiosk - Frontend
 * - Fixed layout for 1280x800+ tablets (landscape only).
 * - Multilingual UI (ko/zh/en) with identical UI structure.
 * - Loads content from Google Apps Script JSON endpoint.
 *
 * IMPORTANT:
 * Set GAS_WEBAPP_URL to your deployed Apps Script Web App URL.
 */

const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbysme1_OyspuCg-RR1reLRQMwY_EWbGfb59fPGZdVvgdjiTIBGOk_kP9EsBK21HFkhr/exec"; // 예: https://script.google.com/macros/s/XXXXX/exec

const STATE = {
  lang: "ko",
  route: "home",
  tab: "day",
  content: null,
  loadedFrom: "none", // api | fallback
};

const UI = {};
const PAGES = ["home", "company", "work", "income", "contract", "diff"];

function $(id){ return document.getElementById(id); }

/* =========================================================
   ✅ PWA 추가 코드 (Service Worker 등록)
   - sw.js 파일이 repo 루트에 있어야 함 (./sw.js)
   - GitHub Pages에서 설치 버튼이 뜨려면 필요
========================================================= */
async function registerServiceWorker_() {
  if (!("serviceWorker" in navigator)) return;

  try {
    // GitHub Pages에서도 상대경로로 안전하게 등록
    const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    console.log("[PWA] Service Worker registered:", reg);

    // 업데이트 감지 시 로그
    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (!installing) return;

      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") {
          console.log("[PWA] New version installed. Reload to apply.");
        }
      });
    });
  } catch (e) {
    console.warn("[PWA] Service Worker registration failed:", e);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  /* ✅ PWA 추가: Service Worker 먼저 등록 */
  await registerServiceWorker_();

  bindUI_();
  initLanguage_();
  initRouter_();
  initWorkTabs_();
  initIncomeSim_();

  await loadContent_();
  renderAll_();
});

function bindUI_() {
  UI.apiStatus = $("apiStatus");
  UI.heroVideo = $("heroVideo");
  UI.btnStart = $("btnStart");

  // language buttons
  UI.langButtons = [
    $("langKo"),
    $("langZh"),
    $("langEn"),
  ];

  UI.langButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const lang = btn.getAttribute("data-lang");
      setLang_(lang);
    });
  });

  // nav buttons
  UI.navButtons = document.querySelectorAll(".navbtn");
  UI.navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const route = btn.getAttribute("data-route");
      setRoute_(route);
    });
  });

  // start button -> company (or work)
  UI.btnStart.addEventListener("click", () => {
    setRoute_("company");
  });
}

function initLanguage_() {
  // localStorage persistence
  const saved = localStorage.getItem("je_kiosk_lang");
  if (saved && ["ko","zh","en"].includes(saved)) STATE.lang = saved;
  updateLangUI_();
}

function initRouter_() {
  // route from hash
  const fromHash = (location.hash || "").replace("#", "").trim();
  if (fromHash && PAGES.includes(fromHash)) STATE.route = fromHash;

  window.addEventListener("hashchange", () => {
    const r = (location.hash || "").replace("#", "").trim();
    if (r && PAGES.includes(r)) {
      STATE.route = r;
      renderRoute_();
    }
  });

  renderRoute_();
}

function initWorkTabs_() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(t => {
    t.addEventListener("click", () => {
      tabs.forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      STATE.tab = t.getAttribute("data-tab");
      renderWorkFlow_();
    });
  });
}

function initIncomeSim_() {
  const gross = $("simGross");
  const cost = $("simCost");
  const update = () => {
    const g = Number(gross.value || 0);
    const c = Number(cost.value || 0);
    const net = Math.max(0, g - c);
    $("simNet").textContent = formatCurrency_(net, STATE.lang);
  };
  gross.addEventListener("input", update);
  cost.addEventListener("input", update);
  update();
}

async function loadContent_() {
  // If GAS URL not set, use fallback
  if (!GAS_WEBAPP_URL || GAS_WEBAPP_URL.includes("PASTE_YOUR_GAS_WEBAPP_URL_HERE")) {
    STATE.content = fallbackContent_();
    STATE.loadedFrom = "fallback";
    setApiStatus_("DATA: fallback (GAS URL not set)");
    setupHeroVideo_();
    return;
  }

  try {
    setApiStatus_("DATA: loading...");
    const url = `${GAS_WEBAPP_URL}?action=content&t=${Date.now()}`;
    const res = await fetch(url, { method: "GET" });

    // If Apps Script returns non-OK or blocked, fallback
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data || !data.ok) throw new Error("Invalid payload");

    STATE.content = data;
    STATE.loadedFrom = "api";
    setApiStatus_("DATA: live (Sheets)");
    setupHeroVideo_();
  } catch (err) {
    console.warn("API load failed. Using fallback.", err);
    STATE.content = fallbackContent_();
    STATE.loadedFrom = "fallback";
    setApiStatus_("DATA: fallback (API failed)");
    setupHeroVideo_();
  }
}

function setupHeroVideo_() {
  const content = STATE.content;
  const meta = content?.meta || {};
  const videoUrl = meta?.videoUrl?.[STATE.lang] || meta?.videoUrl?.ko || "assets/hero.mp4";

  // Set source
  UI.heroVideo.innerHTML = "";
  const src = document.createElement("source");
  src.src = videoUrl;
  src.type = "video/mp4";
  UI.heroVideo.appendChild(src);

  // play safe
  UI.heroVideo.load();
  UI.heroVideo.play().catch(() => {
    // autoplay might be blocked on some browsers if not muted (we are muted)
  });
}

function setApiStatus_(text) {
  UI.apiStatus.textContent = text;
}

function setLang_(lang) {
  if (!["ko","zh","en"].includes(lang)) return;
  STATE.lang = lang;
  localStorage.setItem("je_kiosk_lang", lang);
  updateLangUI_();
  renderAll_();
  setupHeroVideo_();
}

function updateLangUI_() {
  UI.langButtons.forEach(b => b.classList.remove("active"));
  const map = { ko: "langKo", zh: "langZh", en: "langEn" };
  $(map[STATE.lang]).classList.add("active");
}

function setRoute_(route) {
  if (!PAGES.includes(route)) return;
  STATE.route = route;
  location.hash = `#${route}`;
  renderRoute_();
}

function renderRoute_() {
  // nav active
  UI.navButtons.forEach(b => b.classList.remove("active"));
  const activeBtn = Array.from(UI.navButtons).find(b => b.getAttribute("data-route") === STATE.route);
  if (activeBtn) activeBtn.classList.add("active");

  // pages show/hide
  PAGES.forEach(p => {
    const el = $(`page-${p}`);
    if (!el) return;
    el.classList.toggle("active", p === STATE.route);
  });
}

function renderAll_() {
  renderTexts_();
  renderCompany_();
  renderWorkFlow_();
  renderIncome_();
  renderContract_();
  renderDiff_();
}

function t_(key) {
  // UI static translations (not from sheets)
  const dict = UI_TEXT_[key];
  if (!dict) return key;
  return dict[STATE.lang] || dict.ko || key;
}

function renderTexts_() {
  // brand
  $("brandSub").textContent = t_("brandSub");

  // nav
  $("navHome").textContent = t_("navHome");
  $("navCompany").textContent = t_("navCompany");
  $("navWork").textContent = t_("navWork");
  $("navIncome").textContent = t_("navIncome");
  $("navContract").textContent = t_("navContract");
  $("navDiff").textContent = t_("navDiff");

  // home texts from sheet meta if exists
  const meta = STATE.content?.meta || {};
  $("brandTitle").textContent = meta?.companyName?.[STATE.lang] || meta?.companyName?.ko || "(주)준은로지스틱스";

  $("homeHeadline").textContent = meta?.homeHeadline?.[STATE.lang] || meta?.homeHeadline?.ko || t_("homeHeadline");
  $("homeSubheadline").textContent = meta?.homeSubheadline?.[STATE.lang] || meta?.homeSubheadline?.ko || t_("homeSubheadline");

  $("btnStart").textContent = t_("btnStart");
  $("homeFootnote").textContent = t_("homeFootnote");

  // section headers
  $("companyTitle").textContent = t_("companyTitle");
  $("companyDesc").textContent = t_("companyDesc");
  $("statsTitle").textContent = t_("statsTitle");
  $("timelineTitle").textContent = t_("timelineTitle");
  $("galleryTitle").textContent = t_("galleryTitle");
  $("galleryDesc").textContent = t_("galleryDesc");

  $("workTitle").textContent = t_("workTitle");
  $("workDesc").textContent = t_("workDesc");
  $("tabDay").textContent = t_("tabDay");
  $("tabNight").textContent = t_("tabNight");
  $("workChecklistTitle").textContent = t_("workChecklistTitle");

  $("incomeTitle").textContent = t_("incomeTitle");
  $("incomeDesc").textContent = t_("incomeDesc");
  $("incomeStructureTitle").textContent = t_("incomeStructureTitle");
  $("incomeNote").textContent = t_("incomeNote");
  $("simTitle").textContent = t_("simTitle");
  $("simGrossLabel").textContent = t_("simGrossLabel");
  $("simCostLabel").textContent = t_("simCostLabel");
  $("simNetLabel").textContent = t_("simNetLabel");
  $("simDisclaimer").textContent = t_("simDisclaimer");
  $("settlementTitle").textContent = t_("settlementTitle");

  $("contractTitle").textContent = t_("contractTitle");
  $("contractDesc").textContent = t_("contractDesc");
  $("contractFlowTitle").textContent = t_("contractFlowTitle");
  $("contractFaqTitle").textContent = t_("contractFaqTitle");
  $("contractCheckTitle").textContent = t_("contractCheckTitle");

  $("diffTitle").textContent = t_("diffTitle");
  $("diffDesc").textContent = t_("diffDesc");
  $("diffMessageTitle").textContent = t_("diffMessageTitle");
  $("diffMessage").textContent = t_("diffMessage");
}

function renderCompany_() {
  const stats = STATE.content?.stats || [];
  const timeline = STATE.content?.timeline || [];

  // stats
  const box = $("statsBox");
  box.innerHTML = "";
  stats.forEach(s => {
    const label = s.labels?.[STATE.lang] || s.labels?.ko || "";
    const value = s.value || "";
    const el = document.createElement("div");
    el.className = "stat";
    el.innerHTML = `<div class="label">${escapeHtml_(label)}</div><div class="value">${escapeHtml_(value)}</div>`;
    box.appendChild(el);
  });

  // timeline
  const tbox = $("timelineBox");
  tbox.innerHTML = "";
  timeline.forEach(item => {
    const loc = item?.[STATE.lang] || item?.ko || {};
    const el = document.createElement("div");
    el.className = "time-item";
    el.innerHTML = `
      <div class="time-year">${escapeHtml_(item.year)}</div>
      <div class="time-body">
        <div class="t-title">${escapeHtml_(loc.title || "")}</div>
        <div class="t-desc">${escapeHtml_(loc.desc || "")}</div>
      </div>
    `;
    tbox.appendChild(el);
  });
}

function renderWorkFlow_() {
  // simple default flow (static, but translated)
  const flow = $("flowBox");
  flow.innerHTML = "";

  const isDay = STATE.tab === "day";
  const steps = isDay ? WORKFLOW_.day : WORKFLOW_.night;

  steps.forEach((step, idx) => {
    const el = document.createElement("div");
    el.className = "flow-item";
    el.innerHTML = `
      <div class="step">${escapeHtml_(t_("step"))} ${idx + 1}</div>
      <div class="title">${escapeHtml_(step[STATE.lang] || step.ko)}</div>
    `;
    flow.appendChild(el);
  });

  // checklist
  const cbox = $("checklistBox");
  cbox.innerHTML = "";
  CHECKLIST_.forEach(item => {
    const el = document.createElement("div");
    el.className = "check";
    el.innerHTML = `
      <div class="icon">✓</div>
      <div class="text">
        <div class="t">${escapeHtml_(item.title[STATE.lang] || item.title.ko)}</div>
        <div class="d">${escapeHtml_(item.desc[STATE.lang] || item.desc.ko)}</div>
      </div>
    `;
    cbox.appendChild(el);
  });
}

function renderIncome_() {
  const ul = $("incomeStructureList");
  ul.innerHTML = "";

  INCOME_STRUCTURE_.forEach(line => {
    const li = document.createElement("li");
    li.textContent = (line[STATE.lang] || line.ko);
    ul.appendChild(li);
  });

  const settle = $("settlementList");
  settle.innerHTML = "";
  SETTLEMENT_.forEach(line => {
    const li = document.createElement("li");
    li.textContent = (line[STATE.lang] || line.ko);
    settle.appendChild(li);
  });

  // refresh sim format after language change
  const gross = $("simGross");
  const cost = $("simCost");
  const net = Math.max(0, Number(gross.value || 0) - Number(cost.value || 0));
  $("simNet").textContent = formatCurrency_(net, STATE.lang);
}

function renderContract_() {
  // contract steps (static)
  const steps = $("contractSteps");
  steps.innerHTML = "";
  CONTRACT_STEPS_.forEach((s, idx) => {
    const el = document.createElement("div");
    el.className = "stepbox";
    el.innerHTML = `
      <div class="n">${idx + 1}</div>
      <div class="t">${escapeHtml_(s[STATE.lang] || s.ko)}</div>
    `;
    steps.appendChild(el);
  });

  // contract checks (static)
  const checks = $("contractCheckList");
  checks.innerHTML = "";
  CONTRACT_CHECKS_.forEach(s => {
    const li = document.createElement("li");
    li.textContent = (s[STATE.lang] || s.ko);
    checks.appendChild(li);
  });

  // FAQ from sheet
  const faq = STATE.content?.faq_contract || [];
  const box = $("faqBox");
  box.innerHTML = "";

  faq.forEach(item => {
    const qa = item?.[STATE.lang] || item?.ko || { q:"", a:"" };
    const wrap = document.createElement("div");
    wrap.className = "faq-item";

    wrap.innerHTML = `
      <div class="faq-q">
        <span>${escapeHtml_(qa.q)}</span>
        <span class="muted">+</span>
      </div>
      <div class="faq-a">${escapeHtml_(qa.a)}</div>
    `;

    wrap.querySelector(".faq-q").addEventListener("click", () => {
      wrap.classList.toggle("open");
    });

    box.appendChild(wrap);
  });
}

function renderDiff_() {
  const grid = $("diffGrid");
  grid.innerHTML = "";

  const points = STATE.content?.diff_points || [];
  points.forEach(p => {
    const loc = p?.[STATE.lang] || p?.ko || { title:"", desc:"" };
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `<h2>${escapeHtml_(loc.title)}</h2><p class="muted">${escapeHtml_(loc.desc)}</p>`;
    grid.appendChild(el);
  });
}

/** Utilities */

function escapeHtml_(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCurrency_(num, lang) {
  try {
    if (lang === "ko") return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(num);
    if (lang === "zh") return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(num);
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
  } catch {
    return String(num);
  }
}

/** Static UI Text + Content (translated) */

const UI_TEXT_ = {
  brandSub: { ko: "면접자 키오스크", zh: "面試自助展示", en: "Interview Kiosk" },

  navHome: { ko: "홈", zh: "首頁", en: "Home" },
  navCompany: { ko: "회사 소개", zh: "公司介紹", en: "Company" },
  navWork: { ko: "일하는 방식", zh: "工作方式", en: "How We Work" },
  navIncome: { ko: "수익 & 정산", zh: "收益與結算", en: "Earnings & Settlement" },
  navContract: { ko: "계약 안내", zh: "合約說明", en: "Contract" },
  navDiff: { ko: "차별점", zh: "差異化", en: "Why Us" },

  homeHeadline: { ko: "협업과 상생 소통이 가장 중요한 영업점", zh: "協作與共榮溝通最重要的營業點", en: "A branch where collaboration and mutual growth come first" },
  homeSubheadline: { ko: "쿠팡CLS 공식 인증 우수 빅 벤더 (주)준은로지스틱스", zh: "Coupang CLS 官方認證 優秀大型供應商 (株)Juneun Logistics", en: "Coupang CLS officially certified excellent big vendor, JE Logistics" },
  btnStart: { ko: "시작하기", zh: "開始", en: "Start" },
  homeFootnote: {
    ko: "※ 본 화면의 수익 안내는 “범위 + 구조 중심”이며 확정 금액을 보장하지 않습니다.",
    zh: "※ 收益說明以「範圍＋結構」為主，不保證固定金額。",
    en: "※ Earnings are explained as ‘range + structure’ and do not guarantee fixed amounts."
  },

  companyTitle: { ko: "회사 소개", zh: "公司介紹", en: "Company" },
  companyDesc: { ko: "운영 안정성과 신뢰를 한눈에 확인하세요.", zh: "一眼確認營運規模與可信度。", en: "See stability and trust at a glance." },
  statsTitle: { ko: "운영 규모", zh: "營運規模", en: "Scale" },
  timelineTitle: { ko: "연혁", zh: "沿革", en: "Timeline" },
  galleryTitle: { ko: "현장 이미지/영상", zh: "現場圖片/影片", en: "Gallery" },
  galleryDesc: {
    ko: "실제 현장, 차량, 분류, 업무 모습 등은 동일한 자산(영상/이미지)을 공통 사용합니다. (추후 확장 가능)",
    zh: "現場/車輛/分揀/工作畫面等可共用相同素材（可後續擴充）。",
    en: "Field/truck/sorting/work visuals can be shared assets (expandable later)."
  },

  workTitle: { ko: "일하는 방식", zh: "工作方式", en: "How We Work" },
  workDesc: { ko: "주간/야간 하루 흐름을 미리 확인해 불안을 줄입니다.", zh: "先了解日/夜班流程，降低不安。", en: "Preview day/night flow to reduce uncertainty." },
  tabDay: { ko: "주간 기사 하루", zh: "日班司機一天", en: "Day Shift" },
  tabNight: { ko: "야간 기사 하루", zh: "夜班司機一天", en: "Night Shift" },
  workChecklistTitle: { ko: "업무 시작 전 필수 사항", zh: "上工前必備", en: "Before You Start" },
  step: { ko: "단계", zh: "步驟", en: "Step" },

  incomeTitle: { ko: "수익 & 정산", zh: "收益與結算", en: "Earnings & Settlement" },
  incomeDesc: { ko: "가장 중요한 신뢰 포인트: 구조와 범위를 투명하게 설명합니다.", zh: "最重要的信任點：透明說明結構與範圍。", en: "Key trust point: transparent structure and ranges." },
  incomeStructureTitle: { ko: "수익 구조", zh: "收益結構", en: "Earnings Structure" },
  incomeNote: {
    ko: "⚠️ 금액은 ‘확정’이 아니라 ‘범위 + 구조 중심’으로 안내합니다.",
    zh: "⚠️ 金額非固定，採「範圍＋結構」說明。",
    en: "⚠️ Amounts are not fixed; explained as ‘range + structure’."
  },
  simTitle: { ko: "순수익 계산 예시 (시뮬레이션)", zh: "淨收益試算（示例）", en: "Net Profit Example (Simulation)" },
  simGrossLabel: { ko: "월 매출(예시)", zh: "月營收（示例）", en: "Monthly Gross (Example)" },
  simCostLabel: { ko: "월 비용(예시)", zh: "月成本（示例）", en: "Monthly Costs (Example)" },
  simNetLabel: { ko: "예상 순수익", zh: "預估淨收益", en: "Estimated Net" },
  simDisclaimer: {
    ko: "* 본 시뮬레이션은 이해를 돕기 위한 예시이며 실제 수익을 보장하지 않습니다.",
    zh: "＊本試算僅供理解，不保證實際收益。",
    en: "* This is for understanding only and does not guarantee actual earnings."
  },
  settlementTitle: { ko: "정산 안내", zh: "結算說明", en: "Settlement" },

  contractTitle: { ko: "계약 안내", zh: "合約說明", en: "Contract" },
  contractDesc: { ko: "오해를 줄이고, 투명하게 절차를 안내합니다.", zh: "降低誤解，透明說明流程。", en: "Reduce misunderstanding with a clear process." },
  contractFlowTitle: { ko: "계약 진행 단계", zh: "合約流程", en: "Steps" },
  contractFaqTitle: { ko: "자주 묻는 계약 질문", zh: "常見問題", en: "FAQ" },
  contractCheckTitle: { ko: "계약 전 꼭 확인할 사항", zh: "簽約前必看", en: "Before Signing" },

  diffTitle: { ko: "준은로지스틱스의 차별점", zh: "Juneun 的差異化", en: "Why JE Logistics" },
  diffDesc: { ko: "왜 여기여야 하는지, 마지막 선택 이유를 제공합니다.", zh: "提供最後選擇的理由。", en: "Provide the final reason to choose us." },
  diffMessageTitle: { ko: "우리는 이렇게 생각합니다", zh: "我們的想法", en: "Our Message" },
  diffMessage: {
    ko: "“면접은 ‘설명’이 아니라 ‘경험’이어야 합니다. 말로 설득하기보다, 체계를 보여드립니다.”",
    zh: "「面試不只是說明，而是體驗。我們用制度讓你看見。」",
    en: "“An interview should be an experience, not just an explanation. We show our system.”"
  },
};

const WORKFLOW_ = {
  day: [
    { ko:"출근/인수인계", zh:"到班/交接", en:"Check-in / Handover" },
    { ko:"분류/적재", zh:"分揀/裝載", en:"Sorting / Loading" },
    { ko:"배송", zh:"配送", en:"Delivery" },
    { ko:"회수", zh:"回收", en:"Pickup/Returns" },
    { ko:"마감/정리", zh:"收尾/整理", en:"Wrap-up" },
  ],
  night: [
    { ko:"출근/브리핑", zh:"到班/簡報", en:"Check-in / Briefing" },
    { ko:"야간 분류/적재", zh:"夜間分揀/裝載", en:"Night Sorting / Loading" },
    { ko:"야간 배송", zh:"夜間配送", en:"Night Delivery" },
    { ko:"회수/정리", zh:"回收/整理", en:"Pickup/整理" },
    { ko:"마감 보고", zh:"結束回報", en:"Final Report" },
  ],
};

const CHECKLIST_ = [
  {
    title: { ko:"안전교육 이수", zh:"完成安全教育", en:"Complete Safety Training" },
    desc: { ko:"기본 안전 수칙 및 현장 위험 요소를 숙지합니다.", zh:"熟悉基本安全規範與現場風險。", en:"Understand core safety rules and field risks." }
  },
  {
    title: { ko:"화물운송종사자 자격증", zh:"貨運從業資格證", en:"Freight Qualification" },
    desc: { ko:"업무 시작 전 필수 요건을 확인합니다.", zh:"上工前確認必備條件。", en:"Confirm required qualification before starting." }
  },
  {
    title: { ko:"업무 앱/장비 점검", zh:"檢查App/設備", en:"Check App & Equipment" },
    desc: { ko:"단말/앱 로그인, 배터리/충전 상태 등을 확인합니다.", zh:"確認登入、電量與充電狀態。", en:"Check login, battery and charging status." }
  },
  {
    title: { ko:"문의/지원 채널 안내", zh:"諮詢/支援管道", en:"Support Channels" },
    desc: { ko:"문제 발생 시 바로 연락할 수 있는 채널을 제공합니다.", zh:"提供問題發生時的聯絡方式。", en:"Provide channels to contact immediately when needed." }
  },
];

const INCOME_STRUCTURE_ = [
  { ko:"수익은 ‘물량/라우트/근무 형태’에 따라 달라질 수 있습니다.", zh:"收益會依「貨量/路線/班別」而不同。", en:"Earnings vary by volume/route/shift type." },
  { ko:"정산은 투명한 기준과 주기로 진행됩니다.", zh:"結算依透明標準與週期進行。", en:"Settlement follows transparent rules and cycles." },
  { ko:"비용(유류/보험/차량 등)은 개인 상황에 따라 달라질 수 있습니다.", zh:"成本（油資/保險/車輛等）因人而異。", en:"Costs (fuel/insurance/vehicle) vary by individual." },
];

const SETTLEMENT_ = [
  { ko:"정산 주기: 회사 정책에 따라 안내", zh:"結算週期：依公司政策說明", en:"Settlement cycle: per company policy" },
  { ko:"정산 방식: 투명한 기준으로 안내", zh:"結算方式：以透明基準說明", en:"Settlement method: explained with clear criteria" },
  { ko:"문의는 담당자/채널로 즉시 연결", zh:"問題可立即聯繫負責人/管道", en:"Questions are routed to 담당자/channel quickly" },
];

const CONTRACT_STEPS_ = [
  { ko:"기본 상담", zh:"基本諮詢", en:"Initial Talk" },
  { ko:"조건 확인", zh:"條件確認", en:"Check Requirements" },
  { ko:"서류/자격 확인", zh:"文件/資格確認", en:"Docs & Qualification" },
  { ko:"계약 진행", zh:"簽約", en:"Contract" },
  { ko:"업무 시작", zh:"開始上工", en:"Start Work" },
];

const CONTRACT_CHECKS_ = [
  { ko:"근무 형태/시간/휴무 기준", zh:"班別/時間/休假基準", en:"Shift/time/off-day rules" },
  { ko:"필수 자격 및 준비물", zh:"必備資格與準備物", en:"Required qualifications and items" },
  { ko:"정산 주기와 확인 방법", zh:"結算週期與查詢方式", en:"Settlement schedule and how to verify" },
];

function fallbackContent_() {
  // Used if API fails or GAS URL not set.
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    meta: {
      companyName: { ko: "(주)준은로지스틱스", zh: "(株)Juneun Logistics", en: "JE Logistics Co., Ltd." },
      homeHeadline: UI_TEXT_.homeHeadline,
      homeSubheadline: UI_TEXT_.homeSubheadline,
      videoUrl: { ko: "assets/hero.mp4", zh: "assets/hero.mp4", en: "assets/hero.mp4" }
    },
    timeline: [
      { year:"2020", ko:{title:"시작", desc:"사업 시작"}, zh:{title:"開始", desc:"事業開始"}, en:{title:"Founded", desc:"Business started"} },
      { year:"2023", ko:{title:"확장", desc:"운영 확대"}, zh:{title:"擴張", desc:"擴大營運"}, en:{title:"Expanded", desc:"Operation scale-up"} },
    ],
    stats: [
      { key:"routes", value:"16", labels:{ ko:"운영 라우트 수", zh:"路線數", en:"Routes" } },
      { key:"drivers", value:"120", labels:{ ko:"기사 수", zh:"司機人數", en:"Drivers" } },
      { key:"years", value:"6", labels:{ ko:"운영 기간(년)", zh:"營運年數", en:"Years" } },
    ],
    faq_contract: [
      { ko:{q:"계약은 어떻게 진행되나요?", a:"단계별 안내를 따라 투명하게 진행됩니다."},
        zh:{q:"合約如何進行？", a:"依步驟說明透明進行。"},
        en:{q:"How does the contract work?", a:"We follow a step-by-step transparent process."}
      }
    ],
    diff_points: [
      { ko:{title:"복지 지원", desc:"현장 중심 지원"}, zh:{title:"福利支援", desc:"以現場為中心"}, en:{title:"Welfare", desc:"Field-first support"} }
    ],
  };
}
