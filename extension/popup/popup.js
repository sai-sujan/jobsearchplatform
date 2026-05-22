/**
 * CareerOS Extension Popup
 */

const DASHBOARD_URL = "http://localhost:3000";

// ── DOM refs ──────────────────────────────────────────────────────────────────

const screens = {
  auth: document.getElementById("screen-auth"),
  main: document.getElementById("screen-main"),
  loading: document.getElementById("screen-loading"),
};

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  showScreen("loading");
  const res = await chrome.runtime.sendMessage({ type: "GET_SESSION" });
  if (res?.ok && res?.user) {
    document.getElementById("user-greeting").textContent = res.offline
      ? `Signed in as ${res.user.username} · backend offline`
      : `Signed in as ${res.user.username}`;
    showScreen("main");
    loadRecentJobs();
  } else {
    showScreen("auth");
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

document.getElementById("btn-login").addEventListener("click", async () => {
  const username = document.getElementById("input-username").value.trim();
  const password = document.getElementById("input-password").value;
  const errorEl = document.getElementById("auth-error");

  if (!username || !password) {
    errorEl.textContent = "Please enter username and password";
    errorEl.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("btn-login");
  btn.textContent = "Signing in…";
  btn.disabled = true;
  errorEl.classList.add("hidden");

  const res = await chrome.runtime.sendMessage({ type: "LOGIN", username, password });

  if (res?.ok) {
    document.getElementById("user-greeting").textContent = `Signed in as ${res.user?.username || username}`;
    showScreen("main");
    loadRecentJobs();
  } else {
    errorEl.textContent = res?.error || "Login failed";
    errorEl.classList.remove("hidden");
    btn.textContent = "Sign in";
    btn.disabled = false;
  }
});

// Allow Enter key to submit
["input-username", "input-password"].forEach((id) => {
  document.getElementById(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-login").click();
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

document.getElementById("btn-logout").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "LOGOUT" });
  showScreen("auth");
});

// ── Save job ──────────────────────────────────────────────────────────────────

document.getElementById("btn-save-job").addEventListener("click", async () => {
  const btn = document.getElementById("btn-save-job");
  const feedback = document.getElementById("save-feedback");

  btn.disabled = true;
  btn.innerHTML = "<span>⏳</span> Saving…";
  feedback.classList.add("hidden");

  // Ask the active tab's content script to detect + save the job
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showFeedback("error", "No active tab found");
    resetSaveBtn(btn);
    return;
  }

  // Inject detector if not already present
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: detectJobOnPage,
    });
    const job = results?.[0]?.result;
    if (!job) {
      showFeedback("error", "No job detected on this page");
      resetSaveBtn(btn);
      return;
    }

    const res = await chrome.runtime.sendMessage({ type: "SAVE_JOB", job });
    if (res?.ok) {
      const msg = res.created ? "✓ Saved!" : "✓ Already in your list";
      showFeedback("success", msg);
      loadRecentJobs();
    } else {
      showFeedback("error", res?.error || "Save failed");
    }
  } catch (err) {
    showFeedback("error", "Cannot access this page");
  }

  resetSaveBtn(btn);
});

function resetSaveBtn(btn) {
  btn.disabled = false;
  btn.innerHTML = "<span>⭐</span> Save this job";
}

