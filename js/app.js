import { login, logout, verifyToken } from "./db.js";
import { hydrateIcons } from "./icons.js";
import { toast } from "./utils.js";

const routes = {
  dashboard: () => import("./pages/dashboard.js"),
  employees: () => import("./pages/employees.js"),
  attendance: () => import("./pages/attendance.js"),
  sales: () => import("./pages/sales.js"),
  stock: () => import("./pages/stock.js"),
  expenses: () => import("./pages/expenses.js"),
  feedback: () => import("./pages/feedback.js"),
  reports: () => import("./pages/reports.js"),
  target: () => import("./pages/targets.js"),
  settings: () => import("./pages/settings.js"),
};

const titles = {
  dashboard: "Dashboard", employees: "Employees", attendance: "Attendance",
  sales: "Daily Sales", stock: "Stock In / Out", expenses: "Expenses",
  feedback: "Customer Feedback", reports: "Reports", target: "Monthly Target", settings: "Settings & Backup",
};

const pageRoot = document.getElementById("page-root");
const topbarTitle = document.getElementById("topbar-title");
const topbarDate = document.getElementById("topbar-date");

topbarDate.textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "short", day: "2-digit", month: "short", year: "numeric",
});

// ---------------- Auth wiring ----------------
const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in…";
  try {
    await login(document.getElementById("login-password").value);
    showApp();
  } catch (err) {
    loginError.textContent = err.message || "Couldn't sign in. Check your connection and try again.";
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign in";
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await logout();
  showLogin();
});

function showApp() {
  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  startRouting();
}
function showLogin() {
  appShell.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

(async function initAuth() {
  const ok = await verifyToken();
  if (ok) showApp();
  else showLogin();
})();

// ---------------- Mobile nav ----------------
const hamburgerBtn = document.getElementById("hamburger-btn");
const moreSheet = document.getElementById("more-sheet");
document.getElementById("more-close").addEventListener("click", () => moreSheet.classList.add("hidden"));
moreSheet.addEventListener("click", (e) => { if (e.target === moreSheet) moreSheet.classList.add("hidden"); });

hamburgerBtn.addEventListener("click", () => moreSheet.classList.remove("hidden"));

document.querySelectorAll("#nav-mobile a, #more-sheet a").forEach((a) => {
  a.addEventListener("click", (e) => {
    if (a.dataset.route === "more") {
      e.preventDefault();
      moreSheet.classList.remove("hidden");
    } else {
      moreSheet.classList.add("hidden");
    }
  });
});

// ---------------- Router ----------------
let routingStarted = false;
function startRouting() {
  if (routingStarted) { renderRoute(); return; }
  routingStarted = true;
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
}

async function renderRoute() {
  const hash = window.location.hash.replace(/^#\//, "") || "dashboard";
  const routeName = routes[hash] ? hash : "dashboard";

  document.querySelectorAll(".nav a, .tabbar a").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === routeName);
  });
  topbarTitle.textContent = titles[routeName] || "Maybell";

  pageRoot.innerHTML = `<div class="loading-cell" style="padding:60px 0"><span class="spinner"></span> Loading…</div>`;
  hydrateIcons(pageRoot);

  try {
    const mod = await routes[routeName]();
    pageRoot.innerHTML = "";
    await mod.render(pageRoot);
    hydrateIcons(pageRoot);
  } catch (err) {
    console.error(err);
    pageRoot.innerHTML = `<div class="card card-pad">Something went wrong loading this page. Please refresh.</div>`;
    toast("Failed to load page", "error");
  }
}

hydrateIcons(document);
