/**
 * CareerOS Content Script — Job Detector & Save Overlay
 * Runs on job listing pages. Detects job info and injects a floating pill.
 */

(async () => {
  // Each script instance gets a unique token. Old observeSpaNav callbacks check this
  // and bail if a newer script has taken over — prevents stale observers from removing
  // elements injected by the new script.
  const SENTINEL_ID = "careeros-sentinel";
  const myToken = Date.now().toString();
  document.getElementById(SENTINEL_ID)?.remove();
  const sentinel = document.createElement("meta");
  sentinel.id = SENTINEL_ID;
  sentinel.dataset.token = myToken;
  (document.head || document.documentElement).appendChild(sentinel);

  // Remove any UI left by a previous (now-invalidated) script instance
  ["careeros-save-pill","careeros-save-sidecar","careeros-save-launcher","careeros-filter-bar"]
    .forEach((id) => document.getElementById(id)?.remove());

  const PILL_ID = "careeros-save-pill";
  const SIDECAR_ID = "careeros-save-sidecar";
  const LAUNCHER_ID = "careeros-save-launcher";
  const FILTER_BAR_ID = "careeros-filter-bar";
  let renderedJobKey = "";
  let detectInFlight = false;
  let rerunQueued = false;

  function removePill() {
    document.getElementById(PILL_ID)?.remove();
    document.getElementById(SIDECAR_ID)?.remove();
    document.getElementById(LAUNCHER_ID)?.remove();
    document.getElementById("careeros-save-pill")?.remove();
    document.getElementById(FILTER_BAR_ID)?.remove();
  }

  function escHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  // Normalize LinkedIn URLs: extract job ID from search-results ?currentJobId=NNN
  // so extension-saved URLs match scraper-stored /jobs/view/NNN/ format.
  function canonicalJobUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("linkedin.com")) {
        const jobId = parsed.searchParams.get("currentJobId");
        if (jobId) return `https://www.linkedin.com/jobs/view/${jobId}/`;
        const viewMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)/);
        if (viewMatch) return `https://www.linkedin.com/jobs/view/${viewMatch[1]}/`;
      }
    } catch (_) {}
    return url;
  }

  function sourceFromUrl(url = window.location.href) {
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

  function websiteFromUrl(url = window.location.href) {
    try {
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch (_) {
      return "";
    }
  }

  function jobForSave(job) {
    const url = canonicalJobUrl(job?.url || window.location.href);
    return {
      ...job,
      url,
      source: sourceFromUrl(url),
      website: websiteFromUrl(url),
    };
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
      for (const val of Object.values(data)) {
        const found = findJobPosting(val);
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
        const company = cleanText(typeof org === "object" ? org?.name : org);
        const loc = Array.isArray(posting.jobLocation) ? posting.jobLocation[0] : posting.jobLocation;
        const location = cleanText(
          typeof loc === "object"
            ? [loc?.address?.addressLocality, loc?.address?.addressRegion, loc?.address?.addressCountry].filter(Boolean).join(", ")
            : loc
        );
        return {
          title: cleanText(posting.title),
          company,
          location,
          description: stripHtml(posting.description).slice(0, 8000),
          url: canonicalJobUrl(window.location.href),
          source: sourceFromUrl(),
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

  function getDiceChipText() {
    // Dice uses CSS-module hashed class names — target by structure/content instead
    const container =
      document.querySelector('[data-testid="jobDetailsContainer"]') ||
      document.querySelector('[data-cy="jobDetails"]') ||
      document.querySelector('article') ||
      document.querySelector('main') ||
      document.body;
    return cleanText(container?.innerText || "").slice(0, 3000);
  }

  async function detectJob() {
    const host = window.location.hostname;
    let parsed = parseJsonLdJob();

    if (host.includes("dice.com")) {
      const chipText = getDiceChipText();
      if (parsed?.title) {
        if (chipText) parsed.description = [parsed.description, chipText].filter(Boolean).join(" ").slice(0, 8000);
        return parsed;
      }
      parsed = parseDice();
      if (parsed?.title) return parsed;
    }

    if (parsed?.title) return parsed;

    if (host.includes("linkedin.com")) {
      parsed = parseLinkedIn();
    } else if (host.includes("indeed.com")) {
      parsed = parseIndeed();
    } else if (host.includes("greenhouse.io")) {
      parsed = parseGreenhouse();
    } else if (host.includes("lever.co")) {
      parsed = parseLever();
    } else if (host.includes("myworkdayjobs.com")) {
      parsed = parseWorkday();
    } else if (host.includes("ashbyhq.com")) {
      parsed = parseAshby();
    } else if (host.includes("ziprecruiter.com")) {
      parsed = parseZipRecruiter();
    } else {
      parsed = parseGeneric();
    }

    return parsed?.title ? parsed : parseGeneric();
  }

  function injectPill(job) {
    document.getElementById(SIDECAR_ID)?.remove();
    document.getElementById(LAUNCHER_ID)?.remove();

    const pill = document.createElement("aside");
    pill.id = SIDECAR_ID;
    pill.className = "careeros-sidecar careeros-sidecar--save-only";
    pill.innerHTML = `
      <div class="careeros-sidecar-shell">
        <div class="careeros-sidecar-header">
          <div class="careeros-sidecar-brand">
            <span class="careeros-sidecar-mark">C</span>
            <div>
              <strong>CareerOS</strong>
              <span>Job workspace</span>
            </div>
          </div>
          <div class="careeros-sidecar-tools">
            <button type="button" class="careeros-sidecar-tool" title="Report an issue">Flag</button>
            <button type="button" class="careeros-sidecar-tool" title="Settings">Gear</button>
          </div>
          <button class="careeros-sidecar-close" type="button" aria-label="Close CareerOS panel">×</button>
        </div>

        <div class="careeros-sidecar-tabs" aria-label="CareerOS tools">
          <button class="active" type="button">Save</button>
          <button type="button">Match</button>
          <button type="button">Profile</button>
        </div>

        <section class="careeros-brief-card careeros-brief-card--blue">
          <button class="careeros-brief-close" type="button" data-careeros-dismiss aria-label="Hide insight">×</button>
          <div class="careeros-brief-icon">JD</div>
          <div>
            <h3>Role detected</h3>
            <p>${escHtml(job.title)}${job.company ? ` at ${escHtml(job.company)}` : ""}</p>
            <ul>
              <li>${escHtml(job.location || "Location not listed")} captured from the page.</li>
              <li>Saved roles can be tracked, tailored, and compared in CareerOS.</li>
            </ul>
          </div>
        </section>

        <section class="careeros-brief-card careeros-brief-card--green">
          <button class="careeros-brief-close" type="button" data-careeros-dismiss aria-label="Hide insight">×</button>
          <div class="careeros-brief-icon">AI</div>
          <div>
            <h3>Why save it here?</h3>
            <p>CareerOS keeps the job, resume work, notes, and application status together.</p>
            <ul>
              <li>Use the dashboard to mark saved, applied, interviewing, or rejected.</li>
              <li>Generate a targeted resume when you are ready to apply.</li>
            </ul>
          </div>
        </section>

        <section class="careeros-action-card">
          <div class="careeros-action-head">
            <span class="careeros-action-icon">S</span>
            <div>
              <strong>Save this role</strong>
              <span>Add it to your CareerOS pipeline</span>
            </div>
          </div>
          <button class="careeros-sidecar-primary" type="button" data-careeros-save-job>Save to CareerOS</button>
        </section>
        <div class="careeros-sidecar-status info" data-careeros-save-status>Saved jobs appear in your dashboard.</div>
      </div>
    `;
    document.body.appendChild(pill);

    pill.querySelector(".careeros-sidecar-close").addEventListener("click", () => {
      pill.classList.add("careeros-sidecar--closing");
      setTimeout(() => {
        pill.remove();
        injectLauncher(job);
      }, 180);
    });

    pill.querySelectorAll("[data-careeros-dismiss]").forEach((button) => {
      button.addEventListener("click", () => {
        button.closest(".careeros-brief-card")?.remove();
      });
    });

    const button = pill.querySelector("[data-careeros-save-job]");
    const status = pill.querySelector("[data-careeros-save-status]");

    pill.querySelector('[title="Settings"]')?.addEventListener("click", () => {
      chrome.runtime.openOptionsPage?.();
    });

    pill.querySelector('[title="Report an issue"]')?.addEventListener("click", () => {
      status.className = "careeros-sidecar-status info";
      status.textContent = "Report noted. You can still save this role.";
    });

    button.addEventListener("click", async () => {
      button.textContent = "Saving…";
      button.disabled = true;
      status.className = "careeros-sidecar-status info";
      status.textContent = "Sending this job to CareerOS…";

      const response = await chrome.runtime.sendMessage({ type: "SAVE_JOB", job: jobForSave(job) });

      if (response?.ok) {
        const alreadyHad = !response.created;
        status.className = "careeros-sidecar-status success";
        status.textContent = alreadyHad ? "Already saved in your dashboard." : "Saved to CareerOS.";
        button.textContent = alreadyHad ? "Already saved" : "Saved";
      } else if (response?.error === "Not authenticated" || response?.status === 401) {
        status.className = "careeros-sidecar-status warn";
        status.textContent = "Sign in from the extension popup, then save again.";
        button.textContent = "Sign in needed";
        button.disabled = false;
      } else {
        status.className = "careeros-sidecar-status error";
        status.textContent = response?.error || "Save failed. Try again.";
        button.textContent = "Retry save";
        button.disabled = false;
      }
    });
  }

  const JOB_FLAGS = [
    { key: "contractw2", pattern: /\bcontract[\s-]w[\s-]?2\b/i,                          label: "Contract W2",    tip: "Contract position requiring W2 employment" },
    { key: "w2",        pattern: /\bw[\s-]?2\b/i,                                        label: "W2 only",        tip: "Employer requires W2 employment (no C2C/1099)" },
    { key: "f2f",       pattern: /\bf2f\b|face[\s-]to[\s-]face\s+interview/i,             label: "F2F interview",  tip: "Face-to-face interview required" },
    { key: "onsite",    pattern: /in[\s-]person\s+interview|on[\s-]site\s+interview/i,    label: "On-site interview", tip: "In-person interview required" },
    { key: "local",     pattern: /must\s+be\s+local|locals?\s+only|local\s+candidates?\s+only/i, label: "Local only", tip: "Employer requires local candidates" },
    { key: "clearance", pattern: /security\s+clearance\s+required|active\s+(secret|ts|top\s+secret)/i, label: "Clearance req.", tip: "Security clearance required" },
    { key: "drug",      pattern: /drug\s+test\s+required|pre[\s-]?employment\s+drug/i,    label: "Drug test",      tip: "Pre-employment drug test required" },
    { key: "citizen",   pattern: /us\s+citizen(ship)?\s+(only|required)|must\s+be\s+(a\s+)?us\s+citizen/i, label: "US citizen only", tip: "US citizenship required" },
  ];

  function detectJobFlags(description) {
    if (!description) return [];
    const matched = JOB_FLAGS.filter((f) => f.pattern.test(description));
    const hasContractW2 = matched.some((f) => f.key === "contractw2");
    if (hasContractW2) {
      // Strip "Contract W2" occurrences — only show "W2 only" if standalone W2 exists elsewhere
      const stripped = description.replace(/\bcontract[\s-]w[\s-]?2\b/gi, "");
      return matched.filter((f) => f.key !== "w2" || /\bw[\s-]?2\b/i.test(stripped));
    }
    return matched;
  }

  function visiblePageText(limit = 60000) {
    return cleanText(document.body.innerText || "").slice(0, limit);
  }

  function detectPageFlags() {
    return detectJobFlags(visiblePageText());
  }

  function buildFlagsHtml(flags) {
    if (!flags.length) return "";
    return `<div class="careeros-flags-row">${flags.map((f) => `<span class="careeros-flag-chip" title="${escHtml(f.tip)}">&#9888; ${escHtml(f.label)}</span>`).join("")}</div>`;
  }

  function injectFlagsBar(flags) {
    if (document.getElementById(LAUNCHER_ID) || document.getElementById(SIDECAR_ID)) return;
    const bar = document.createElement("div");
    bar.id = LAUNCHER_ID;
    bar.className = "careeros-launcher-bar";
    bar.innerHTML = buildFlagsHtml(flags);
    document.body.appendChild(bar);
    makeLauncherDraggable(bar, null);
  }

  function findDiceApplyButton() {
    const byAttr = document.querySelector(
      '[data-cy="applyButton"], [data-testid="applyButton"], .apply-button-wag, button.btn-apply, a.btn-apply'
    );
    if (byAttr) return byAttr;
    return Array.from(document.querySelectorAll("button, a[href]")).find(
      (el) => /^apply$/i.test(el.textContent.trim())
    ) || null;
  }

  function injectLauncher(job) {
    if (document.getElementById(SIDECAR_ID) || document.getElementById(LAUNCHER_ID)) return;

    const flags = detectJobFlags([job.title, job.company, job.location, job.description, visiblePageText()].join(" "));
    const flagsHtml = flags.length
      ? `<div class="careeros-flags-row">${flags.map((f) => `<span class="careeros-flag-chip" title="${escHtml(f.tip)}">&#9888; ${escHtml(f.label)}</span>`).join("")}</div>`
      : "";

    const launcher = document.createElement("div");
    launcher.id = LAUNCHER_ID;
    launcher.className = "careeros-launcher-bar";
    const isDice = window.location.hostname.includes("dice.com");
    launcher.innerHTML = `
      <div class="careeros-launcher-bar-main">
        <div class="careeros-launcher-drag-handle" data-careeros-drag-handle role="button" aria-label="Move CareerOS widget" title="Drag to move">::</div>
        <button type="button" class="careeros-launcher-save" data-careeros-quick-save aria-label="Save job to CareerOS">
          <span class="careeros-launcher-bar-icon">C</span>
          <span class="careeros-launcher-bar-label">Save to CareerOS</span>
        </button>
        ${isDice ? `<button type="button" class="careeros-launcher-auto-apply" data-careeros-auto-apply aria-label="Auto Apply">&#9889; Auto Apply</button>` : ""}
        <button type="button" class="careeros-launcher-expand" data-careeros-expand aria-label="Open full panel">&#8250;</button>
      </div>
      ${flagsHtml}
    `;
    document.body.appendChild(launcher);

    const saveBtn = launcher.querySelector("[data-careeros-quick-save]");
    const autoApplyBtn = launcher.querySelector("[data-careeros-auto-apply]");
    const expandBtn = launcher.querySelector("[data-careeros-expand]");

    saveBtn.addEventListener("click", async () => {
      saveBtn.querySelector(".careeros-launcher-bar-label").textContent = "Saving…";
      saveBtn.disabled = true;
      const response = await chrome.runtime.sendMessage({ type: "SAVE_JOB", job: jobForSave(job) });
      if (response?.ok) {
        const alreadyHad = !response.created;
        saveBtn.querySelector(".careeros-launcher-bar-label").textContent = alreadyHad ? "Already saved" : "Saved!";
        launcher.classList.add("careeros-launcher-bar--saved");
      } else if (response?.error === "Not authenticated" || response?.status === 401) {
        saveBtn.querySelector(".careeros-launcher-bar-label").textContent = "Sign in first";
        saveBtn.disabled = false;
      } else {
        saveBtn.querySelector(".careeros-launcher-bar-label").textContent = "Failed — retry";
        saveBtn.disabled = false;
      }
    });

    if (autoApplyBtn) {
      autoApplyBtn.addEventListener("click", async () => {
        const applyBtn = findDiceApplyButton();
        if (!applyBtn) {
          autoApplyBtn.textContent = "No Apply btn found";
          return;
        }
        autoApplyBtn.textContent = "Applying…";
        autoApplyBtn.disabled = true;
        await chrome.storage.local.set({ careerosAutoApply: true });
        applyBtn.click();
      });
    }

    expandBtn.addEventListener("click", () => {
      launcher.remove();
      injectPill(job);
    });

    makeLauncherDraggable(launcher, null);
  }

  function makeLauncherDraggable(launcher, onClick) {
    const storageKey = "careerosLauncherPosition";
    const legacyTopKey = "careerosLauncherTop";
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let moved = false;

    function clampPosition(left, top) {
      const maxLeft = Math.max(8, window.innerWidth - launcher.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - launcher.offsetHeight - 8);
      return {
        left: Math.min(Math.max(left, 8), maxLeft),
        top: Math.min(Math.max(top, 8), maxTop),
      };
    }

    function applyPosition(left, top) {
      const next = clampPosition(left, top);
      launcher.style.left = `${next.left}px`;
      launcher.style.top = `${next.top}px`;
      launcher.style.right = "auto";
      launcher.style.bottom = "auto";
    }

    chrome.storage.local.get([storageKey, legacyTopKey]).then((data) => {
      const saved = data?.[storageKey];
      const savedLeft = Number(saved?.left);
      const savedTop = Number(saved?.top);
      if (Number.isFinite(savedLeft) && Number.isFinite(savedTop)) {
        applyPosition(savedLeft, savedTop);
        return;
      }

      const legacyTop = Number(data?.[legacyTopKey]);
      if (Number.isFinite(legacyTop)) {
        const currentLeft = launcher.getBoundingClientRect().left;
        applyPosition(currentLeft, legacyTop);
      }
    }).catch(() => {});

    launcher.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest("button") && !event.target.closest("[data-careeros-drag-handle]")) return;
      const rect = launcher.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      moved = false;
      applyPosition(startLeft, startTop);
      launcher.classList.add("careeros-launcher--dragging");
      launcher.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    launcher.addEventListener("pointermove", (event) => {
      if (!launcher.classList.contains("careeros-launcher--dragging")) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) moved = true;
      applyPosition(startLeft + deltaX, startTop + deltaY);
    });

    launcher.addEventListener("pointerup", (event) => {
      if (!launcher.classList.contains("careeros-launcher--dragging")) return;
      launcher.classList.remove("careeros-launcher--dragging");
      launcher.releasePointerCapture?.(event.pointerId);
      const rect = launcher.getBoundingClientRect();
      chrome.storage.local.set({
        [storageKey]: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
        },
      }).catch(() => {});
      if (!moved && onClick) onClick();
    });

    launcher.addEventListener("pointercancel", () => {
      launcher.classList.remove("careeros-launcher--dragging");
    });
  }

  // ── ZipRecruiter filter bar ───────────────────────────────────────────────

  function isZipSearchPage() {
    const { hostname, pathname, search } = window.location;
    if (!hostname.includes("ziprecruiter.com")) return false;
    if (/\/(?:apply|application)\b/i.test(pathname)) return false;

    const normalizedPath = pathname.replace(/\/+$/, "") || "/";
    const hasSearchParams = /(?:^|[?&])(?:search|q|keywords|location|radius)=/i.test(search);
    const looksLikeSearchPath = /^\/(?:jobs-search|jobs|candidate\/search|search|remote-jobs|online-jobs)(?:\/|$)/i.test(normalizedPath);
    const hasFilterButton =
      document.querySelector('[data-testid="filter-button-container"] button') ||
      document.querySelector('[id^="zds-header-filters-button"]') ||
      document.querySelector('[data-testid="search-filter-button"]');

    return normalizedPath === "/" || looksLikeSearchPath || hasSearchParams || Boolean(hasFilterButton);
  }

  function reactClick(el) {
    // React listens via event delegation — dispatch a real bubbling MouseEvent
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click",      { bubbles: true, cancelable: true }));
  }

  async function applyZipFilters(filters, btn) {
    const origLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Opening...";

    // Set radius=100 silently in URL (distance is not inside the filter modal)
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("radius", "100");
      history.replaceState(null, "", url.toString());
    } catch (_) {}

    // Open the filter modal
    const filterTrigger =
      document.querySelector('[data-testid="filter-button-container"] button') ||
      document.querySelector('[id^="zds-header-filters-button"]') ||
      document.querySelector('[data-testid="search-filter-button"]') ||
      document.querySelector('[aria-label*="filter" i]') ||
      Array.from(document.querySelectorAll("button")).find(
        (el) => /^filters?$/i.test(el.textContent.trim())
      );

    if (!filterTrigger) {
      btn.textContent = "No Filters btn";
      setTimeout(() => { btn.textContent = origLabel; btn.disabled = false; }, 2000);
      return;
    }

    reactClick(filterTrigger);
    await new Promise((r) => setTimeout(r, 800));

    function normalizedText(el) {
      return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
    }

    function labelMatches(el, text) {
      return normalizedText(el) === text;
    }

    function checkboxState(el) {
      if (!el) return false;
      if (el.matches?.("input[type='checkbox']")) return el.checked;
      return el.getAttribute("aria-checked") === "true" || el.dataset?.state === "checked";
    }

    function findCheckboxControl(text) {
      const selector = "input[type='checkbox'], [role='checkbox']";

      const textNodes = Array.from(document.querySelectorAll("label, span, p, div, li, button"))
        .filter((el) => labelMatches(el, text));

      for (const textEl of textNodes) {
        let node = textEl;
        for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
          const control = node.matches?.(selector)
            ? node
            : node.querySelector?.("[role='checkbox']") || node.querySelector?.("input[type='checkbox']");
          if (control && normalizedText(node).includes(text)) return control;
        }
      }

      for (const input of document.querySelectorAll("input[type='checkbox']")) {
        const lbl = input.labels?.[0] || document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (lbl && labelMatches(lbl, text)) return input;
      }

      for (const el of document.querySelectorAll("[role='checkbox']")) {
        const labelledBy = el.getAttribute("aria-labelledby");
        const ariaLabel = el.getAttribute("aria-label") || "";
        const labelledText = labelledBy
          ? labelledBy.split(/\s+/).map((id) => normalizedText(document.getElementById(id))).join(" ").trim()
          : "";
        if (labelMatches(el, text) || ariaLabel.trim() === text || labelledText === text) return el;
      }

      return null;
    }

    function selectRadio(text) {
      for (const input of document.querySelectorAll("input[type='radio']")) {
        const lbl = input.labels?.[0] || document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (lbl && labelMatches(lbl, text)) { reactClick(input); return true; }
      }
      for (const el of document.querySelectorAll("[role='radio']")) {
        if (labelMatches(el, text)) { reactClick(el); return true; }
      }
      return false;
    }

    function ensureChecked(text) {
      const checkbox = findCheckboxControl(text);
      if (!checkbox) return false;
      if (!checkboxState(checkbox)) reactClick(checkbox);
      return true;
    }

    function ensureUnchecked(text) {
      const checkbox = findCheckboxControl(text);
      if (!checkbox) return false;
      if (checkboxState(checkbox)) reactClick(checkbox);
      return true;
    }

    btn.textContent = "Setting...";

    // Radios: employment type + date posted
    for (const text of filters.radios) {
      selectRadio(text);
      await new Promise((r) => setTimeout(r, 200));
    }
    // Checkboxes: experience level (enforce the preset exactly)
    const checkboxLabels = new Set(filters.checkboxes);
    for (const text of filters.experienceCheckboxes || []) {
      if (!checkboxLabels.has(text)) {
        ensureUnchecked(text);
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    for (const text of filters.checkboxes) {
      ensureChecked(text);
      await new Promise((r) => setTimeout(r, 200));
    }

    await new Promise((r) => setTimeout(r, 400));

    // Submit
    const applyBtn = Array.from(document.querySelectorAll("button")).find(
      (el) => /apply filters/i.test(el.textContent.trim())
    );
    if (applyBtn) {
      reactClick(applyBtn);
      btn.textContent = "Done!";
    } else {
      btn.textContent = "Click Apply";
    }
    setTimeout(() => { btn.textContent = origLabel; btn.disabled = false; }, 2500);
  }

  function injectZipFilterBar() {
    if (document.getElementById(FILTER_BAR_ID)) return;
    document.getElementById(LAUNCHER_ID)?.remove();

    const flags = detectPageFlags();
    const bar = document.createElement("div");
    bar.id = FILTER_BAR_ID;
    bar.className = "careeros-launcher-bar";
    // Exact label text from ZipRecruiter modal
    const MY_FILTERS = {
      radios:      ["Contract", "Within 1 day"],
      checkboxes:  ["Mid level", "Senior level and above"],
      experienceCheckboxes: [
        "No experience needed",
        "Junior level",
        "Mid level",
        "Senior level and above",
      ],
    };
    const filterSummary = [...MY_FILTERS.radios, ...MY_FILTERS.checkboxes].join(", ");

    bar.innerHTML = `
      <div class="careeros-launcher-bar-main">
        <div class="careeros-launcher-drag-handle" data-careeros-drag-handle role="button" aria-label="Move CareerOS widget" title="Drag to move">::</div>
        <div class="careeros-filter-brand">
          <span class="careeros-launcher-bar-icon">C</span>
          <span class="careeros-filter-brand-label">CareerOS</span>
        </div>
        <button type="button" class="careeros-filter-save" data-careeros-zip-save>Save Job</button>
        <button type="button" class="careeros-filter-preset" title="${escHtml(filterSummary)}">Apply Filters</button>
      </div>
      ${buildFlagsHtml(flags)}
    `;
    document.body.appendChild(bar);

    bar.querySelector(".careeros-filter-preset").addEventListener("click", (e) => {
      applyZipFilters(MY_FILTERS, e.currentTarget);
    });

    bar.querySelector("[data-careeros-zip-save]").addEventListener("click", async (e) => {
      const saveBtn = e.currentTarget;
      const origLabel = saveBtn.textContent;
      saveBtn.textContent = "Saving...";
      saveBtn.disabled = true;

      const job = parseZipRecruiter() || parseGeneric();
      if (!job?.title) {
        saveBtn.textContent = "No job found";
        setTimeout(() => { saveBtn.textContent = origLabel; saveBtn.disabled = false; }, 2200);
        return;
      }

      const response = await chrome.runtime.sendMessage({ type: "SAVE_JOB", job: jobForSave(job) });
      if (response?.ok) {
        saveBtn.textContent = response.created ? "Saved!" : "Already saved";
        bar.classList.add("careeros-launcher-bar--saved");
      } else if (response?.error === "Not authenticated" || response?.status === 401) {
        saveBtn.textContent = "Sign in first";
        saveBtn.disabled = false;
      } else {
        saveBtn.textContent = "Failed - retry";
        saveBtn.disabled = false;
      }
    });

    makeLauncherDraggable(bar, null);
  }

  function isApplicationPage() {
    return /apply|application|candidate/i.test(window.location.href);
  }

  // On LinkedIn and other SPAs, the job changes without a full navigation
  function observeSpaNav(callback) {
    let lastUrl = window.location.href;
    let pending = null;
    new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        // Bail if a newer script instance has taken over
        const s = document.getElementById(SENTINEL_ID);
        if (!s || s.dataset.token !== myToken) return;
        const changedUrl = window.location.href !== lastUrl;
        if (changedUrl) lastUrl = window.location.href;
        callback();
      }, 700);
    }).observe(document.body, { childList: true, subtree: true });
  }

  function jobKey(job) {
    return [job?.title, job?.company, job?.location, window.location.href].map(cleanText).join("|").toLowerCase();
  }

  async function run() {
    if (detectInFlight) {
      rerunQueued = true;
      return;
    }
    detectInFlight = true;
    try {
      if (isZipSearchPage()) {
        injectZipFilterBar();
        return;
      }

      if (isApplicationPage()) {
        renderedJobKey = "";
        removePill();
        return;
      }

      // Retry detection a few times as LinkedIn and other SPAs load content dynamically.
      let job = null;
      for (let i = 0; i < 5; i++) {
        job = await detectJob();
        if (job?.title) break;
        await new Promise(r => setTimeout(r, 800 * (i + 1)));
      }

      if (job?.title) {
        const key = jobKey(job);
        if (key === renderedJobKey && (document.getElementById(SIDECAR_ID) || document.getElementById(LAUNCHER_ID))) return;
        renderedJobKey = key;
        removePill();
        injectLauncher(job);
        return;
      }

      // No job detected — still surface any flag keywords found in page text
      const pageFlags = detectPageFlags();
      if (pageFlags.length) {
        const flagKey = "flags:" + pageFlags.map((f) => f.key).join(",") + "|" + window.location.href;
        if (flagKey !== renderedJobKey) {
          renderedJobKey = flagKey;
          removePill();
          injectFlagsBar(pageFlags);
        }
        return;
      }

      renderedJobKey = "";
      removePill();
    } finally {
      detectInFlight = false;
      if (rerunQueued) {
        rerunQueued = false;
        setTimeout(run, 250);
      }
    }
  }

  await run();
  observeSpaNav(run);


  // ── Inline parsers ─────────────────────────────────────────────────────────

  function parseDice() {
    const title =
      firstText(['[data-cy="jobTitle"]', 'h1[class*="title" i]', "h1"]) ||
      titleFromDocument();
    if (!title) return null;
    const company =
      firstText(['[data-cy="companyNameLink"]', '[class*="employer" i]', '[class*="company" i]']) ||
      companyFromHost();
    const location =
      firstText(['[data-cy="location"]', '[class*="location" i]']);
    const descEl =
      document.querySelector('[data-testid="jobDescription"]') ||
      document.querySelector('[class*="job-description" i]') ||
      document.querySelector('[id*="jobDescription" i]');
    const description = cleanText(descEl?.innerText || descEl?.textContent || "");
    const chipText = getDiceChipText();

    // ── Employment type ───────────────────────────────────────────────────────
    const employmentTypeEl =
      document.querySelector('[data-cy="employmentDetail"]') ||
      document.querySelector('[data-cy="jobDetailEmploymentType"]') ||
      document.querySelector('[data-testid*="employmentType" i]') ||
      document.querySelector('[class*="employment-type" i]') ||
      document.querySelector('[class*="employmentType" i]');
    let employmentType = cleanText(employmentTypeEl?.innerText || "");
    if (!employmentType) {
      const scanText = (description + " " + chipText).toUpperCase();
      const found = [];
      const contractW2 = /\bCONTRACT[-\s]W[-\s]?2\b/.test(scanText);
      if (contractW2) found.push("Contract W2");
      else {
        if (/\bW[-\s]?2\b/.test(scanText)) found.push("W2");
        if (/\bCONTRACT\b/.test(scanText)) found.push("Contract");
      }
      const noC2c = /NO[-\s]?C[-\s]?2[-\s]?C\b|NO\s+CORP[-\s]?TO[-\s]?CORP/.test(scanText);
      const hasC2c = /\bC[-\s]?2[-\s]?C\b|CORP[-\s]TO[-\s]CORP|CORP2CORP/.test(scanText);
      if (noC2c) found.push("No C2C");
      else if (hasC2c) found.push("C2C");
      if (/\b1099\b/.test(scanText)) found.push("1099");
      if (/\bFULL[-\s]TIME\b/.test(scanText)) found.push("Full-Time");
      if (/\bPART[-\s]TIME\b/.test(scanText)) found.push("Part-Time");
      if (/\bONSITE\s+INTERVIEW\b|\bON[-\s]SITE\s+INTERVIEW\b/.test(scanText)) found.push("Onsite Interview");
      employmentType = found.join(", ");
    }

    // ── Contact info ──────────────────────────────────────────────────────────
    const recruiterEl =
      document.querySelector('[data-cy="recruiterInfo"]') ||
      document.querySelector('[data-cy="contactInfo"]') ||
      document.querySelector('[data-testid*="recruiter" i]') ||
      document.querySelector('[class*="recruiter" i]') ||
      document.querySelector('[class*="contact-info" i]');
    const contactRaw = cleanText(recruiterEl?.innerText || "");
    const contactInfo = {};
    if (contactRaw) {
      const emailMatch = contactRaw.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) contactInfo.email = emailMatch[0];
      const phoneMatch = contactRaw.match(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch) contactInfo.phone = phoneMatch[0].trim();
      const lines = contactRaw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 0 && !lines[0].includes("@") && !/\d{3}/.test(lines[0])) {
        contactInfo.name = lines[0];
      }
    }

    return {
      title,
      company,
      location,
      description: [description, chipText].filter(Boolean).join(" ").slice(0, 8000),
      url: window.location.href,
      source: "dice",
      employment_type: employmentType || undefined,
      contact_info: Object.keys(contactInfo).length > 0 ? contactInfo : undefined,
    };
  }

  function parseLinkedIn() {
    const detailsRoot =
      document.querySelector(".jobs-search__job-details--container") ||
      document.querySelector(".jobs-details") ||
      document.querySelector(".scaffold-layout__detail") ||
      document.querySelector("main") ||
      document;

    const title =
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

    const company =
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

    const location =
      firstText([
        ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
        ".job-details-jobs-unified-top-card__bullet",
        ".jobs-unified-top-card__bullet",
        ".topcard__flavor--bullet",
        "[class*='location' i]",
      ], detailsRoot);

    const description = firstText([
      ".jobs-description__content",
      ".jobs-box__html-content",
      "#job-details",
      ".description__text",
      "[class*='description' i]",
    ], detailsRoot);

    if (!title) return null;
    return { title, company, location, description: description.slice(0, 8000), url: canonicalJobUrl(window.location.href), source: "linkedin" };
  }

  function parseIndeed() {
    const title =
      document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"] span')?.innerText?.trim() ||
      document.querySelector("h1.jobsearch-JobInfoHeader-title")?.innerText?.trim() || "";
    const company =
      document.querySelector('[data-testid="inlineHeader-companyName"] a')?.innerText?.trim() ||
      document.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText?.trim() || "";
    const location =
      document.querySelector('[data-testid="job-location"]')?.innerText?.trim() ||
      document.querySelector('[data-testid="inlineHeader-companyLocation"]')?.innerText?.trim() || "";
    const description =
      document.querySelector("#jobDescriptionText")?.innerText?.trim() || "";
    if (!title || !company) return null;
    return { title, company, location, description: description.slice(0, 8000), url: window.location.href, source: "indeed" };
  }

  function parseZipRecruiter() {
    const detailsRoot =
      document.querySelector('[data-testid="job-details"]') ||
      document.querySelector('[data-testid="job-detail"]') ||
      document.querySelector('[data-testid*="job-details" i]') ||
      document.querySelector('[class*="job_details" i]') ||
      document.querySelector('[class*="jobDetails" i]') ||
      document.querySelector('[class*="job-detail" i]') ||
      document.querySelector("main") ||
      document.body;

    const activeCard =
      document.querySelector('[aria-selected="true"]') ||
      document.querySelector('[data-testid*="job-card" i][aria-current="true"]') ||
      document.querySelector('[class*="selected" i][class*="job" i]') ||
      document.querySelector('[class*="active" i][class*="job" i]');

    const title =
      firstText(["h1", '[data-testid*="title" i]', '[class*="jobTitle" i]', '[class*="job-title" i]'], detailsRoot) ||
      firstText(["h2", "a"], activeCard || document);
    const company =
      firstText(['[data-testid*="company" i]', '[class*="company" i]', 'a[href*="/co/"]'], detailsRoot) ||
      firstText(['[data-testid*="company" i]', '[class*="company" i]'], activeCard || document) ||
      "";
    const location =
      firstText(['[data-testid*="location" i]', '[class*="location" i]'], detailsRoot) ||
      firstText(['[data-testid*="location" i]', '[class*="location" i]'], activeCard || document) ||
      "";
    const description =
      firstText([
        '[data-testid*="description" i]',
        '[class*="description" i]',
        '[class*="jobDescription" i]',
        "article",
        "section",
      ], detailsRoot) || cleanText(detailsRoot?.innerText || "");
    const selectedLink =
      activeCard?.querySelector?.('a[href*="/jobs/"], a[href*="/c/"], a[href]')?.href ||
      document.querySelector('link[rel="canonical"]')?.href ||
      window.location.href;

    if (!title || /ziprecruiter|jobs based|search results/i.test(title)) return null;
    return {
      title,
      company: company || "Unknown company",
      location,
      description: description.slice(0, 8000),
      url: selectedLink,
      source: "ziprecruiter",
    };
  }

  function parseGreenhouse() {
    const title =
      document.querySelector(".app-title")?.innerText?.trim() ||
      document.querySelector("h1.posting-headline")?.innerText?.trim() ||
      document.querySelector("h1")?.innerText?.trim() || "";
    const company =
      document.querySelector(".company-name")?.innerText?.trim() ||
      (window.location.pathname.split("/")[1] || "").replace(/-/g, " ") || "";
    const location =
      document.querySelector(".location")?.innerText?.trim() ||
      document.querySelector(".office-location")?.innerText?.trim() || "";
    const description = document.querySelector("#content")?.innerText?.trim() || "";
    if (!title) return null;
    return { title, company, location, description: description.slice(0, 8000), url: window.location.href, source: "greenhouse" };
  }

  function parseLever() {
    const title =
      document.querySelector(".posting-headline h2")?.innerText?.trim() ||
      document.querySelector("h2")?.innerText?.trim() || "";
    const company =
      document.querySelector(".main-header-text .company-name")?.innerText?.trim() ||
      (window.location.pathname.split("/")[1] || "").replace(/-/g, " ") || "";
    const location =
      document.querySelector(".sort-by-time.posting-category")?.innerText?.trim() ||
      document.querySelector(".location")?.innerText?.trim() || "";
    const description = document.querySelector(".posting-description")?.innerText?.trim() || "";
    if (!title) return null;
    return { title, company, location, description: description.slice(0, 8000), url: window.location.href, source: "lever" };
  }

  function parseWorkday() {
    const title =
      document.querySelector('[data-automation-id="jobPostingHeader"]')?.innerText?.trim() ||
      document.querySelector("h2.css-1q2dra3")?.innerText?.trim() || "";
    const company =
      document.querySelector('[data-automation-id="headerTitle"]')?.innerText?.trim() ||
      window.location.hostname.split(".")[0].replace(/-/g, " ") || "";
    const location =
      document.querySelector('[data-automation-id="locations"]')?.innerText?.trim() || "";
    const description =
      document.querySelector('[data-automation-id="jobPostingDescription"]')?.innerText?.trim() || "";
    if (!title) return null;
    return { title, company, location, description: description.slice(0, 8000), url: window.location.href, source: "workday" };
  }

  function parseAshby() {
    const title =
      document.querySelector(".ashby-job-posting-heading")?.innerText?.trim() ||
      document.querySelector("h1")?.innerText?.trim() || "";
    const company =
      document.querySelector(".ashby-job-posting-company-name")?.innerText?.trim() ||
      (window.location.pathname.split("/")[1] || "").replace(/-/g, " ") || "";
    const location =
      document.querySelector(".ashby-job-posting-brief-location")?.innerText?.trim() || "";
    const description =
      document.querySelector("[class*='_descriptionText_']")?.innerText?.trim() ||
      document.querySelector(".ashby-job-posting-description")?.innerText?.trim() || "";
    if (!title) return null;
    return { title, company, location, description: description.slice(0, 8000), url: window.location.href, source: "ashby" };
  }

  function parseGeneric() {
    const structured = parseJsonLdJob();
    if (structured?.title) return structured;

    const pathLooksJobLike = /job|career|opening|position|apply|requisition|posting|vacanc|role/i.test(window.location.href);
    const title =
      titleFromDocument() ||
      firstText(["h1", '[class*="job"][class*="title" i]', '[data-testid*="title" i]', '[data-automation-id*="title" i]']) ||
      "";
    const company =
      firstText(['[class*="company" i]', '[data-testid*="company" i]', '[data-automation-id*="company" i]', 'a[href*="/company/"]']) ||
      companyFromHost();
    const location =
      firstText(['[class*="location" i]', '[data-testid*="location" i]', '[data-automation-id*="location" i]', '[class*="office" i]']) ||
      "";
    const description =
      firstText(['[class*="description" i]', '[data-testid*="description" i]', '[data-automation-id*="description" i]', "article", "main"]) ||
      "";

    if (!title || (!pathLooksJobLike && !looksLikeJobTitle(title))) return null;
    return {
      title,
      company,
      location,
      description: description.slice(0, 8000),
      url: window.location.href,
      source: "web",
    };
  }

})();
