const API = "https://moomooinsights-production.up.railway.app";

// ── Auth helpers ──────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("zidong_token"); }
function getUser()  { try { return JSON.parse(localStorage.getItem("zidong_user") || "null"); } catch { return null; } }
function isAdmin()  { const u = getUser(); return u && u.is_admin; }
function logout()   {
  localStorage.removeItem("zidong_token");
  localStorage.removeItem("zidong_user");
  location.href = "/index.html";
}

// ── Level system (Chinese names) ─────────────────────────────────────────────
const LEVEL_NAMES = ["","读者","分析师","研究员","策略师","投资者","交易员","专家","首席","大师","传奇"];

function getLevel(minutes) { return Math.min(10, Math.floor((minutes || 0) / 100) + 1); }
function getLevelName(level) { return LEVEL_NAMES[level] || "传奇"; }
function getLevelProgress(minutes) {
  const m = minutes || 0;
  if (m >= 1000) return 100;
  return (m % 100);
}
function getMinutesToNext(minutes) {
  const m = minutes || 0;
  if (m >= 1000) return 0;
  const level = getLevel(m);
  return Math.ceil(level * 100 - m);
}

// ── Reading time tracker ──────────────────────────────────────────────────────
(function() {
  if (!getToken()) return;
  let sessionStart = null;
  let accumulated = 0;

  function startTimer() { if (!sessionStart) sessionStart = Date.now(); }
  function pauseTimer() {
    if (sessionStart) {
      accumulated += (Date.now() - sessionStart) / 1000;
      sessionStart = null;
    }
  }
  function flush(sync) {
    pauseTimer();
    const secs = accumulated;
    accumulated = 0;
    if (secs < 1 || !getToken()) return;
    const body = JSON.stringify({ seconds: secs });
    if (sync && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(`${API}/api/users/reading-time`, blob);
    } else {
      apiFetch("/api/users/reading-time", { method: "POST", body }).then(updated => {
        if (updated) {
          const u = getUser();
          if (u) {
            u.reading_time_minutes = updated.reading_time_minutes;
            u.level = updated.level;
            localStorage.setItem("zidong_user", JSON.stringify(u));
            renderPortal();
          }
        }
      }).catch(() => {});
    }
    startTimer();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush(true); else startTimer();
  });
  window.addEventListener("beforeunload", () => flush(true));
  setInterval(() => flush(false), 60000);
  if (!document.hidden) startTimer();
})();

// ── API fetch ─────────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
  return data;
}

const apiGet    = (path)       => apiFetch(path);
const apiPost   = (path, body) => apiFetch(path, { method: "POST",   body: JSON.stringify(body) });
const apiPut    = (path, body) => apiFetch(path, { method: "PUT",    body: JSON.stringify(body) });
const apiDelete = (path)       => apiFetch(path, { method: "DELETE" });

// ── Nav ───────────────────────────────────────────────────────────────────────
function renderNav() {
  const user = getUser();
  const page = location.pathname.split("/").pop() || "index.html";

  const links = [
    { href: "index.html",       label: "首页"     },
    { href: "markets.html",     label: "市场"     },
    { href: "strategy.html",    label: "策略"     },
    { href: "trade.html",       label: "交易"     },
    { href: "community.html",   label: "社区"     },
    { href: "talk-to-pro.html", label: "专家对话" },
  ];

  const navLinks  = document.getElementById("nav-links");
  const navActions  = document.getElementById("nav-actions");
  const navUserInfo = document.getElementById("nav-user-info");
  const tickerBar   = document.getElementById("ticker-bar");

  if (navLinks) {
    navLinks.innerHTML = links.map(l =>
      `<a href="${l.href}" class="${page === l.href ? "active" : ""}">${l.label}</a>`
    ).join("");
    if (user?.is_admin) {
      navLinks.innerHTML += `<a href="admin.html" class="${page === "admin.html" ? "active" : ""}">管理</a>`;
    }
    // Close mobile nav on link click
    navLinks.querySelectorAll("a").forEach(a => a.addEventListener("click", () => navLinks.classList.remove("open")));
  }

  // Hamburger button for mobile
  if (!document.getElementById("nav-hamburger")) {
    const hamburger = document.createElement("button");
    hamburger.id = "nav-hamburger";
    hamburger.className = "nav-hamburger";
    hamburger.innerHTML = "&#9776;";
    hamburger.setAttribute("aria-label", "菜单");
    hamburger.addEventListener("click", e => {
      e.stopPropagation();
      document.getElementById("nav-links")?.classList.toggle("open");
    });
    document.querySelector(".nav-inner")?.appendChild(hamburger);
  }

  document.addEventListener("click", () => document.getElementById("nav-links")?.classList.remove("open"), { once: false });

  if (navUserInfo && navActions) {
    if (user) {
      navUserInfo.innerHTML = "";
      navActions.innerHTML = `<div id="portal-wrapper"></div>`;
      renderPortal();
    } else {
      navUserInfo.innerHTML = "";
      navActions.innerHTML = `
        <a href="login.html" class="btn btn-outline btn-sm">登录</a>
        <a href="login.html?tab=register" class="btn btn-primary btn-sm">注册</a>
      `;
    }
  }

  if (tickerBar) loadTickerBar(tickerBar);
}