function showFeedback(type, msg) {
  const el = document.getElementById("save-feedback");
  el.className = `feedback ${type}`;
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

// Runs in the page context to detect job data
function detectJobOnPage() {
  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function stripHtml(value) {
    const div = document.createElement("div");
    div.innerHTML = String(value || "");
    return cleanText(div.textContent || div.innerText || "");
  }

  function firstText(selectors, root = document) {
    for (const selector of selectors) {
      try {
        const el = root.querySelector(selector);
        const text = cleanText(el?.innerText || el?.textContent || el?.getAttribute?.("content") || "");
        if (text) return text;
      } catch (_) {}
    }
    return "";
  }

  function metaContent(selectors) {
    for (const selector of selectors) {
      try {
        const value = document.querySelector(selector)?.content;
        if (cleanText(value)) return cleanText(value);
      } catch (_) {}
    }
    return "";
  }

  function findJobPosting(data) {
    if (!data) return null;
    const type = data["@type"];
    if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return data;
    if (Array.isArray(data)) {
      for (const item of data) {
        const found = findJobPosting(item);
        if (found) return found;
      }
    }
    if (typeof data === "object") {
      for (const value of Object.values(data)) {
        const found = findJobPosting(value);
        if (found) return found;
      }
    }
    return null;
  }

  function parseJsonLdJob() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const posting = findJobPosting(JSON.parse(script.textContent || "{}"));
        if (!posting?.title) continue;
        const org = posting.hiringOrganization;
        const loc = Array.isArray(posting.jobLocation) ? posting.jobLocation[0] : posting.jobLocation;
        const location = cleanText(
          typeof loc === "object"
            ? [loc?.address?.addressLocality, loc?.address?.addressRegion, loc?.address?.addressCountry].filter(Boolean).join(", ")
            : loc
        );
        return {
          title: cleanText(posting.title),
          company: cleanText(typeof org === "object" ? org?.name : org),
          location,
          description: stripHtml(posting.description).slice(0, 4000),
          url: window.location.href,
          source: "json-ld",
        };
      } catch (_) {}
    }
    return null;
  }

  function looksLikeJobTitle(text) {
    const value = cleanText(text);
    if (!value || value.length > 160) return false;
    if (/jobs based|recommended jobs|search results|people also viewed|similar jobs|premium|job match/i.test(value)) return false;
    return /engineer|developer|scientist|analyst|manager|designer|architect|consultant|specialist|intern|associate|director|lead|data|software|machine learning|ai|product|security|devops|cloud|full stack|backend|frontend/i.test(value);
  }

  function titleFromDocument() {
    const ogTitle = metaContent(['meta[property="og:title"]', 'meta[name="twitter:title"]']);
    const candidates = [
      firstText(["h1"]),
      firstText(['[data-testid*="title" i]', '[data-automation-id*="title" i]']),
      ogTitle.replace(/\s+\|.*$/, "").replace(/\s+-\s+LinkedIn.*$/i, ""),
      cleanText(document.title).replace(/\s+\|.*$/, "").replace(/\s+-\s+LinkedIn.*$/i, ""),
    ];
    return candidates.find(looksLikeJobTitle) || "";
  }

  function companyFromHost() {
    return cleanText(
      metaContent(['meta[property="og:site_name"]', 'meta[name="application-name"]']) ||
      window.location.hostname.replace(/^www\./, "").split(".")[0].replace(/[-_]/g, " ")
    );
  }

  const h = window.location.hostname;
  const structured = parseJsonLdJob();
  if (structured?.title && !h.includes("dice.com")) return structured;
  let title = "", company = "", location = "", description = "";

  if (h.includes("dice.com")) {
    const diceJob = parseDiceJob();
    if (structured?.title) {
      return {
        ...structured,
        company: diceJob?.company || structured.company,
        location: structured.location || diceJob?.location || "",
        description: (diceJob?.description && diceJob.description.length > (structured.description || "").length)
          ? diceJob.description
          : structured.description,
        source: "dice",
        employment_type: diceJob?.employment_type,
        contact_info: diceJob?.contact_info,
      };
    }
    if (diceJob?.title) return diceJob;
  } else if (h.includes("linkedin.com")) {
    const detailsRoot =
      document.querySelector(".jobs-search__job-details--container") ||
      document.querySelector(".jobs-details") ||
      document.querySelector(".scaffold-layout__detail") ||
      document.querySelector("main") ||
      document;

    title =
      firstText([
        ".job-details-jobs-unified-top-card__job-title h1",
        ".job-details-jobs-unified-top-card__job-title a",
        ".jobs-unified-top-card__job-title h1",
        ".jobs-unified-top-card__job-title a",
        ".job-details-jobs-unified-top-card__title",
        ".jobs-unified-top-card__job-title",
        "h1.t-24",
        ".view-column h2",
        "[class*='job-title' i] h1",
        "[class*='job-title' i]",
        "h1",
      ], detailsRoot) ||
      titleFromDocument() ||
      firstText([
        ".jobs-search-results-list .jobs-search-results__list-item[aria-selected='true'] [aria-hidden='true']",
        ".jobs-search-results-list .jobs-search-results__list-item--active a",
        ".job-card-list__title",
        ".job-card-container__link",
      ]);

    company =
      firstText([
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name",
        ".topcard__org-name-link",
        ".jobs-unified-top-card__subtitle-primary-grouping a",
        ".jobs-unified-top-card__subtitle-grid-item a",
        "a[href*='/company/']",
      ], detailsRoot) ||
      firstText([
        ".jobs-search-results-list .jobs-search-results__list-item[aria-selected='true'] .job-card-container__primary-description",
        ".job-card-container--clickable .job-card-container__primary-description",
      ]) ||
      companyFromHost();

    location = firstText([
      ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
      ".job-details-jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__bullet",
      ".topcard__flavor--bullet",
      "[class*='location' i]",
    ], detailsRoot);

    description = firstText([
      ".jobs-description__content",
      ".jobs-box__html-content",
      "#job-details",
      ".description__text",
      "[class*='description' i]",
    ], detailsRoot);
  } else if (h.includes("indeed.com")) {
    title = firstText(['[data-testid="jobsearch-JobInfoHeader-title"] span', "h1.jobsearch-JobInfoHeader-title", "h1"]);
    company = firstText(['[data-testid="inlineHeader-companyName"] a', '[data-testid="inlineHeader-companyName"]']) || companyFromHost();
    location = firstText(['[data-testid="job-location"]', '[data-testid="inlineHeader-companyLocation"]']);
    description = firstText(["#jobDescriptionText"]);
  } else if (h.includes("greenhouse.io")) {
    title = firstText([".app-title", "h1.posting-headline", "h1"]);
    company = firstText([".company-name"]) || (window.location.pathname.split("/")[1] || "").replace(/-/g, " ") || companyFromHost();
    location = firstText([".location", ".office-location"]);
    description = firstText(["#content", "main"]);
  } else if (h.includes("lever.co")) {
    title = firstText([".posting-headline h2", "h2", "h1"]);
    company = firstText([".main-header-text .company-name"]) || (window.location.pathname.split("/")[1] || "").replace(/-/g, " ") || companyFromHost();
    location = firstText([".sort-by-time.posting-category", ".location"]);
    description = firstText([".posting-description", "main"]);
  } else if (h.includes("myworkdayjobs.com")) {
    title = firstText(['[data-automation-id="jobPostingHeader"]', "h1", "h2"]);
    company = firstText(['[data-automation-id="headerTitle"]']) || companyFromHost();
    location = firstText(['[data-automation-id="locations"]']);
    description = firstText(['[data-automation-id="jobPostingDescription"]', "main"]);
  } else {
    const pathLooksJobLike = /job|career|opening|position|apply|requisition|posting|vacanc|role/i.test(window.location.href);
    title = titleFromDocument() || firstText(["h1", '[class*="job"][class*="title" i]', '[data-testid*="title" i]', '[data-automation-id*="title" i]']);
    company = firstText(['[class*="company" i]', '[data-testid*="company" i]', '[data-automation-id*="company" i]', 'a[href*="/company/"]']) || companyFromHost();
    location = firstText(['[class*="location" i]', '[data-testid*="location" i]', '[data-automation-id*="location" i]', '[class*="office" i]']);
    description = firstText(['[class*="description" i]', '[data-testid*="description" i]', '[data-automation-id*="description" i]', "article", "main"]);
    if (!pathLooksJobLike && !looksLikeJobTitle(title)) title = "";
  }

  if (!title) return null;
  return { title, company, location, description: description.slice(0, 4000), url: window.location.href, source: "extension" };

  function parseDiceJob() {
    const root =
      document.querySelector('[data-testid="jobDetailsContainer"]') ||
      document.querySelector('[data-cy="jobDetails"]') ||
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.body;
    const title =
      firstText(['[data-cy="jobTitle"]', 'h1[class*="title" i]', "h1"], root) ||
      titleFromDocument();
    if (!title) return null;
    const company =
      firstText(['[data-cy="companyNameLink"]', '[data-cy="companyName"]', '[class*="employer" i]', '[class*="company" i]'], root) ||
      companyFromHost();
    const location = firstText(['[data-cy="location"]', '[class*="location" i]'], root);
    const descEl =
      root.querySelector('[data-testid="jobDescription"]') ||
      root.querySelector('[class*="job-description" i]') ||
      root.querySelector('[id*="jobDescription" i]');
    const description = [
      cleanText(descEl?.innerText || descEl?.textContent || ""),
      cleanText(root?.innerText || "").slice(0, 3000),
    ].filter(Boolean).join(" ").slice(0, 8000);
    const scanText = description.toUpperCase();
    const employmentBits = [];
    if (/\bCONTRACT[-\s]W[-\s]?2\b/.test(scanText)) employmentBits.push("Contract W2");
    else {
      if (/\bW[-\s]?2\b/.test(scanText)) employmentBits.push("W2");
      if (/\bCONTRACT\b/.test(scanText)) employmentBits.push("Contract");
    }
    if (/NO[-\s]?C[-\s]?2[-\s]?C\b|NO\s+CORP[-\s]?TO[-\s]?CORP/.test(scanText)) employmentBits.push("No C2C");
    else if (/\bC[-\s]?2[-\s]?C\b|CORP[-\s]TO[-\s]CORP|CORP2CORP/.test(scanText)) employmentBits.push("C2C");
    if (/\b1099\b/.test(scanText)) employmentBits.push("1099");

    return {
      title,
      company,
      location,
      description,
      url: window.location.href,
      source: "dice",
      employment_type: employmentBits.join(", ") || undefined,
      contact_info: extractDiceContact(root, company),
    };
  }

  function diceTextWithLines(el) {
    return String(el?.innerText || el?.textContent || "")
      .split(/\n+/)
      .map(cleanText)
      .filter(Boolean)
      .join("\n");
  }

  function cleanDiceContactRaw(value) {
    return String(value || "")
      .split(/\n+/)
      .map(cleanText)
      .filter((line) => line && !/^(contact the job poster|view profile)$/i.test(line))
      .join("\n");
  }

  function findDiceContactCard(root) {
    const scopes = [root, document.body, document].filter(Boolean);
    for (const scope of scopes) {
      const direct =
        scope.querySelector?.('[data-cy="recruiterInfo"]') ||
        scope.querySelector?.('[data-cy="contactInfo"]') ||
        scope.querySelector?.('[data-testid*="recruiter" i]') ||
        scope.querySelector?.('[data-testid*="contact" i]') ||
        scope.querySelector?.('[class*="recruiter" i]') ||
        scope.querySelector?.('[class*="contact-info" i]') ||
        scope.querySelector?.('[class*="posted-by" i]');
      if (direct) return direct;
    }

    const labelEl = Array.from(document.querySelectorAll("span, div, p, h2, h3, strong, button"))
      .find((el) => /^contact the job poster$/i.test(cleanText(el.innerText || el.textContent || "")));
    if (!labelEl) return null;

    let node = labelEl;
    for (let i = 0; i < 6 && node; i += 1) {
      const text = diceTextWithLines(node);
      if (/contact the job poster/i.test(text) && /recruiter|hiring|talent|@/i.test(text) && text.length < 1400) {
        return node;
      }
      node = node.parentElement;
    }
    return labelEl.parentElement || labelEl;
  }

  function extractDiceContact(root, jobCompany) {
    const contactEl = findDiceContactCard(root);
    const contactRaw = cleanDiceContactRaw(diceTextWithLines(contactEl));
    const scanText = [contactRaw, cleanText(document.body?.innerText || root?.innerText || root?.textContent || "")].filter(Boolean).join("\n").slice(0, 12000);
    const contactInfo = {};
    const emailMatch = scanText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) contactInfo.email = emailMatch[0];
    const phoneMatch = scanText.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (phoneMatch) contactInfo.phone = phoneMatch[0].trim();
    const name = dicePersonName(scanText) || contactRaw.split(/\n+/).map(dicePersonName).find(Boolean);
    if (name) contactInfo.name = name;
    const titleLine = contactRaw.split(/\n+/).map(cleanText).find((line) => /\b(recruiter|hiring manager|talent acquisition|sourcer)\b/i.test(line));
    if (titleLine) contactInfo.title = titleLine.slice(0, 160);
    const titleCompany = titleLine?.match(/@\s*(.+)$/)?.[1] || "";
    if (titleCompany) contactInfo.company = cleanText(titleCompany).slice(0, 160);
    else if (jobCompany) contactInfo.company = jobCompany;
    if (contactRaw) contactInfo.raw = contactRaw.slice(0, 1000);
    return contactInfo.name || contactInfo.email || contactInfo.phone ? contactInfo : undefined;
  }

  function dicePersonName(text) {
    const labeled = cleanText(text).match(/\b(?:Recruiter|Contact|Contact Name|Posted by|Hiring Manager)\b\s*:?\s*([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3})/i)?.[1] || cleanText(text);
    const value = cleanText(labeled).replace(/^(by|from)\s+/i, "");
    if (!value || value.length > 80 || /[.@]|\d|job|dice|recruiter|contact|company|employer|posted/i.test(value)) return "";
    return /^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3}$/.test(value) ? value : "";
  }
}

