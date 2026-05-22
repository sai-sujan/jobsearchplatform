/**
 * CareerOS Content Script — Autofill
 * Runs on job application pages. Injects autofill button and fills form fields.
 */

(async () => {
  if (window.__careeros_autofill_active) return;
  window.__careeros_autofill_active = true;

  const BTN_ID = "careeros-autofill-btn";
  const PANEL_ID = "careeros-sidecar";
  const LAUNCHER_ID = "careeros-autofill-launcher";
  const KFORCE_FILL_ID = "careeros-kforce-fill";
  const EXPERIS_FILL_ID = "careeros-experis-fill";
  const BANNER_ID = "careeros-autofill-banner";
  const INDICATOR_ID = "careeros-fill-indicator";

  function removeBtn() {
    document.getElementById(BTN_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(LAUNCHER_ID)?.remove();
    document.getElementById(KFORCE_FILL_ID)?.remove();
    document.getElementById(EXPERIS_FILL_ID)?.remove();
  }
  function removeBanner() { document.getElementById(BANNER_ID)?.remove(); }

  function showFillIndicator(label, current, total, isAI = false) {
    let el = document.getElementById(INDICATOR_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = INDICATOR_ID;
      el.className = "careeros-fill-indicator";
      document.body.appendChild(el);
    }
    el.classList.toggle("careeros-fill-indicator--ai", isAI);
    el.innerHTML = `
      <div class="careeros-fill-spinner"></div>
      <span class="careeros-fill-label">Filling <strong>${label}</strong></span>
      <span class="careeros-fill-count">${current} / ${total}</span>
    `;
  }

  function hideFillIndicator() {
    document.getElementById(INDICATOR_ID)?.remove();
  }

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
          description: stripHtml(posting.description).slice(0, 8000),
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

  function fallbackPageJob() {
    return {
      title: cleanText(document.querySelector("h1")?.innerText || document.title.replace(/\s+\|.*$/, "")),
      company: companyFromHost(),
      location: "",
      description: cleanText(document.querySelector("main")?.innerText || document.body?.innerText || "").slice(0, 8000),
      url: window.location.href,
      source: "fallback",
    };
  }

  function detectPageJob() {
    try {
      const h = window.location.hostname;
      const structured = parseJsonLdJob();
      if (structured?.title && !h.includes("dice.com")) return structured;

    let title = "", company = "", description = "";
    let location = "";

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
    } else if (h.includes("kforce.com")) {
      const bodyText = normalizeText(document.body?.innerText || "");
      const titleMatch = bodyText.match(/\bJob Title:\s*([^\n\r]+?)(?=\s+Reference Code:|\s+All fields|\s*$)/i);
      const refMatch = bodyText.match(/\bReference Code:\s*([A-Z0-9-]+)/i);
      title = cleanText(titleMatch?.[1] || "");
      company = "Kforce";
      description = cleanText([title ? `Job Title: ${title}` : "", refMatch?.[1] ? `Reference Code: ${refMatch[1]}` : "", bodyText].filter(Boolean).join(" ")).slice(0, 8000);
    } else if (h.includes("linkedin.com")) {
      const detailsRoot =
        document.querySelector(".jobs-search__job-details--container") ||
        document.querySelector(".jobs-details") ||
        document.querySelector(".scaffold-layout__detail") ||
        document.querySelector("main") ||
        document;

      title = firstText([
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
      ], detailsRoot) || titleFromDocument();
      company = firstText([
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name",
        ".topcard__org-name-link",
        ".jobs-unified-top-card__subtitle-primary-grouping a",
        ".jobs-unified-top-card__subtitle-grid-item a",
        "a[href*='/company/']",
      ], detailsRoot) || companyFromHost();
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
    } else if (h.includes("ashbyhq.com")) {
      title = firstText([".ashby-job-posting-heading", "h1"]);
      company = firstText([".ashby-job-posting-company-name"]) || (window.location.pathname.split("/")[1] || "").replace(/-/g, " ") || companyFromHost();
      location = firstText([".ashby-job-posting-brief-location"]);
      description = firstText(["[class*='_descriptionText_']", ".ashby-job-posting-description", "main"]);
    } else if (h.includes("indeed.com")) {
      title = firstText(['[data-testid="jobsearch-JobInfoHeader-title"] span', "h1.jobsearch-JobInfoHeader-title", "h1"]);
      company = firstText(['[data-testid="inlineHeader-companyName"] a', '[data-testid="inlineHeader-companyName"]']) || companyFromHost();
      location = firstText(['[data-testid="job-location"]', '[data-testid="inlineHeader-companyLocation"]']);
      description = firstText(["#jobDescriptionText"]);
    } else if (h.includes("myworkdayjobs.com")) {
      title = firstText(['[data-automation-id="jobPostingHeader"]', "h1", "h2"]);
      company = firstText(['[data-automation-id="headerTitle"]']) || companyFromHost();
      location = firstText(['[data-automation-id="locations"]']);
      description = firstText(['[data-automation-id="jobPostingDescription"]', "main"]);
    }
    if (!title) {
      title = titleFromDocument() || firstText(["h1", '[class*="job"][class*="title" i]', '[data-testid*="title" i]', '[data-automation-id*="title" i]']);
    }
    if (!company) {
      company =
        firstText(['[class*="company" i]', '[data-testid*="company" i]', '[data-automation-id*="company" i]', 'a[href*="/company/"]']) ||
        companyFromHost();
    }
    if (!description) {
      description =
        firstText(['[class*="description" i]', '[data-testid*="description" i]', '[data-automation-id*="description" i]', "article", "main"]) ||
        "";
    }
      return { title, company, location, description: description.slice(0, 8000), url: window.location.href, source: "page" };
    } catch (_) {
      return fallbackPageJob();
    }

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

  function escHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function visibleFormCount() {
    return Array.from(document.querySelectorAll(FILLABLE_SELECTOR)).filter(isElementUsable).length;
  }

  function shouldShowAutofillPanel() {
    const href = window.location.href.toLowerCase();
    if (/apply|application|candidate|greenhouse|lever|workday|ashby|bamboohr|smartrecruiters|workable|icims/.test(href)) {
      return visibleFormCount() > 0;
    }

    const fields = Array.from(document.querySelectorAll(FILLABLE_SELECTOR)).filter(isElementUsable);
    if (fields.length < 5) return false;

    const signature = fields.map(getFieldSignature).join(" ");
    const applicationSignals = [
      /first[\s_-]?name|last[\s_-]?name|full[\s_-]?name/i,
      /email/i,
      /phone|mobile|tel/i,
      /resume|cv|linkedin|portfolio|github/i,
      /authori[sz]ed|sponsor|veteran|gender|race|disab/i,
    ];
    return applicationSignals.filter((pattern) => pattern.test(signature)).length >= 3;
  }

  function setPanelStatus(kind, message) {
    const panel = document.getElementById(PANEL_ID);
    const el = panel?.querySelector("[data-careeros-status]");
    if (!el) return;
    el.className = `careeros-sidecar-status ${kind || "info"}`;
    el.textContent = message;
  }

  function setPanelBusy(isBusy, label = "Working") {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.querySelectorAll("[data-careeros-action]").forEach((btn) => {
      btn.disabled = isBusy;
    });
    panel.classList.toggle("is-busy", isBusy);
    if (isBusy) setPanelStatus("info", label);
  }

  function errorMessage(err) {
    return err?.message || String(err || "Unknown error");
  }

  function collectRemainingFieldsSafe(phase) {
    try {
      return collectRemainingFields();
    } catch (err) {
      console.error(`[CareerOS] Could not collect remaining fields during ${phase}`, err);
      return [];
    }
  }

  function openAutofillPanel(force = false) {
    window.__careeros_sidecar_closed = false;
    if (!force && !shouldShowAutofillPanel()) {
      return { ok: false, error: "No application form detected on this page." };
    }
    injectButton();
    return {
      ok: Boolean(document.getElementById(PANEL_ID)),
      fields: visibleFormCount(),
    };
  }

  function injectAutofillLauncher() {
    if (document.getElementById(PANEL_ID) || document.getElementById(LAUNCHER_ID)) return;

    const launcher = document.createElement("button");
    launcher.id = LAUNCHER_ID;
    launcher.type = "button";
    launcher.className = "careeros-launcher";
    launcher.setAttribute("aria-label", "Open CareerOS autofill");
    launcher.title = "Open CareerOS";
    launcher.innerHTML = `<span>C</span>`;
    document.body.appendChild(launcher);

    makeLauncherDraggable(launcher, () => openAutofillPanel(true));
  }

  function makeLauncherDraggable(launcher, onClick) {
    const storageKey = "careerosAutofillLauncherPosition";
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
      if (!moved) onClick();
    });

    launcher.addEventListener("pointercancel", () => {
      launcher.classList.remove("careeros-launcher--dragging");
    });
  }

  const MATCH_SKILLS = [
    "python", "java", "javascript", "typescript", "react", "node", "fastapi", "django",
    "sql", "postgresql", "mysql", "mongodb", "aws", "azure", "gcp", "docker", "kubernetes",
    "machine learning", "deep learning", "nlp", "computer vision", "tensorflow", "pytorch",
    "scikit-learn", "pandas", "numpy", "spark", "airflow", "etl", "data pipeline",
    "llm", "rag", "vector database", "langchain", "rest api", "microservices",
    "ci/cd", "git", "linux", "analytics", "tableau", "power bi"
  ];

  function flattenProfileText(value) {
    if (value == null) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(flattenProfileText).join(" ");
    if (typeof value === "object") return Object.values(value).map(flattenProfileText).join(" ");
    return "";
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function findSkillHits(text, skills = MATCH_SKILLS) {
    const lower = ` ${String(text || "").toLowerCase()} `;
    return skills.filter((skill) => {
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z0-9+#.-])${escaped}([^a-z0-9+#.-]|$)`, "i").test(lower);
    });
  }

  function buildMatchSnapshot(profile, job) {
    const jobText = [job.title, job.company, job.description].join(" ");
    const profileText = flattenProfileText(profile);
    const requiredSkills = findSkillHits(jobText);
    const candidateSkills = findSkillHits(profileText);
    const matchedSkills = requiredSkills.filter((skill) => candidateSkills.includes(skill));
    const missingSkills = requiredSkills.filter((skill) => !candidateSkills.includes(skill));
    const targetRoles = Array.isArray(profile?.target_roles) ? profile.target_roles.filter(Boolean) : [];
    const titleLower = String(job.title || "").toLowerCase();
    const roleAligned = targetRoles.some((role) => {
      const words = String(role).toLowerCase().split(/[^a-z0-9+#]+/).filter((word) => word.length > 2);
      return words.some((word) => titleLower.includes(word));
    });
    const authReady = profile?.work_auth?.authorized !== false;
    const skillScore = requiredSkills.length ? Math.round((matchedSkills.length / requiredSkills.length) * 70) : 42;
    const score = Math.min(96, Math.max(38, skillScore + (roleAligned ? 16 : 4) + (authReady ? 8 : 0) + (job.description ? 6 : 0)));
    const label = score >= 82 ? "Strong fit" : score >= 65 ? "Promising fit" : "Needs tailoring";
    const reasons = [
      matchedSkills.length ? `${matchedSkills.length} relevant skill${matchedSkills.length === 1 ? "" : "s"} found in your profile/resume.` : "No obvious skill overlap found yet.",
      roleAligned ? "The job title aligns with one of your target roles." : "The title is not an exact target-role match.",
      authReady ? "Your work authorization profile is ready for autofill." : "Work authorization may need review before applying.",
    ];
    return { score, label, requiredSkills, matchedSkills, missingSkills, targetRoles, reasons };
  }

  function renderSkillChips(skills, emptyText, className = "") {
    if (!skills.length) return `<span class="careeros-match-empty">${escHtml(emptyText)}</span>`;
    return skills.slice(0, 8).map((skill) => `<span class="careeros-match-chip ${className}">${escHtml(skill)}</span>`).join("");
  }

  function renderMatchPanel(panel, profile, job) {
    const target = panel.querySelector('[data-careeros-match-body]');
    if (!target) return;
    const snapshot = buildMatchSnapshot(profile, job);
    underlineMatchTerms(snapshot);
    target.innerHTML = `
      <section class="careeros-match-hero">
        <div class="careeros-match-ring" style="--score:${snapshot.score}">
          <span>${snapshot.score}</span>
          <small>ATS</small>
        </div>
        <div>
          <div class="careeros-sidecar-kicker">ATS match score</div>
          <h3>${escHtml(snapshot.label)} · ${snapshot.score}/100</h3>
          <p>Green underlines match your profile; amber/red underlines show likely resume gaps.</p>
        </div>
      </section>

      <section class="careeros-match-section">
        <div class="careeros-context-title"><span>Why this score</span><small>Live</small></div>
        <ul class="careeros-match-reasons">
          ${snapshot.reasons.map((reason) => `<li>${escHtml(reason)}</li>`).join("")}
        </ul>
      </section>

      <section class="careeros-match-section">
        <div class="careeros-context-title"><span>Matched skills</span><small>${snapshot.matchedSkills.length}</small></div>
        <div class="careeros-match-chiprow">${renderSkillChips(snapshot.matchedSkills, "No matched skills detected yet.", "hit")}</div>
      </section>

      <section class="careeros-match-section">
        <div class="careeros-context-title"><span>Potential gaps</span><small>${snapshot.missingSkills.length}</small></div>
        <div class="careeros-match-chiprow">${renderSkillChips(snapshot.missingSkills, "No obvious gaps from visible text.", "gap")}</div>
      </section>

      <section class="careeros-match-section">
        <div class="careeros-context-title"><span>Recommended next move</span><small>Action</small></div>
        <p class="careeros-match-note">${snapshot.score >= 75 ? "Run autofill, then tailor the longest written answers for this company." : "Generate a cover letter and tailor your resume bullets before submitting."}</p>
      </section>
    `;
  }

  function clearMatchUnderlines() {
    document.querySelectorAll(".careeros-keyword-underline").forEach((node) => {
      const parent = node.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(node.textContent || ""), node);
      parent.normalize();
    });
  }

  function underlineMatchTerms(snapshot) {
    clearMatchUnderlines();
    const terms = [
      ...snapshot.matchedSkills.map((term) => ({ term, type: "hit" })),
      ...snapshot.missingSkills.map((term) => ({ term, type: "gap" })),
    ]
      .filter((item) => item.term && item.term.length > 1)
      .sort((a, b) => b.term.length - a.term.length);
    if (!terms.length) return;

    const pattern = new RegExp(`\\b(${terms.map((item) => item.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
    const termType = new Map(terms.map((item) => [item.term.toLowerCase(), item.type]));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || !node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        if (parent.closest("#careeros-sidecar, #careeros-autofill-launcher, #careeros-save-sidecar, #careeros-save-launcher")) return NodeFilter.FILTER_REJECT;
        if (parent.closest("script, style, textarea, input, select, button, [contenteditable='true']")) return NodeFilter.FILTER_REJECT;
        return pattern.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    const nodes = [];
    while (nodes.length < 120) {
      const node = walker.nextNode();
      if (!node) break;
      nodes.push(node);
    }

    nodes.forEach((node) => {
      const text = node.nodeValue || "";
      pattern.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        const index = match.index ?? 0;
        if (index > lastIndex) fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
        const span = document.createElement("span");
        const matched = match[0];
        span.className = `careeros-keyword-underline ${termType.get(matched.toLowerCase()) || "gap"}`;
        span.textContent = matched;
        fragment.appendChild(span);
        lastIndex = index + matched.length;
      }
      if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      node.parentNode?.replaceChild(fragment, node);
    });
  }

  async function ensureMatchPanel(panel, job) {
    const target = panel.querySelector('[data-careeros-match-body]');
    if (!target || target.dataset.loaded === "1") return;
    target.innerHTML = `<div class="careeros-match-loading">Building match snapshot…</div>`;
    const response = await chrome.runtime.sendMessage({ type: "GET_AUTOFILL_PROFILE" });
    if (response?.ok && response.profile) {
      target.dataset.loaded = "1";
      renderMatchPanel(panel, response.profile, job);
    } else {
      target.innerHTML = `<div class="careeros-sidecar-status warn">Sign in and complete your profile to see match intelligence.</div>`;
    }
  }

  function isKforceApplyPage() {
    return /(^|\.)kforce\.com$/i.test(window.location.hostname) && /applyonline/i.test(window.location.pathname);
  }

  const STATE_ABBR_TO_NAME = {
    AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
    CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"D.C.",FL:"Florida",
    GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",
    IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",
    MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",
    MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",
    NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",
    NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",
    OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
    SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",
    VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
  };

  function inferStateFromText(text) {
    const m = String(text || "").match(/,\s*([A-Z]{2})\s*(?:\d{5}|$)/i);
    return m ? m[1].toUpperCase() : "";
  }

  function expandStateToFullName(stateVal) {
    if (!stateVal) return "";
    const upper = stateVal.trim().toUpperCase();
    return STATE_ABBR_TO_NAME[upper] || stateVal;
  }

  async function buildKforceProfile(apiProfile = {}) {
    const local = await chrome.storage.local.get("careeros_profile").catch(() => ({}));
    const localProfile = local?.careeros_profile || {};
    const apiPersonal = apiProfile.personal || {};
    const localPersonal = localProfile.personal || {};
    // Merge: local settings win for fields the API returns empty
    const merged = { ...localPersonal };
    for (const [k, v] of Object.entries(apiPersonal)) {
      if (v !== "" && v != null) merged[k] = v;
    }
    if (merged.country === "United States" || merged.country === "USA") {
      merged.country = "United States of America";
    }
    if (!merged.state && !merged.stateAbbr) {
      const inferred = inferStateFromText(merged.city) ||
        inferStateFromText(merged.address) ||
        inferStateFromText(merged.streetAddress);
      if (inferred) {
        merged.stateAbbr = inferred;
        merged.state = expandStateToFullName(inferred);
      }
    } else if (merged.stateAbbr && !merged.state) {
      merged.state = expandStateToFullName(merged.stateAbbr);
    } else if (merged.state && merged.state.length === 2) {
      merged.state = expandStateToFullName(merged.state);
    }
    return {
      ...apiProfile,
      personal: merged,
      work_auth: {
        authorized: true,
        requires_sponsorship: false,
        ...(localProfile.work_auth || {}),
        ...(apiProfile.work_auth || {}),
      },
    };
  }

  function findKforceControl(pattern, controls = Array.from(document.querySelectorAll(FILLABLE_SELECTOR))) {
    return controls.find((el) => isElementUsable(el) && pattern.test(getFieldSignature(el)));
  }

  async function fillKforceControl(el, value) {
    if (!el || !normalizeText(value)) return false;
    const tag = el.tagName.toLowerCase();
    const type = getInputType(el);

    if (isCustomChoiceControl(el)) return chooseCustomOption(el, value);
    if (type === "radio") return chooseRadioOption(el, value);
    if (type === "checkbox") return setCheckboxValue(el, value);
    if (tag === "select") return chooseSelectOption(el, value);
    setNativeValue(el, value);
    flashElement(el, false);
    return true;
  }

  async function fillKforceContactDetails(profile) {
    const personal = { ...(profile?.personal || {}) };
    const controls = Array.from(document.querySelectorAll(FILLABLE_SELECTOR));
    const filled = [];
    const targets = [
      { label: "First Name", pattern: /first[\s_-]?name/i, value: personal.firstName },
      { label: "Last Name", pattern: /last[\s_-]?name|surname/i, value: personal.lastName },
      { label: "Phone", pattern: /phone|mobile|tel(?:ephone)?|cell/i, value: personal.phone },
      { label: "Primary Email", pattern: /primary[\s_-]?email|email(?![\s\S]{0,30}verify)/i, value: personal.email },
      { label: "Verify Email", pattern: /verify[\s_-]?email|confirm[\s_-]?email/i, value: personal.email },
      { label: "City", pattern: /city|town/i, value: personal.city },
      { label: "State", pattern: /select[\s_-]?state|state|province|region/i, value: personal.state || personal.stateAbbr },
      { label: "ZIP Code", pattern: /zip|postal/i, value: personal.zip },
      { label: "Country", pattern: /country/i, value: personal.country },
    ];

    for (const target of targets) {
      const el = findKforceControl(target.pattern, controls);
      const ok = await fillKforceControl(el, target.value);
      if (ok) filled.push(target.label);
      await new Promise((resolve) => setTimeout(resolve, 70));
    }

    return filled;
  }

  function clickRadioByLabel(pattern) {
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    for (const radio of radios) {
      const label = normalizeText([
        getOptionLabel(radio),
        getDirectSiblingText(radio),
        getQuestionBlockText(radio),
      ].join(" "));
      if (!pattern.test(label)) continue;
      radio.click();
      radio.dispatchEvent(new Event("input", { bubbles: true }));
      radio.dispatchEvent(new Event("change", { bubbles: true }));
      flashElement(radio, false);
      return radio;
    }
    return null;
  }

  function findKforceFileTrigger() {
    const visibleChooseFile = Array.from(document.querySelectorAll("button, label, a, [role='button'], span, div")).find((el) => {
      const text = normalizeText(el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "");
      if (!/^choose file$/i.test(text)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    if (visibleChooseFile) return visibleChooseFile;

    return Array.from(document.querySelectorAll('input[type="file"]')).find((input) => !input.disabled) || null;
  }

  function findKforceFileInput() {
    return Array.from(document.querySelectorAll('input[type="file"]')).find((input) => !input.disabled) || null;
  }

  function hasKforceResumeSelected() {
    const fileInput = findKforceFileInput();
    if (fileInput?.files?.length) return true;
    return /(?:\.docx?|\.pdf)\b/i.test(normalizeText(document.body?.innerText || ""));
  }

  async function attachPackagedKforceResume(fileInput) {
    if (!fileInput) return false;
    try {
      const response = await fetch(chrome.runtime.getURL("resumes/venkataD_resume.docx"));
      if (!response.ok) return false;
      const blob = await response.blob();
      const file = new File(
        [blob],
        "venkataD_resume.docx",
        { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
      );
      const transfer = new DataTransfer();
      transfer.items.add(file);
      fileInput.files = transfer.files;
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      flashElement(fileInput, false);
      return fileInput.files?.length > 0;
    } catch (err) {
      console.warn("[CareerOS] Kforce packaged resume attach failed", err);
      return false;
    }
  }

  function findKforceSubmitButton() {
    return Array.from(document.querySelectorAll("button, input[type='submit'], a, [role='button']")).find((el) => {
      const text = normalizeText(el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || "");
      if (!/^submit$/i.test(text)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return !el.disabled && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }) || null;
  }

  function clickKforceSubmit() {
    const submit = findKforceSubmitButton();
    if (!submit) {
      setPanelStatus("warn", "Resume and eligibility are ready, but I could not find the Kforce Submit button.");
      return false;
    }
    submit.scrollIntoView({ behavior: "smooth", block: "center" });
    flashElement(submit, false);
    setTimeout(() => {
      submit.click();
    }, 180);
    setPanelStatus("info", "Kforce details are ready. Submitting now.");
    return true;
  }

  async function runKforceResumeStep() {
    if (!isKforceApplyPage()) {
      setPanelStatus("warn", "This Kforce shortcut only runs on Kforce Apply Online pages.");
      return;
    }

    clickRadioByLabel(/authorized\s+to\s+work\s+in\s+the\s+united\s+states\s+for\s+any\s+employer/i);

    // Select "From this computer" and wait for KO binding to reveal the file section
    clickRadioByLabel(/from\s+this\s+computer/i);
    await new Promise((r) => setTimeout(r, 400));

    const fileInput = findKforceFileInput();
    if (fileInput) {
      setPanelStatus("info", "Attaching resume…");
      const attached = await attachPackagedKforceResume(fileInput);
      if (attached) {
        fileInput.scrollIntoView({ behavior: "smooth", block: "center" });
        setPanelStatus("success", "Resume attached — wait for upload to finish, then click Submit.");
        return;
      }
    }

    // Fallback: open native file picker so user can choose manually
    const fileTrigger = findKforceFileTrigger();
    if (fileTrigger) {
      fileTrigger.scrollIntoView({ behavior: "smooth", block: "center" });
      flashElement(fileTrigger, false);
      fileTrigger.click();
      setPanelStatus("info", "File picker opened — choose your resume.");
      return;
    }

    setPanelStatus("warn", "Could not find the file upload control. Scroll to the resume section and attach manually.");
  }

  async function saveKforceJobFromPage() {
    const job = detectPageJob();
    if (!job?.title || /^apply online$/i.test(job.title)) {
      console.warn("[CareerOS] Kforce save skipped: no real job title detected", job);
      return false;
    }

    const response = await chrome.runtime.sendMessage({ type: "SAVE_JOB", job }).catch((err) => {
      console.warn("[CareerOS] Kforce job save failed", err);
      return null;
    });
    if (!response?.ok) {
      console.warn("[CareerOS] Kforce job save failed", response?.error || response);
      return false;
    }
    console.info(response.created ? "[CareerOS] Kforce job saved." : "[CareerOS] Kforce job already saved.");
    return true;
  }

  async function runKforceOneClick(button) {
    const originalLabel = button?.textContent || "Fill";
    if (button) {
      button.disabled = true;
      button.textContent = "Saving...";
      button.title = "Saving this Kforce job before filling.";
    }

    await saveKforceJobFromPage().catch((err) => {
      console.warn("[CareerOS] Kforce save step failed; continuing fill.", err);
    });

    if (button) {
      button.textContent = "Filling...";
      button.title = "Filling Kforce contact details.";
    }

    let response = null;
    try {
      response = await chrome.runtime.sendMessage({ type: "GET_AUTOFILL_PROFILE" });
    } catch (err) {
      console.warn("[CareerOS] Kforce profile lookup failed; using local/default details.", err);
    }

    const profile = await buildKforceProfile(response?.ok && response.profile ? response.profile : {});

    try {
      const directFilled = await fillKforceContactDetails(profile);

      if (directFilled.length) {
        console.info(`[CareerOS] Kforce direct fill completed: ${directFilled.join(", ")}`);
      }
    } catch (err) {
      console.error("[CareerOS] Kforce direct contact fill failed", err);
      if (button) {
        button.textContent = "Retry";
        button.title = `Kforce fill failed: ${errorMessage(err).slice(0, 120)}`;
        button.disabled = false;
      }
      return;
    }

    try {
      if (button) button.textContent = "Resume...";
      await runKforceResumeStep();
    } catch (err) {
      console.error("[CareerOS] Kforce resume/submit step failed", err);
      if (button) {
        button.textContent = "Retry";
        button.title = `Kforce resume/submit failed: ${errorMessage(err).slice(0, 120)}`;
        button.disabled = false;
      }
      return;
    }

    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
      button.title = "Fill Kforce application";
    }
  }

  function injectKforceFillButton() {
    if (!isKforceApplyPage() || document.getElementById(KFORCE_FILL_ID)) return;
    document.getElementById(LAUNCHER_ID)?.remove();

    const button = document.createElement("button");
    button.id = KFORCE_FILL_ID;
    button.type = "button";
    button.textContent = "Fill";
    button.setAttribute("aria-label", "Fill and submit Kforce application");
    button.title = "Fill Kforce application";
    document.body.appendChild(button);
    button.addEventListener("click", () => runKforceOneClick(button));
  }

  // ── Experis ────────────────────────────────────────────────────────────────

  function isExperisPage() {
    return /(^|\.)experis\.com$/i.test(window.location.hostname);
  }

  function isExperisJobPage() {
    if (!isExperisPage()) return false;
    return /\/en\/job\//i.test(window.location.pathname) && !isExperisApplyPage();
  }

  function isExperisApplyPage() {
    if (!isExperisPage()) return false;
    const text = document.body?.innerText || "";
    // "You're applying to:" and "Let's do this!" are unique to the apply form
    if (/you.?re applying to/i.test(text)) return true;
    if (/let.?s do this/i.test(text)) return true;
    // Also catch by upload resume accordion + any text input present
    if (/upload resume/i.test(text) && document.querySelector('input[type="text"], input[type="email"], input[type="tel"]')) return true;
    // Fallback: check placeholder attributes on inputs
    return !!(
      document.querySelector('input[placeholder="First Name"]') ||
      document.querySelector('input[placeholder="PhoneNumber"]') ||
      document.querySelector('input[placeholder="Email"]') ||
      document.querySelector('input[placeholder="Last Name"]')
    );
  }

  function findExperisApplyNowButton() {
    return Array.from(document.querySelectorAll("button, a, [role='button']")).find((el) => {
      const text = normalizeText(el.innerText || el.textContent || "");
      if (!/^apply now$/i.test(text)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }) || null;
  }

  function findExperisSubmitButton() {
    return Array.from(document.querySelectorAll("button, input[type='submit'], [role='button']")).find((el) => {
      const text = normalizeText(el.innerText || el.textContent || el.value || "");
      if (!/^apply$/i.test(text)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return !el.disabled && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }) || null;
  }

  async function runExperisUploadResume() {
    // Step 1: find "Upload Resume" toggle — must NOT match "Cover Letter"
    const allEls = Array.from(document.querySelectorAll("button, div, span, [role='button'], [tabindex]"));
    const uploadToggle = allEls.find((el) => {
      const text = normalizeText(el.innerText || el.textContent || "");
      return /upload resume/i.test(text) && !/cover letter/i.test(text);
    });
    if (uploadToggle) {
      uploadToggle.click();
      await new Promise((r) => setTimeout(r, 600));
    }

    // Step 2: click "From your device" — take the LAST match
    // (Cover Letter section is first in DOM, Resume section is last)
    const allFromDevice = Array.from(document.querySelectorAll("button, div, span, a, [role='button'], [tabindex]")).filter((el) =>
      /from your device/i.test(normalizeText(el.innerText || el.textContent || ""))
    );
    const fromDevice = allFromDevice[allFromDevice.length - 1] || null;
    if (fromDevice) {
      fromDevice.click();
      await new Promise((r) => setTimeout(r, 500));
    }

    // Step 3: attach to the LAST file input (resume input comes after cover letter input)
    const allFileInputs = Array.from(document.querySelectorAll('input[type="file"]')).filter((inp) => !inp.disabled);
    const fileInput = allFileInputs[allFileInputs.length - 1] || null;
    if (fileInput) {
      const attached = await attachPackagedKforceResume(fileInput);
      if (attached) {
        fileInput.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      }
    }
    return false;
  }

  async function runExperisOneClick(button) {
    const originalLabel = button?.textContent || "Fill & Apply";
    if (button) { button.disabled = true; button.textContent = "Filling…"; }

    try {
      let response;
      try {
        response = await chrome.runtime.sendMessage({ type: "GET_AUTOFILL_PROFILE" });
      } catch (e) {}
      const profile = await buildKforceProfile(response?.ok && response.profile ? response.profile : {});
      // Experis phone field expects digits only — strip brackets, spaces, dashes
      if (profile.personal?.phone) {
        profile.personal.phone = profile.personal.phone.replace(/\D/g, "");
      }

      await fillKforceContactDetails(profile);

      if (button) button.textContent = "Uploading resume…";
      const uploaded = await runExperisUploadResume();
      if (!uploaded) {
        console.warn("[CareerOS] Experis resume attach failed — user must attach manually");
        if (button) button.textContent = "Attach resume, then click Apply";
        await new Promise((r) => setTimeout(r, 3000));
      }

      if (button) button.textContent = "Submitting…";
      const applyBtn = findExperisSubmitButton();
      if (applyBtn) {
        applyBtn.scrollIntoView({ behavior: "smooth", block: "center" });
        await new Promise((r) => setTimeout(r, 400));
        applyBtn.click();
      }
    } catch (err) {
      console.error("[CareerOS] Experis fill failed", err);
    } finally {
      if (button) { button.disabled = false; button.textContent = originalLabel; }
    }
  }

  function injectExperisFillButton() {
    const onApplyPage = isExperisApplyPage();
    const mode = onApplyPage ? "apply" : "job";
    const existing = document.getElementById(EXPERIS_FILL_ID);
    // Use dataset to track mode — never check text (changes during active fill)
    if (existing && existing.dataset.experisMode === mode) return;
    existing?.remove();
    document.getElementById(LAUNCHER_ID)?.remove();

    const button = document.createElement("button");
    button.id = EXPERIS_FILL_ID;
    button.type = "button";
    button.dataset.experisMode = mode;

    if (onApplyPage) {
      button.textContent = "Fill & Apply";
      button.setAttribute("aria-label", "Fill and submit Experis application");
      button.title = "Fill Experis application and submit";
      button.addEventListener("click", () => runExperisOneClick(button));
    } else {
      button.textContent = "Quick Apply";
      button.setAttribute("aria-label", "Click APPLY NOW and autofill");
      button.title = "Click APPLY NOW on this page";
      button.addEventListener("click", () => {
        sessionStorage.setItem("careeros_experis_autofill", "1");
        const applyNow = findExperisApplyNowButton();
        if (applyNow) {
          applyNow.scrollIntoView({ behavior: "smooth", block: "center" });
          applyNow.click();
        }
      });
    }

    document.body.appendChild(button);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "OPEN_CAREEROS_AUTOFILL") return false;
    sendResponse(openAutofillPanel(Boolean(msg.force)));
    return false;
  });

  function injectButton() {
    if (window.__careeros_sidecar_closed) return;
    removeBtn();

    const job = detectPageJob();
    const fieldCount = visibleFormCount();
    const showKforceAction = isKforceApplyPage();
    const panel = document.createElement("aside");
    panel.id = PANEL_ID;
    panel.className = "careeros-sidecar";
    panel.innerHTML = `
      <div class="careeros-sidecar-shell">
        <div class="careeros-sidecar-header">
          <div class="careeros-sidecar-brand">
            <span class="careeros-sidecar-mark">C</span>
            <div>
              <strong>CareerOS</strong>
              <span>Application workspace</span>
            </div>
          </div>
          <div class="careeros-sidecar-tools">
            <button type="button" class="careeros-sidecar-tool" title="Report an issue">Flag</button>
            <button type="button" class="careeros-sidecar-tool" title="Settings">Gear</button>
          </div>
          <button class="careeros-sidecar-close" type="button" aria-label="Close CareerOS panel">×</button>
        </div>

        <div class="careeros-sidecar-tabs" aria-label="CareerOS tools">
          <button class="active" type="button" data-careeros-tab="autofill">Autofill</button>
          <button type="button" data-careeros-tab="match">Match</button>
          <button type="button" data-careeros-tab="profile">Profile</button>
        </div>

        <div class="careeros-tab-panel active" data-careeros-panel="autofill">
          <section class="careeros-brief-card careeros-brief-card--blue">
            <button class="careeros-brief-close" type="button" data-careeros-dismiss aria-label="Hide insight">×</button>
            <div class="careeros-brief-icon">01</div>
            <div>
              <h3>Application detected</h3>
              <p>${escHtml(job.title || "This application")} ${job.company ? `at ${escHtml(job.company)}` : `on ${escHtml(window.location.hostname)}`}</p>
              <ul>
                <li>${fieldCount} visible fields found on this page.</li>
                <li>Profile fields fill directly; long answers use resume-aware AI.</li>
              </ul>
            </div>
          </section>

          <section class="careeros-brief-card careeros-brief-card--green">
            <button class="careeros-brief-close" type="button" data-careeros-dismiss aria-label="Hide insight">×</button>
            <div class="careeros-brief-icon">AI</div>
            <div>
              <h3>Review-first autofill</h3>
              <p>CareerOS fills the page but never submits it for you.</p>
              <ul>
                <li>Contact, work auth, compensation, and EEO come from your profile.</li>
                <li>Open-ended questions are drafted from your resume and the job context.</li>
              </ul>
            </div>
          </section>

          <section class="careeros-action-card">
            <div class="careeros-action-head">
              <span class="careeros-action-icon">A</span>
              <div>
                <strong>Autofill this application</strong>
                <span>Estimated time saved: ${Math.max(2, Math.ceil(fieldCount / 4))} minutes</span>
              </div>
            </div>
            <button class="careeros-sidecar-primary" type="button" data-careeros-action="autofill">
              Autofill this page
            </button>
            <button class="careeros-sidecar-secondary" type="button" data-careeros-action="cover-letter">
              Generate cover letter
            </button>
            ${showKforceAction ? `
              <button class="careeros-sidecar-secondary" type="button" data-careeros-action="kforce-resume">
                Kforce: choose resume + eligibility
              </button>
            ` : ""}
          </section>

          <div class="careeros-sidecar-inline-actions">
            <button class="careeros-sidecar-link" type="button" data-careeros-action="save-job">Save job instead</button>
            <span>${fieldCount} fields ready</span>
          </div>
        </div>

        <div class="careeros-tab-panel" data-careeros-panel="match">
          <div data-careeros-match-body>
            <div class="careeros-match-loading">Open this tab to build a match snapshot.</div>
          </div>
        </div>

        <section class="careeros-tab-panel careeros-context-card" data-careeros-panel="profile">
          <div class="careeros-context-title">
            <span>Profile source</span>
            <small>Active</small>
          </div>
          <div class="careeros-sidecar-profile" data-careeros-profile>
            <span class="careeros-sidecar-avatar">?</span>
            <div>
              <strong>Checking account…</strong>
              <span>Uses the account you signed into from the extension.</span>
            </div>
          </div>
        </section>

        <div class="careeros-sidecar-output" data-careeros-output></div>
        <div class="careeros-sidecar-status info" data-careeros-status>Review everything before submitting.</div>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector(".careeros-sidecar-close").addEventListener("click", () => {
      window.__careeros_sidecar_closed = true;
      panel.classList.add("careeros-sidecar--closing");
      setTimeout(() => {
        panel.remove();
        injectAutofillLauncher();
      }, 180);
    });

    panel.querySelectorAll("[data-careeros-dismiss]").forEach((button) => {
      button.addEventListener("click", () => {
        button.closest(".careeros-brief-card")?.remove();
      });
    });

    panel.querySelector('[title="Settings"]')?.addEventListener("click", () => {
      chrome.runtime.openOptionsPage?.();
    });

    panel.querySelector('[title="Report an issue"]')?.addEventListener("click", () => {
      setPanelStatus("info", "Report noted. Keep reviewing before submitting.");
    });

    panel.querySelectorAll("[data-careeros-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        const targetName = tab.getAttribute("data-careeros-tab");
        panel.querySelectorAll("[data-careeros-tab]").forEach((item) => {
          item.classList.toggle("active", item === tab);
        });
        panel.querySelectorAll("[data-careeros-panel]").forEach((section) => {
          section.classList.toggle("active", section.getAttribute("data-careeros-panel") === targetName);
        });
        if (targetName === "match") ensureMatchPanel(panel, job);
        if (targetName !== "match") clearMatchUnderlines();
      });
    });

    panel.querySelector('[data-careeros-action="autofill"]').addEventListener("click", runAutofill);
    panel.querySelector('[data-careeros-action="cover-letter"]').addEventListener("click", generateCoverLetter);
    panel.querySelector('[data-careeros-action="save-job"]').addEventListener("click", () => saveDetectedJob(job));
    panel.querySelector('[data-careeros-action="kforce-resume"]')?.addEventListener("click", runKforceResumeStep);

    chrome.runtime.sendMessage({ type: "GET_SESSION" }).then((res) => {
      const target = panel.querySelector("[data-careeros-profile]");
      if (!target) return;
      if (res?.ok && res.user) {
        const name = res.user.full_name || res.user.username || "Signed in";
        target.innerHTML = `
          <span class="careeros-sidecar-avatar">${escHtml(name.charAt(0).toUpperCase())}</span>
          <div>
            <strong>${escHtml(name)}</strong>
            <span>${res.offline ? "Remembered locally. Backend is offline." : "Signed in and ready."}</span>
          </div>
        `;
        setPanelStatus(res.offline ? "warn" : "info", res.offline ? "Backend offline. Stored account is remembered." : "Review everything before submitting.");
      } else {
        target.innerHTML = `
          <span class="careeros-sidecar-avatar">!</span>
          <div>
            <strong>Sign in needed</strong>
            <span>Open the extension popup to connect your account.</span>
          </div>
        `;
        setPanelStatus("warn", "Sign in from the extension popup before autofilling.");
      }
    }).catch(() => {});
  }

  async function runAutofill() {
    setPanelBusy(true, "Loading profile…");

    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_AUTOFILL_PROFILE" });

      if (!response?.ok) {
        setPanelBusy(false);
        setPanelStatus("warn", "Sign in first, then run autofill again.");
        return;
      }

      const profile = response.profile;
      const allFilled = await fillWithScroll(profile);

      const remainingFields = collectRemainingFieldsSafe("pre-AI scan");

      if (remainingFields.length > 0) {
        setPanelStatus("info", "Using AI for remaining unanswered fields…");
        try {
          const { title, company, description } = detectPageJob();

          const smartRes = await chrome.runtime.sendMessage({
            type: "SMART_FILL",
            payload: {
              fields: remainingFields.map(f => ({
                id: f.id,
                label: f.label,
                type: f.type,
                options: f.options || [],
              })),
              job_title: title,
              company: company,
              job_description: description,
            },
          });

          if (smartRes?.ok && smartRes.data?.mapping) {
            const mapping = smartRes.data.mapping;
            const aiMatches = remainingFields.filter(f => mapping[f.id]);
            let aiIdx = 0;
            for (const f of aiMatches) {
              aiIdx++;
              showFillIndicator(f.label.slice(0, 40), aiIdx, aiMatches.length, true);
              const applied = await applySmartValue(f, mapping[f.id]);
              if (applied) {
                f.element.scrollIntoView({ behavior: "smooth", block: "center" });
                flashElement(f.element, true);
                await new Promise(r => setTimeout(r, 120));
                allFilled.push({
                  element: f.element,
                  label: f.label.slice(0, 50),
                  key: "AI_GENERATED",
                  value: mapping[f.id],
                  type: f.type,
                  isAI: true,
                });
              }
            }
            hideFillIndicator();
          } else if (smartRes && !smartRes.ok) {
            console.warn("[CareerOS] Smart fill skipped", smartRes.error || smartRes);
          }
        } catch (err) {
          hideFillIndicator();
          console.error("[CareerOS] Smart fill phase failed", err);
        }
      }

      showBanner(allFilled);
      const stillOpen = collectRemainingFieldsSafe("final scan").length;
      setPanelStatus(
        stillOpen ? "warn" : "success",
        `${allFilled.length} fields filled${stillOpen ? `, ${stillOpen} still need review` : ""}. Review before submitting.`
      );
    } catch (err) {
      console.error("[CareerOS] Autofill failed", err);
      setPanelStatus("error", `Autofill failed: ${errorMessage(err).slice(0, 120)}`);
    } finally {
      setPanelBusy(false);
    }
  }

  async function saveDetectedJob(job) {
    if (!job?.title) {
      setPanelStatus("warn", "I could not detect enough job details to save this page.");
      return;
    }
    setPanelBusy(true, "Saving job…");
    const response = await chrome.runtime.sendMessage({ type: "SAVE_JOB", job });
    setPanelBusy(false);
    if (response?.ok) {
      setPanelStatus("success", response.created ? "Job saved to CareerOS." : "This job is already saved.");
    } else {
      setPanelStatus("error", response?.error || "Could not save this job.");
    }
  }

  async function generateCoverLetter() {
    const { title, company, description } = detectPageJob();
    setPanelBusy(true, "Generating cover letter…");

    const res = await chrome.runtime.sendMessage({
      type: "GENERATE_COVER_LETTER",
      payload: {
        job_title: title,
        company,
        job_description: description.slice(0, 2000),
        tone: "professional",
        length: "medium",
      },
    });

    setPanelBusy(false);
    if (res?.ok && res.data?.cover_letter) {
      const output = document.querySelector(`#${PANEL_ID} [data-careeros-output]`);
      if (output) {
        output.innerHTML = `
          <section class="careeros-sidecar-card">
            <div class="careeros-sidecar-row">
              <div>
                <div class="careeros-sidecar-kicker">Cover letter</div>
                <strong>${res.data.word_count || res.data.cover_letter.split(/\s+/).length} words</strong>
              </div>
              <button class="careeros-sidecar-mini" type="button" data-careeros-copy-cover>Copy</button>
            </div>
            <textarea class="careeros-sidecar-textarea" data-careeros-cover-text>${escHtml(res.data.cover_letter)}</textarea>
          </section>
        `;
        output.querySelector("[data-careeros-copy-cover]").addEventListener("click", () => {
          const text = output.querySelector("[data-careeros-cover-text]").value;
          navigator.clipboard.writeText(text).catch(() => {});
          setPanelStatus("success", "Cover letter copied.");
        });
      }
      setPanelStatus("success", "Cover letter generated inside the panel.");
    } else {
      setPanelStatus("error", res?.error || "Cover letter generation failed.");
    }
  }

  function showReviewModal(filled) {
    if (!filled.length) return;
    const MODAL_ID = "careeros-review-modal";
    document.getElementById(MODAL_ID)?.remove();

    const categoryMap = {
      "personal": "Personal Info",
      "work_auth": "Work Authorization",
      "compensation": "Compensation",
      "experience_meta": "Experience",
      "demographics": "EEO / Demographics",
    };
    const categoryOrder = ["Personal Info", "Work Authorization", "Compensation", "Experience", "EEO / Demographics", "AI-Generated", "Other"];

    // Tag each item with its index and group
    const groups = {};
    filled.forEach((f, i) => {
      f._index = i;
      const cat = f.isAI ? "AI-Generated" : (categoryMap[f.key.split('.')[0]] || "Other");
      (groups[cat] = groups[cat] || []).push(f);
    });

    function renderItem(f) {
      const isLong = f.type === 'textarea' || (f.value && f.value.length > 80);
      const safe = (f.value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      return `
        <div class="careeros-review-item">
          <div class="careeros-review-label">
            <span>${f.label}</span>
            ${f.isAI ? '<span class="careeros-review-tag ai">AI</span>' : '<span class="careeros-review-tag">Profile</span>'}
          </div>
          ${isLong
            ? `<textarea class="careeros-modal-answer" data-index="${f._index}">${safe}</textarea>`
            : `<input type="text" class="careeros-modal-answer careeros-modal-answer--short" data-index="${f._index}" value="${safe}">`
          }
        </div>`;
    }

    const bodyHtml = categoryOrder
      .filter(cat => groups[cat]?.length)
      .map(cat => `
        <div class="careeros-review-group">
          <div class="careeros-review-group-title">${cat}</div>
          ${groups[cat].map(renderItem).join('')}
        </div>`)
      .join('');

    const aiCount = filled.filter(f => f.isAI).length;
    const profileCount = filled.length - aiCount;

    const container = document.createElement("div");
    container.id = MODAL_ID;
    container.className = "careeros-modal";
    container.innerHTML = `
      <div class="careeros-modal-backdrop"></div>
      <div class="careeros-modal-box careeros-modal-box--wide">
        <div class="careeros-modal-header">
          <h3 class="careeros-modal-title">⚡ Autofill Review — ${filled.length} fields</h3>
          <button class="careeros-modal-close">✕</button>
        </div>
        <p class="careeros-banner-note">Verify and edit before submitting. Changes sync live to the form.</p>
        <div class="careeros-review-list">${bodyHtml}</div>
        <div class="careeros-modal-actions">
          <span style="font-size:11px;color:#64748b;">${profileCount} from profile · ${aiCount} AI-generated</span>
          <button class="careeros-btn careeros-btn-primary careeros-done-btn">Confirm & Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    container.querySelectorAll(".careeros-modal-answer").forEach(input => {
      input.addEventListener("input", (e) => {
        const item = filled[+e.target.getAttribute("data-index")];
        if (item?.element) setNativeValue(item.element, e.target.value);
      });
    });

    const close = () => container.remove();
    container.querySelector(".careeros-modal-close").addEventListener("click", close);
    container.querySelector(".careeros-modal-backdrop").addEventListener("click", close);
    container.querySelector(".careeros-done-btn").addEventListener("click", close);
  }

  function showBanner(filled) {
    removeBanner();
    if (!filled.length) return;

    const aiCount = filled.filter(f => f.isAI).length;
    const profileCount = filled.length - aiCount;

    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.className = "careeros-autofill-banner";
    banner.innerHTML = `
      <div class="careeros-banner-header">
        <span>✓ ${filled.length} field${filled.length !== 1 ? "s" : ""} filled</span>
        <button class="careeros-banner-close">✕</button>
      </div>
      <p class="careeros-banner-note">${profileCount} from profile${aiCount ? ` · ${aiCount} AI` : ""}. Edit anything wrong before submitting.</p>
    `;
    document.body.appendChild(banner);
    banner.querySelector(".careeros-banner-close").addEventListener("click", removeBanner);
    setTimeout(removeBanner, 8000);
  }

  // ── Autofill logic ─────────────────────────────────────────────────────────

  const LABEL_MAP = {
    "personal.firstName": "First Name",
    "personal.lastName": "Last Name",
    "personal.fullName": "Full Name",
    "personal.preferredName": "Preferred Name",
    "personal.email": "Email",
    "personal.phone": "Phone",
    "personal.streetAddress": "Street Address",
    "personal.address": "Full Address",
    "personal.apartment": "Apartment / Suite",
    "personal.city": "City",
    "personal.state": "State",
    "personal.stateAbbr": "State (Abbr.)",
    "personal.zip": "ZIP Code",
    "personal.country": "Country",
    "personal.countryCode": "Country Code",
    "personal.linkedin": "LinkedIn",
    "personal.github": "GitHub",
    "personal.portfolio": "Portfolio / Website",
    "work_auth.authorized": "Work Authorization",
    "work_auth.requires_sponsorship": "Sponsorship Required",
    "work_auth.visa_status": "Visa / Work Permit",
    "compensation.salary_expectation": "Desired Salary",
    "experience_meta.years_of_experience_total": "Years of Experience",
    "experience_meta.education_level": "Education Level",
    "experience_meta.current_title": "Current Job Title",
    "resume_facts.education": "School / Education",
    "availability.start_date": "Available Start Date",
    "availability.open_to_relocation": "Relocation",
    "demographics.gender": "Gender",
    "demographics.race": "Race / Ethnicity",
    "demographics.veteran": "Veteran Status",
    "demographics.disability": "Disability Status",
    "candidate_summary": "Cover Letter / Summary",
  };

  const FIELD_RULES = [
    { match: /first[\s_-]?name|given[\s_-]?name|fname/i, key: "personal.firstName" },
    { match: /last[\s_-]?name|surname|lname|family[\s_-]?name/i, key: "personal.lastName" },
    { match: /full[\s_-]?name|your[\s_-]?name/i, key: "personal.fullName" },
    { match: /preferred[\s_-]?name|nickname/i, key: "personal.preferredName" },
    { match: /e?mail/i, key: "personal.email" },
    { match: /phone|mobile|tel(?:ephone)?|cell/i, key: "personal.phone" },
    { match: /linkedin/i, key: "personal.linkedin" },
    { match: /github/i, key: "personal.github" },
    { match: /portfolio|personal[\s_-]?(?:website|site|url)|website/i, key: "personal.portfolio" },
    { match: /street[\s_-]?address|address[\s_-]?line[\s_-]?1|^address1$/i, key: "personal.streetAddress" },
    { match: /\bapt\.?\b|apartment|suite|address[\s_-]?line[\s_-]?2|address2/i, key: "personal.apartment" },
    { match: /street|address(?!\s*2)/i, key: "personal.address" },
    { match: /city|town/i, key: "personal.city" },
    { match: /state|province|region/i, key: "personal.state" },
    { match: /zip|postal/i, key: "personal.zip" },
    { match: /country/i, key: "personal.country" },
    { match: /authori[sz]ed[\s\S]{0,20}work|eligible[\s\S]{0,20}work/i, key: "work_auth.authorized", type: "yesno" },
    { match: /without[\s\S]{0,35}sponsor|not[\s\S]{0,20}require[\s\S]{0,20}sponsor|do\s+not\s+require[\s\S]{0,20}sponsor/i, key: "work_auth.requires_sponsorship", type: "yesno-inverse" },
    { match: /sponsor|now[\s\S]{0,25}future/i, key: "work_auth.requires_sponsorship", type: "yesno" },
    { match: /visa/i, key: "work_auth.visa_status" },
    { match: /desired[\s_-]?salary|expected[\s_-]?salary|salary[\s_-]?expect|annual[\s_-]?salary|compensation[\s_-]?expect/i, key: "compensation.salary_expectation" },
    { match: /years[\s\S]{0,12}experience|experience[\s\S]{0,12}years/i, key: "experience_meta.years_of_experience_total" },
    { match: /highest[\s_-]?(?:level[\s_-]?of[\s_-]?)?education|degree[\s_-]?level|education[\s_-]?level/i, key: "experience_meta.education_level" },
    { match: /school|university|college|institution/i, key: "resume_facts.education" },
    { match: /degree|major|field[\s_-]?of[\s_-]?study|discipline/i, key: "experience_meta.education_level" },
    { match: /current[\s_-]?(?:job[\s_-]?)?title|most[\s_-]?recent[\s_-]?title/i, key: "experience_meta.current_title" },
    { match: /available[\s\S]{0,20}start|start[\s\S]{0,20}date/i, key: "availability.start_date" },
    { match: /relocat|willing[\s\S]{0,20}move/i, key: "availability.open_to_relocation", type: "yesno" },
    { match: /how[\s\S]{0,35}hear|source|referred[\s\S]{0,20}by/i, key: "_constant.source", value: "Company careers page" },
    { match: /gender/i, key: "demographics.gender" },
    { match: /race|ethnic/i, key: "demographics.race" },
    { match: /veteran/i, key: "demographics.veteran" },
    { match: /disab/i, key: "demographics.disability" },
    { match: /cover[\s_-]?letter/i, key: "candidate_summary" },
  ];

  const FILLABLE_SELECTOR = [
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="password"])',
    "textarea",
    "select",
    '[role="combobox"]',
    '[aria-haspopup="listbox"]',
  ].join(", ");

  const PLACEHOLDER_RE = /^(|select|choose|please select|--|n\/a|none|prefer not|decline|not specified)$/i;

  function resolvePath(profile, path) {
    if (!path) return "";
    if (path.startsWith("_")) return "";
    const parts = path.split(".");
    let val = profile;
    for (const part of parts) {
      if (val == null) return "";
      val = val[part];
    }
    return val == null ? "" : normalizeText(flattenProfileText(val));
  }

  function textFromIdRefs(value) {
    return String(value || "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || "")
      .filter(Boolean)
      .join(" ");
  }

  function getDirectSiblingText(el) {
    const chunks = [];
    let prev = el.previousElementSibling;
    for (let i = 0; i < 2 && prev; i++, prev = prev.previousElementSibling) {
      chunks.unshift(prev.innerText || prev.textContent || "");
    }
    let next = el.nextElementSibling;
    for (let i = 0; i < 2 && next; i++, next = next.nextElementSibling) {
      chunks.push(next.innerText || next.textContent || "");
    }
    return chunks.join(" ");
  }

  function getQuestionBlockText(el) {
    const parts = [];
    const fieldset = el.closest("fieldset");
    if (fieldset) parts.push(fieldset.querySelector("legend")?.innerText || "");

    const semanticBlock = el.closest('[role="group"], [role="radiogroup"], [data-automation-id], [data-testid], .field, .form-field, .question, .application-question');
    if (semanticBlock) parts.push(semanticBlock.innerText || semanticBlock.textContent || "");

    let node = el.parentElement;
    for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
      const text = normalizeText(node.innerText || node.textContent || "");
      if (text && text.length <= 700) {
        parts.push(text);
        break;
      }
    }

    return normalizeText(parts.join(" ")).slice(0, 700);
  }

  function getFieldSignature(el) {
    const labels = Array.from(el.labels || []).map((label) => label.innerText || label.textContent || "");
    const parts = [
      ...labels,
      textFromIdRefs(el.getAttribute("aria-labelledby")),
      textFromIdRefs(el.getAttribute("aria-describedby")),
      el.getAttribute("aria-label"),
      el.getAttribute("placeholder"),
      el.getAttribute("aria-placeholder"),
      el.getAttribute("title"),
      el.getAttribute("autocomplete"),
      el.getAttribute("name"),
      el.getAttribute("id"),
      el.getAttribute("data-automation-id"),
      el.getAttribute("data-testid"),
      getDirectSiblingText(el),
      getQuestionBlockText(el),
    ];
    return normalizeText(parts.filter(Boolean).join(" ")).toLowerCase();
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor?.set) descriptor.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function getInputType(el) {
    return (el.getAttribute("type") || "text").toLowerCase();
  }

  function isNativeControl(el) {
    return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
  }

  function isCustomChoiceControl(el) {
    if (el.tagName === "SELECT") return false;
    const role = el.getAttribute("role");
    const popup = el.getAttribute("aria-haspopup");
    return role === "combobox" || popup === "listbox";
  }

  function isElementUsable(el) {
    if (!el || el.disabled || (el.readOnly && !isCustomChoiceControl(el))) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function getRadioGroup(el) {
    if (getInputType(el) !== "radio") return [el];
    const root = el.form || document;
    const name = el.getAttribute("name");
    if (name) {
      return Array.from(root.querySelectorAll('input[type="radio"]')).filter((radio) => radio.name === name);
    }
    const group = el.closest('[role="radiogroup"], fieldset, [role="group"]');
    return group ? Array.from(group.querySelectorAll('input[type="radio"]')) : [el];
  }

  function getOptionLabel(el) {
    return normalizeText(
      Array.from(el.labels || []).map((label) => label.innerText || label.textContent || "").join(" ") ||
      el.closest("label")?.innerText ||
      el.getAttribute("aria-label") ||
      el.value
    );
  }

  function getRadioOptions(el) {
    return getRadioGroup(el).map(getOptionLabel).filter(Boolean);
  }

  function getSelectOptions(el) {
    return Array.from(el.options || []).map((option) => normalizeText(option.text || option.value)).filter(Boolean);
  }

  function isSelectPlaceholder(option) {
    if (!option) return true;
    const text = normalizeText(option.text || option.value);
    return !option.value || PLACEHOLDER_RE.test(text);
  }

  function controlNeedsFill(el) {
    if (isCustomChoiceControl(el)) {
      const current = normalizeText(el.getAttribute("aria-valuetext") || el.innerText || el.textContent || "");
      return !current || PLACEHOLDER_RE.test(current) || /select|choose/i.test(current);
    }
    const tag = el.tagName.toLowerCase();
    const type = getInputType(el);
    if (type === "radio") return !getRadioGroup(el).some((radio) => radio.checked);
    if (type === "checkbox") return !el.checked;
    if (tag === "select") return isSelectPlaceholder(el.options[el.selectedIndex]);
    return !normalizeText(el.value);
  }

  function normalizeChoice(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function booleanish(value) {
    const normalized = normalizeChoice(value);
    if (/^(yes|true|y|1|authorized|eligible|agree|i agree)$/.test(normalized)) return true;
    if (/^(no|false|n|0|not authorized|ineligible|disagree)$/.test(normalized)) return false;
    return null;
  }

  function optionScore(optionText, answer) {
    const opt = normalizeChoice(optionText);
    const val = normalizeChoice(answer);
    if (!opt || !val) return 0;
    if (opt === val) return 100;
    if (opt.includes(val) || val.includes(opt)) return 80;
    const valBool = booleanish(val);
    if (valBool === true && /^(yes|true|y|authorized|eligible)/.test(opt)) return 90;
    if (valBool === false && /^(no|false|n|not)/.test(opt)) return 90;
    const optWords = new Set(opt.split(/\s+/).filter((word) => word.length > 2));
    const valWords = val.split(/\s+/).filter((word) => word.length > 2);
    const hits = valWords.filter((word) => optWords.has(word)).length;
    return hits ? 40 + hits * 8 : 0;
  }

  function chooseSelectOption(el, answer) {
    let best = null;
    for (const option of Array.from(el.options || [])) {
      const score = optionScore(`${option.text} ${option.value}`, answer);
      if (!best || score > best.score) best = { option, score };
    }
    if (!best || best.score < 45) return false;
    el.value = best.option.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function chooseRadioOption(el, answer) {
    let best = null;
    for (const radio of getRadioGroup(el)) {
      const score = optionScore(`${getOptionLabel(radio)} ${radio.value}`, answer);
      if (!best || score > best.score) best = { radio, score };
    }
    if (!best || best.score < 45) return false;
    best.radio.click();
    return true;
  }

  function setCheckboxValue(el, answer) {
    const explicit = booleanish(answer);
    const shouldCheck = explicit == null ? optionScore(getOptionLabel(el), answer) >= 45 : explicit;
    el.checked = Boolean(shouldCheck);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function getVisibleCustomOptions() {
    return Array.from(document.querySelectorAll([
      '[role="option"]',
      '[role="menuitem"]',
      '[role="listbox"] li',
      '[data-automation-id*="promptOption"]',
      '[data-automation-id*="selectOption"]',
    ].join(", "))).filter((option) => {
      const rect = option.getBoundingClientRect();
      const style = window.getComputedStyle(option);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
  }

  async function chooseCustomOption(el, answer) {
    el.click();
    await new Promise((resolve) => setTimeout(resolve, 220));
    let best = null;
    for (const option of getVisibleCustomOptions()) {
      const text = normalizeText(option.innerText || option.textContent || option.getAttribute("aria-label") || "");
      const score = optionScore(text, answer);
      if (!best || score > best.score) best = { option, score };
    }
    if (!best || best.score < 45) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return false;
    }
    best.option.click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    return true;
  }

  function fillElement(el, rule, profile) {
    const raw = rule.value != null ? String(rule.value) : resolvePath(profile, rule.key);
    if (!raw) return false;

    const tag = el.tagName.toLowerCase();
    const type = getInputType(el);

    if (type === "checkbox") {
      const val = booleanish(raw) === true;
      el.checked = rule.type === "yesno-inverse" ? !val : val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (type === "radio") {
      if (rule.type === "yesno" || rule.type === "yesno-inverse") {
        const boolVal = booleanish(raw);
        const answer = rule.type === "yesno-inverse" ? (boolVal ? "No" : "Yes") : (boolVal ? "Yes" : "No");
        return chooseRadioOption(el, answer);
      }
      return chooseRadioOption(el, raw);
    }

    if (tag === "select") {
      if (rule.type === "yesno" || rule.type === "yesno-inverse") {
        const boolVal = booleanish(raw);
        const answer = rule.type === "yesno-inverse" ? (boolVal ? "No" : "Yes") : (boolVal ? "Yes" : "No");
        return chooseSelectOption(el, answer);
      }
      return chooseSelectOption(el, raw);
    }

    if (tag === "textarea" || ["text", "email", "tel", "url", "number", "search", "date", "month"].includes(type)) {
      setNativeValue(el, raw);
      return true;
    }

    return false;
  }

  async function applySmartValue(field, value) {
    if (!normalizeText(value)) return false;
    const el = field.element;
    const tag = el.tagName.toLowerCase();
    const type = getInputType(el);
    if (isCustomChoiceControl(el)) return chooseCustomOption(el, value);
    if (type === "radio") return chooseRadioOption(el, value);
    if (type === "checkbox") return setCheckboxValue(el, value);
    if (tag === "select") return chooseSelectOption(el, value);
    setNativeValue(el, value);
    return true;
  }

  function collectRemainingFields() {
    const fields = [];
    const seenRadioGroups = new Set();
    const controls = Array.from(document.querySelectorAll(FILLABLE_SELECTOR));

    for (const el of controls) {
      if (!isElementUsable(el) || !controlNeedsFill(el)) continue;
      const tag = el.tagName.toLowerCase();
      const type = getInputType(el);
      const label = getFieldSignature(el);
      if (!label || label.length < 2) continue;
      if (type === "checkbox" && /certif|attest|terms|privacy|consent|signature|acknowledge/i.test(label)) {
        continue;
      }

      if (type === "radio") {
        const group = getRadioGroup(el);
        const groupKey = group.map((radio) => radio.name || radio.id || getOptionLabel(radio)).join("|");
        if (seenRadioGroups.has(groupKey)) continue;
        seenRadioGroups.add(groupKey);
        fields.push({
          id: `radio_${fields.length}_${Math.random().toString(36).slice(2, 7)}`,
          label,
          type: "radio",
          options: getRadioOptions(el),
          element: el,
        });
        continue;
      }

      fields.push({
        id: el.id || el.name || `field_${fields.length}_${Math.random().toString(36).slice(2, 7)}`,
        label,
        type: isCustomChoiceControl(el) ? "select" : tag === "textarea" ? "textarea" : tag === "select" ? "select" : type,
        options: tag === "select" ? getSelectOptions(el) : type === "checkbox" ? [getOptionLabel(el) || "Yes"] : [],
        element: el,
      });
    }

    return fields;
  }

  function flashElement(el, isAI = false) {
    const color = isAI ? "rgba(124, 58, 237, 0.45)" : "rgba(79, 70, 229, 0.45)";
    el.style.transition = "box-shadow 0.25s ease, outline 0.25s ease";
    el.style.boxShadow = `0 0 0 3px ${color}`;
    el.style.outline = "none";
    setTimeout(() => { el.style.boxShadow = ""; }, 500);
  }

  async function fillWithScroll(profile) {
    const filled = [];
    const inputs = document.querySelectorAll(FILLABLE_SELECTOR);

    // Pass 1: collect all matching (element, rule) pairs so we know the total
    const matches = [];
    const seenRadioGroups = new Set();
    for (const el of inputs) {
      if (!isElementUsable(el) || !controlNeedsFill(el)) continue;
      if (getInputType(el) === "radio") {
        const group = getRadioGroup(el);
        const groupKey = group.map((radio) => radio.name || radio.id || getOptionLabel(radio)).join("|");
        if (seenRadioGroups.has(groupKey)) continue;
        seenRadioGroups.add(groupKey);
      }
      const sig = getFieldSignature(el);
      for (const rule of FIELD_RULES) {
        if (rule.match.test(sig)) {
          matches.push({ el, rule });
          break;
        }
      }
    }

    // Pass 2: fill each with scroll + indicator
    for (let i = 0; i < matches.length; i++) {
      const { el, rule } = matches[i];
      const rawLabel = LABEL_MAP[rule.key] || rule.key.split('.').pop().replace(/([A-Z])/g, ' $1').trim();
      showFillIndicator(rawLabel, i + 1, matches.length, false);
      const ok = fillElement(el, rule, profile);
      if (ok) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        flashElement(el, false);
        await new Promise(r => setTimeout(r, 110));
        const displayVal = el.tagName === "SELECT"
          ? (el.options[el.selectedIndex]?.text || el.value)
          : (el.value || resolvePath(profile, rule.key));
        filled.push({
          element: el,
          label: rawLabel,
          key: rule.key,
          value: displayVal,
          type: el.tagName.toLowerCase() === "textarea" ? "textarea" : "text",
          isAI: false,
        });
      }
    }

    hideFillIndicator();
    return filled;
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  function init() {
    if (isKforceApplyPage()) {
      injectKforceFillButton();
      return;
    }

    if (isExperisPage()) {
      injectExperisFillButton();
      // Auto-run if navigated here via Quick Apply button
      if (isExperisApplyPage() && sessionStorage.getItem("careeros_experis_autofill") === "1") {
        sessionStorage.removeItem("careeros_experis_autofill");
        setTimeout(() => {
          const btn = document.getElementById(EXPERIS_FILL_ID);
          if (btn) btn.click();
        }, 800);
      }
      return;
    }

    if (shouldShowAutofillPanel()) {
      injectAutofillLauncher();
    }
  }

  // Initial load
  await new Promise((r) => setTimeout(r, 1000));
  init();

  // Watch for dynamic form loads (SPAs)
  new MutationObserver(() => {
    if (!document.getElementById(PANEL_ID)) {
      init();
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