// ── Portal ────────────────────────────────────────────────────────────────────
function renderPortal() {
  const wrapper = document.getElementById("portal-wrapper");
  if (!wrapper) return;
  const user = getUser();
  if (!user) return;

  const minutes  = user.reading_time_minutes || 0;
  const level    = user.level || getLevel(minutes);
  const levelName = getLevelName(level);
  const progress = getLevelProgress(minutes);
  const toNext   = getMinutesToNext(minutes);
  const initials = (user.display_name || user.email || "?").charAt(0).toUpperCase();

  let timeLabel;
  if (minutes >= 60) {
    timeLabel = (minutes / 60).toFixed(1) + " 小时";
  } else {
    timeLabel = Math.round(minutes) + " 分钟";
  }

  wrapper.innerHTML = `
    <div style="position:relative;">
      <button class="portal-btn" id="portal-toggle" onclick="togglePortal(event)">
        <div class="portal-avatar">${initials}</div>
        <span>等级 ${level}</span>
        <span class="portal-level-badge">${levelName}</span>
      </button>
      <div class="portal-dropdown" id="portal-dropdown">
        <div class="portal-user-header">
          <div class="portal-avatar-lg">${initials}</div>
          <div>
            <div class="portal-user-name">${user.display_name || user.email.split("@")[0]}</div>
            <div class="portal-user-email">${user.email}</div>
          </div>
        </div>
        <div class="portal-level-section">
          <div class="portal-level-row">
            <div>
              <span class="portal-level-num">等级 ${level}</span>
              <span class="portal-level-name" style="margin-left:8px;">${levelName}</span>
            </div>
            ${level < 10
              ? `<span class="portal-level-next">${toNext} 分钟升至等级 ${level + 1}</span>`
              : `<span class="portal-level-next" style="color:var(--red);">最高等级</span>`
            }
          </div>
          <div class="portal-progress-track">
            <div class="portal-progress-fill" style="width:${progress}%"></div>
          </div>
          <div class="portal-progress-label">
            <span>${level < 10 ? Math.floor(minutes % 100) : 100} / 100 分钟</span>
            <span>${level < 10 ? "等级 " + (level + 1) + " — " + getLevelName(level + 1) : "传奇等级"}</span>
          </div>
        </div>
        <hr class="portal-divider">
        <div class="portal-stat-row">
          <span class="portal-stat-label">总阅读时长</span>
          <span class="portal-stat-val">${timeLabel}</span>
        </div>
        <div class="portal-stat-row">
          <span class="portal-stat-label">等级称号</span>
          <span class="portal-stat-val">${levelName}</span>
        </div>
        ${user.is_admin
          ? `<div class="portal-stat-row"><span class="portal-stat-label">身份</span><span class="portal-stat-val" style="color:var(--red);">管理员</span></div>`
          : ""
        }
        ${!user.is_premium
          ? `<a href="payment.html" class="portal-premium-btn">
               <span>⭐ 升级专业版</span>
               <span class="portal-premium-badge">PRO</span>
             </a>`
          : `<div class="portal-premium-active">⭐ 专业会员</div>`
        }
        <button class="portal-logout-btn" onclick="logout()">退出登录</button>
      </div>
    </div>
  `;
}