// ── Cover Letter ──────────────────────────────────────────────────────────────

document.getElementById("btn-cover-letter").addEventListener("click", async () => {
  const btn = document.getElementById("btn-cover-letter");
  btn.disabled = true;
  btn.innerHTML = "<span>⏳</span> Generating…";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Detect job on current page
  let jobCtx = { title: "", company: "", description: "" };
  if (tab?.id) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: detectJobOnPage,
      });
      const job = results?.[0]?.result;
      if (job) jobCtx = { title: job.title, company: job.company, description: job.description || "" };
    } catch (_) {}
  }

  const res = await chrome.runtime.sendMessage({
    type: "GENERATE_COVER_LETTER",
    payload: {
      job_title: jobCtx.title,
      company: jobCtx.company,
      job_description: (jobCtx.description || "").slice(0, 2000),
      tone: "professional",
      length: "medium",
    },
  });

  btn.disabled = false;
  btn.innerHTML = "<span>📝</span> Generate cover letter";

  if (res?.ok && res.data?.cover_letter) {
    // Show cover letter in a new tab or copy to clipboard
    await navigator.clipboard.writeText(res.data.cover_letter).catch(() => {});
    showFeedback("success", `✓ Cover letter copied! (${res.data.word_count} words)`);
  } else {
    showFeedback("error", res?.error || "Generation failed");
  }
});

