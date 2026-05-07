/**
 * CareerOS Extension — Service Worker
 * Handles auth, API communication, and cross-tab messaging.
 */

const DEFAULT_API_BASE = "http://localhost:5001";
const STORAGE_TOKEN_KEY = "careeros_token";
const STORAGE_CSRF_KEY = "careeros_csrf";
const STORAGE_USER_KEY = "careeros_user";

async function getApiBase() {
  const data = await chrome.storage.local.get("careeros_api_base");
  return (data.careeros_api_base || DEFAULT_API_BASE).replace(/\/$/, "");
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function getStoredToken() {
  const data = await chrome.storage.local.get([STORAGE_TOKEN_KEY, STORAGE_CSRF_KEY, STORAGE_USER_KEY]);
  return {
    token: data[STORAGE_TOKEN_KEY] || null,
    csrf: data[STORAGE_CSRF_KEY] || null,
    user: data[STORAGE_USER_KEY] || null,
  };
}

async function storeSession(token, csrf, user) {
  await chrome.storage.local.set({
    [STORAGE_TOKEN_KEY]: token,
    [STORAGE_CSRF_KEY]: csrf || "",
    [STORAGE_USER_KEY]: user || null,
  });
}

async function clearToken() {
  await chrome.storage.local.remove([STORAGE_TOKEN_KEY, STORAGE_CSRF_KEY, STORAGE_USER_KEY]);
}

// ── API client ────────────────────────────────────────────────────────────────

async function apiRequest(method, path, body = null) {
  const { token, csrf } = await getStoredToken();
  if (!token) return { error: "Not authenticated", status: 401 };

  const apiBase = await getApiBase();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (csrf && method !== "GET") {
    headers["X-CSRF-Token"] = csrf;
  }

  const opts = { method, headers };
  if (body && method !== "GET") opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${apiBase}${path}`, opts);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { error: `Cannot reach CareerOS server at ${apiBase}`, status: 0 };
  }
}

function sourceFromUrl(url = "") {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("ziprecruiter.com")) return "ziprecruiter";
    if (host.includes("linkedin.com")) return "linkedin";
    if (host.includes("indeed.com")) return "indeed";
    if (host.includes("dice.com")) return "dice";
    if (host.includes("greenhouse.io")) return "greenhouse";
    if (host.includes("lever.co")) return "lever";
    if (host.includes("myworkdayjobs.com")) return "workday";
    if (host.includes("ashbyhq.com")) return "ashby";
    if (host.includes("bamboohr.com")) return "bamboohr";
    if (host.includes("smartrecruiters.com")) return "smartrecruiters";
    if (host.includes("workable.com")) return "workable";
    return "web";
  } catch (_) {
    return "web";
  }
}

function jobForSave(job = {}) {
  const source = sourceFromUrl(job.url);
  return {
    ...job,
    source: source === "web" && job.source && !["extension", "json-ld"].includes(String(job.source).toLowerCase())
      ? String(job.source).toLowerCase()
      : source,
  };
}

// ── Auto Apply tab watcher ────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url?.includes("dice.com")) return;

  const data = await chrome.storage.local.get("careerosAutoApply").catch(() => ({}));
  if (!data?.careerosAutoApply) return;

  // Inject the click logic directly — bypasses content script SPA guard
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Debounce: if already running within last 4s, skip
      const now = Date.now();
      if (window.__careeros_auto_ts && now - window.__careeros_auto_ts < 4000) return;
      window.__careeros_auto_ts = now;
      window.__careeros_submit_polling = false;

      function findBtn(pattern) {
        return Array.from(document.querySelectorAll("button")).find(
          (el) => pattern.test(el.textContent.trim()) && !el.disabled
        ) || null;
      }

      function submitAndClose() {
        const btn = findBtn(/^submit$/i);
        if (!btn) return false;
        btn.click();
        chrome.storage.local.remove("careerosAutoApply").catch(() => {});
        setTimeout(() => chrome.runtime.sendMessage({ type: "CLOSE_TAB" }).catch(() => {}), 1500);
        return true;
      }

      function pollForSubmit(maxTries = 30) {
        if (window.__careeros_submit_polling) return;
        window.__careeros_submit_polling = true;
        let tries = 0;
        const poll = setInterval(() => {
          if (submitAndClose()) { clearInterval(poll); return; }
          if (++tries > maxTries) clearInterval(poll);
        }, 500);
      }

      function act(retries = 0) {
        // If Submit button is visible, we're already on the review step
        if (submitAndClose()) return;

        const nextBtn = findBtn(/^next$/i);
        if (nextBtn) {
          nextBtn.click();
          // Poll for Submit directly — no reliance on page text matching
          setTimeout(() => pollForSubmit(), 600);
          return;
        }

        // Neither Submit nor Next found — page still loading
        if (retries < 20) setTimeout(() => act(retries + 1), 700);
      }

      setTimeout(() => act(), 1200);
    },
  }).catch(() => {});
});

// ── Message handlers ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CLOSE_TAB") {
    const tabId = sender.tab.id;
    // Clear Dice's beforeunload handler in MAIN world first, then close
    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        window.onbeforeunload = null;
        window.addEventListener("beforeunload", (e) => { delete e.returnValue; }, { capture: true });
      },
    }).catch(() => {}).finally(() => {
      setTimeout(() => chrome.tabs.remove(tabId, () => {}), 100);
    });
    sendResponse({ ok: true });
    return true;
  }
  handleMessage(msg).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
  return true;
});

async function handleMessage(msg) {
  switch (msg.type) {
    case "LOGIN": {
      const apiBase = await getApiBase();
      let res, data;
      try {
        res = await fetch(`${apiBase}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: msg.username, password: msg.password }),
        });
        data = await res.json().catch(() => ({}));
      } catch (err) {
        return { ok: false, error: `Cannot reach CareerOS server at ${apiBase}. Is it running?` };
      }
      if (res.ok && data.token) {
        let csrf = "";
        try {
          const cookies = await chrome.cookies.getAll({ url: apiBase });
          const csrfCookie = cookies.find((c) => c.name === "careeros_csrf");
          if (csrfCookie) csrf = csrfCookie.value;
        } catch (_) {}
        await storeSession(data.token, csrf, data.user);
        return { ok: true, user: data.user };
      }
      return { ok: false, error: data.detail || "Invalid username or password" };
    }

    case "LOGOUT": {
      await clearToken();
      return { ok: true };
    }

    case "GET_SESSION": {
      const { token, user: cachedUser } = await getStoredToken();
      if (!token) return { ok: false };

      const res = await apiRequest("GET", "/api/v1/auth/me");
      if (res.ok) {
        await chrome.storage.local.set({ [STORAGE_USER_KEY]: res.data.user });
        return { ok: true, user: res.data.user };
      }
      if (res.status === 0 && cachedUser) {
        return { ok: true, user: cachedUser, offline: true };
      }
      if (res.status === 401) await clearToken();
      return { ok: false };
    }

    case "SAVE_JOB": {
      const res = await apiRequest("POST", "/api/jobs", jobForSave(msg.job));
      if (res.ok) return { ok: true, created: res.data.created, job: res.data.job };
      return { ok: false, error: res.data?.detail || "Failed to save job" };
    }

    case "GET_AUTOFILL_PROFILE": {
      const res = await apiRequest("GET", "/api/profile/autofill");
      if (res.ok) return { ok: true, profile: res.data };
      return { ok: false, error: res.data?.detail || "Failed to load profile" };
    }

    case "GET_RECENT_JOBS": {
      const res = await apiRequest("GET", "/api/jobs?limit=5");
      if (res.ok) return { ok: true, jobs: res.data.jobs || [] };
      return { ok: false, jobs: [] };
    }

    case "GENERATE_COVER_LETTER": {
      const res = await apiRequest("POST", "/api/ai/cover-letter", msg.payload);
      if (res.ok) return { ok: true, data: res.data };
      return { ok: false, error: res.data?.detail || "Cover letter generation failed" };
    }

    case "ANSWER_QUESTION": {
      const res = await apiRequest("POST", "/api/ai/answer-question", msg.payload);
      if (res.ok) return { ok: true, data: res.data };
      return { ok: false, error: res.data?.detail || "Failed to generate answer" };
    }
    
    case "SMART_FILL": {
      const res = await apiRequest("POST", "/api/ai/smart-fill", msg.payload);
      if (res.ok) return { ok: true, data: res.data };
      return { ok: false, error: res.data?.detail || "Smart fill failed" };
    }

    default:
      return { error: "Unknown message type" };
  }
}