function togglePortal(e) {
  e.stopPropagation();
  document.getElementById("portal-dropdown")?.classList.toggle("open");
}

document.addEventListener("click", e => {
  if (!e.target.closest("#portal-wrapper")) {
    document.getElementById("portal-dropdown")?.classList.remove("open");
  }
});

// ── Ticker bar ────────────────────────────────────────────────────────────────
async function loadTickerBar(container) {
  try {
    const data = await apiGet("/api/markets");
    const items = data.indices || [];
    const html = items.map(i => {
      const cls  = i.change_pct >= 0 ? "up" : "dn";
      const sign = i.change_pct >= 0 ? "+" : "";
      return `<span class="ticker-item">
        <span class="label">${i.symbol}</span>
        <span class="price">${formatPrice(i.price, i.symbol)}</span>
        <span class="${cls}">${sign}${i.change_pct.toFixed(2)}%</span>
      </span>`;
    }).join("");
    // duplicate for seamless loop
    container.innerHTML = `<div class="ticker-scroll">${html}${html}</div>`;
  } catch {
    container.innerHTML = `<div class="ticker-scroll"><span class="ticker-item"><span class="label">市场数据加载中...</span></span></div>`;
  }
}

function formatPrice(price, symbol) {
  if (!price) return "-";
  if (symbol === "USDSGD") return price.toFixed(4);
  if (price > 10000) return price.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  return price.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = "default") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Format helpers ────────────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function formatRev(v) {
  if (!v) return "-";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}万亿`;
  if (v >= 1e8)  return `$${(v / 1e8).toFixed(2)}亿`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function surpriseColor(pct) {
  if (pct == null) return "";
  return pct > 0 ? "td-up" : "td-dn";
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add("open"); }
function closeModal(id) { document.getElementById(id)?.classList.remove("open"); }

// Close modal on overlay click
document.addEventListener("click", e => {
  if (e.target.classList.contains("modal-overlay")) {
    e.target.classList.remove("open");
  }
});

// ── Category helpers ──────────────────────────────────────────────────────────
function translateCategory(cat) {
  const map = {
    "Daily Brief":     "每日简报",
    "Market Analysis": "市场分析",
    "Earnings":        "财报速递",
    "Macro":           "宏观策略",
    "Equity":          "股票策略",
    "Credit":          "信用策略",
    "TSLA":            "特斯拉",
    "NVDA":            "英伟达",
  };
  return map[cat] || cat;
}

function translateAuthor(author) {
  const map = {
    "Trader Moo":                        "交易大师",
    "Moomoo Insights":                   "紫东投研",
    "Moomoo Research Team":              "紫东研究团队",
    "Moomoo Investment Research Team":   "紫东投研团队",
    "Moomoo Investment Strategy Team":   "紫东投研团队",
  };
  return map[author] || author;
}

function categoryEmoji(cat) {
  const map = {
    "Market Analysis": "📊", "Earnings": "💰", "Economy": "🌐",
    "Tech": "💻", "Energy": "⚡", "Healthcare": "🏥",
    "Macro": "🌐", "Equity": "📈", "Credit": "💳",
    "TSLA": "🚗", "NVDA": "🟢", "Daily Brief": "📋",
  };
  return map[cat] || "📰";
}

// ── Article card ──────────────────────────────────────────────────────────────
function articleCardHTML(a) {
  const title    = a.title_zh_cn   || a.title   || "";
  const excerpt  = a.excerpt_zh_cn || a.excerpt || "";
  const author   = translateAuthor(a.author || "紫东投研");
  const catLabel = translateCategory(a.category || "Market Analysis");

  return `
    <div class="article-card" onclick="location.href='article.html?id=${a.id}'">
      <div class="article-card-img-placeholder">${categoryEmoji(a.category)}</div>
      <div class="article-card-body">
        <div class="article-card-category">${catLabel}</div>
        <div class="article-card-title">${title}</div>
        <div class="article-card-excerpt">${excerpt}</div>
        <div class="article-card-meta">
          <span>${author}</span>
          <span class="dot">·</span>
          <span>${formatDate(a.created_at)}</span>
        </div>
      </div>
    </div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", renderNav);