// ── Autofill ──────────────────────────────────────────────────────────────────

document.getElementById("btn-autofill").addEventListener("click", async () => {
  const btn = document.getElementById("btn-autofill");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  btn.disabled = true;
  btn.innerHTML = "<span>⏳</span> Opening panel…";

  const opened = await openAutofillPanelOnTab(tab.id);
  btn.disabled = false;
  btn.innerHTML = "<span>⚡</span> Autofill application";

  if (!opened?.ok) {
    showFeedback("error", opened?.error || "Could not open autofill panel on this page");
    return;
  }

  window.close();
});

async function openAutofillPanelOnTab(tabId) {
  let response = await chrome.tabs
    .sendMessage(tabId, { type: "OPEN_CAREEROS_AUTOFILL", force: true })
    .catch(() => null);
  if (response?.ok) return response;

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content/overlay.css"],
    }).catch(() => {});
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/autofill.js", "content/ai_panel.js"],
    });
    response = await chrome.tabs
      .sendMessage(tabId, { type: "OPEN_CAREEROS_AUTOFILL", force: true })
      .catch(() => null);
    return response || { ok: false, error: "Autofill panel did not respond" };
  } catch (_) {
    return { ok: false, error: "Chrome blocked extension access to this page" };
  }
}

// ── Recent jobs ───────────────────────────────────────────────────────────────

async function loadRecentJobs() {
  const container = document.getElementById("recent-jobs");
  const res = await chrome.runtime.sendMessage({ type: "GET_RECENT_JOBS" });
  const jobs = res?.jobs?.slice(0, 5) || [];

  if (!jobs.length) {
    container.innerHTML = '<div class="loading-text">No saved jobs yet</div>';
    return;
  }

  container.innerHTML = jobs
    .map(
      (j) => `
    <div class="recent-item">
      <div class="recent-item-title">${escHtml(j.Title || j.title || "Untitled")}</div>
      <div class="recent-item-company">${escHtml(j.Company || j.company || "")} ${j.Location ? "· " + escHtml(j.Location) : ""}</div>
    </div>
  `
    )
    .join("");
}

// ── Dashboard link ────────────────────────────────────────────────────────────

document.getElementById("btn-open-dashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: DASHBOARD_URL });
});

document.getElementById("btn-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ── Boot ──────────────────────────────────────────────────────────────────────

init();
