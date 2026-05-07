/**
 * CareerOS AI Panel — Content Script
 * Appears on job application pages. Detects open-ended questions and offers:
 *   • AI-generated answers per question textarea
 *   • Instant cover letter generation
 */

(async () => {
  if (window.__careeros_ai_panel_active) return;
  window.__careeros_ai_panel_active = true;

  const PANEL_ID = "careeros-ai-panel";
  const BTN_CL_ID = "careeros-cl-btn";

  // ── Detect page job context ────────────────────────────────────────────────

  function detectPageJob() {
    const h = window.location.hostname;
    let title = "", company = "", description = "";

    if (h.includes("linkedin.com")) {
      const titleEl =
        document.querySelector(".job-details-jobs-unified-top-card__job-title h1") ||
        document.querySelector(".jobs-unified-top-card__job-title h1") ||
        document.querySelector("h1.t-24") ||
        document.querySelector(".view-column h2");
      title = titleEl?.innerText?.trim() || "";

      const companyEl = 
        document.querySelector(".job-details-jobs-unified-top-card__company-name") ||
        document.querySelector(".jobs-unified-top-card__company-name") ||
        document.querySelector(".topcard__org-name-link") ||
        document.querySelector(".jobs-unified-top-card__subtitle-grid-item.t-black--light a") ||
        document.querySelector("a[href*='/company/']");
      company = companyEl?.innerText?.trim() || "";
    } else if (h.includes("greenhouse.io")) {
      title = document.querySelector(".app-title")?.innerText?.trim() || document.querySelector("h1")?.innerText?.trim() || "";
      company = document.querySelector(".company-name")?.innerText?.trim() || (window.location.pathname.split("/")[1] || "").replace(/-/g, " ");
    } else if (h.includes("lever.co")) {
      title = document.querySelector(".posting-headline h2")?.innerText?.trim() || "";
      company = (window.location.pathname.split("/")[1] || "").replace(/-/g, " ");
    } else if (h.includes("myworkdayjobs.com")) {
      title = document.querySelector('[data-automation-id="jobPostingHeader"]')?.innerText?.trim() || "";
      company = window.location.hostname.split(".")[0].replace(/-/g, " ");
    } else if (h.includes("ashbyhq.com")) {
      title = document.querySelector(".ashby-job-posting-heading, h1")?.innerText?.trim() || "";
      company = (window.location.pathname.split("/")[1] || "").replace(/-/g, " ");
    }

    // Try JSON-LD
    if (!title) {
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const d = JSON.parse(script.textContent);
          function find(o) { if (!o) return null; if (o["@type"] === "JobPosting") return o; if (Array.isArray(o)) { for (const i of o) { const f = find(i); if (f) return f; } } if (typeof o === "object") { for (const v of Object.values(o)) { const f = find(v); if (f) return f; } } return null; }
          const p = find(d);
          if (p?.title) { title = p.title; company = (typeof p.hiringOrganization === "object" ? p.hiringOrganization?.name : p.hiringOrganization) || ""; description = (p.description || "").replace(/<[^>]+>/g, " ").trim().slice(0, 3000); break; }
        } catch (_) {}
      }
    }

    return { title, company, description };
  }

  // ── Question detection ─────────────────────────────────────────────────────

  const QUESTION_PATTERNS = [
    /why\s+(are\s+you|do\s+you)\s+(interest|apply|want)/i,
    /tell\s+us\s+about\s+yourself/i,
    /describe\s+your\s+(experience|background|skills)/i,
    /what\s+(makes\s+you|are\s+your|experience|skills)/i,
    /how\s+(have\s+you|did\s+you|would\s+you)/i,
    /provide\s+(a\s+)?summary/i,
    /introduce\s+yourself/i,
    /cover\s+letter/i,
    /additional\s+(information|comments)/i,
    /personal\s+statement/i,
    /motivation/i,
    /why\s+[a-z]+\?/i,
    /qualifications/i,
    /achievements?/i,
  ];

  function isOpenQuestion(el) {
    if (el.tagName.toLowerCase() !== "textarea") return false;
    if (el.offsetHeight < 40) return false; // skip tiny textareas

    const sig = [
      el.getAttribute("placeholder") || "",
      el.getAttribute("aria-label") || "",
      el.labels?.[0]?.innerText || "",
      el.getAttribute("name") || "",
      (() => { let n = el.parentElement; for (let i = 0; i < 4 && n; i++) { const t = n.innerText?.slice(0, 200) || ""; if (t.trim()) return t; n = n.parentElement; } return ""; })(),
    ].join(" ");

    return QUESTION_PATTERNS.some((p) => p.test(sig));
  }

  function getQuestionLabel(el) {
    const label = el.labels?.[0]?.innerText?.trim() ||
      el.getAttribute("aria-label")?.trim() ||
      el.getAttribute("placeholder")?.trim();
    if (label) return label.slice(0, 120);
    // Walk up and find nearby label-like text
    let node = el.parentElement;
    for (let i = 0; i < 4 && node; i++) {
      const texts = Array.from(node.childNodes)
        .filter((n) => n.nodeType === 3 || (n.nodeName !== "TEXTAREA" && n.nodeName !== "INPUT"))
        .map((n) => n.textContent?.trim())
        .filter(Boolean);
      if (texts.length) return texts[0].slice(0, 120);
      node = node.parentElement;
    }
    return "Open-ended question";
  }

  // ── Inject "✨ AI Answer" button next to a textarea ──────────────────────

  function injectAnswerButton(textarea) {
    if (textarea.dataset.careerosBtnInjected) return;
    textarea.dataset.careerosBtnInjected = "1";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "careeros-answer-btn";
    btn.innerHTML = `✨ AI Answer`;
    btn.title = "Generate an AI answer based on your resume";

    // Insert right after the textarea
    textarea.insertAdjacentElement("afterend", btn);

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const question = getQuestionLabel(textarea);
      const { title, company, description } = detectPageJob();

      btn.textContent = "⏳ Generating…";
      btn.disabled = true;

      const res = await chrome.runtime.sendMessage({
        type: "ANSWER_QUESTION",
        payload: {
          question,
          job_title: title,
          company,
          job_description: description.slice(0, 1500),
          max_words: 150,
          style: "detailed",
        },
      });

      btn.disabled = false;
      btn.innerHTML = `✨ AI Answer`;

      if (res?.ok && res.data?.answer) {
        showAnswerModal(textarea, question, res.data.answer, { title, company, description });
      } else {
        showInlineError(btn, res?.error || "Generation failed. Are you signed in?");
      }
    });
  }

  // ── Answer modal (shows answer, lets user copy or insert) ─────────────────

  function showAnswerModal(textarea, question, answer, jobCtx) {
    // Remove existing modal
    document.getElementById("careeros-answer-modal")?.remove();

    const modal = document.createElement("div");
    modal.id = "careeros-answer-modal";
    modal.className = "careeros-modal";
    modal.innerHTML = `
      <div class="careeros-modal-box">
        <div class="careeros-modal-header">
          <span class="careeros-modal-title">✨ AI Answer</span>
          <button class="careeros-modal-close" id="careeros-modal-close-btn">✕</button>
        </div>
        <div class="careeros-modal-question">${escHtml(question)}</div>
        <textarea class="careeros-modal-answer" id="careeros-modal-text">${escHtml(answer)}</textarea>
        <div class="careeros-modal-meta">${answer.split(/\s+/).length} words</div>
        <div class="careeros-modal-actions">
          <button class="careeros-btn careeros-btn-secondary" id="careeros-regen-btn">↻ Regenerate</button>
          <div style="display:flex;gap:8px;">
            <button class="careeros-btn careeros-btn-secondary" id="careeros-copy-btn">Copy</button>
            <button class="careeros-btn careeros-btn-primary" id="careeros-insert-btn">Insert into field</button>
          </div>
        </div>
        <div class="careeros-style-row">
          <span>Style:</span>
          <button class="careeros-style-chip active" data-style="concise">Concise</button>
          <button class="careeros-style-chip" data-style="detailed">Detailed</button>
          <button class="careeros-style-chip" data-style="bullet">Bullet points</button>
        </div>
      </div>
      <div class="careeros-modal-backdrop" id="careeros-modal-backdrop"></div>
    `;
    document.body.appendChild(modal);

    let currentStyle = "detailed";

    // Style chips
    modal.querySelectorAll(".careeros-style-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        modal.querySelectorAll(".careeros-style-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        currentStyle = chip.dataset.style;
      });
    });

    modal.querySelector("#careeros-modal-close-btn").addEventListener("click", () => modal.remove());
    modal.querySelector("#careeros-modal-backdrop").addEventListener("click", () => modal.remove());

    modal.querySelector("#careeros-copy-btn").addEventListener("click", () => {
      const text = modal.querySelector("#careeros-modal-text").value;
      navigator.clipboard.writeText(text).catch(() => {});
      const btn = modal.querySelector("#careeros-copy-btn");
      btn.textContent = "✓ Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    });

    modal.querySelector("#careeros-insert-btn").addEventListener("click", () => {
      const text = modal.querySelector("#careeros-modal-text").value;
      setNativeValue(textarea, text);
      modal.remove();
    });

    modal.querySelector("#careeros-regen-btn").addEventListener("click", async () => {
      const regenBtn = modal.querySelector("#careeros-regen-btn");
      regenBtn.textContent = "⏳ Regenerating…";
      regenBtn.disabled = true;

      const res = await chrome.runtime.sendMessage({
        type: "ANSWER_QUESTION",
        payload: {
          question,
          job_title: jobCtx.title,
          company: jobCtx.company,
          job_description: (jobCtx.description || "").slice(0, 1500),
          max_words: currentStyle === "concise" ? 80 : currentStyle === "bullet" ? 120 : 180,
          style: currentStyle,
        },
      });

      regenBtn.disabled = false;
      regenBtn.textContent = "↻ Regenerate";

      if (res?.ok && res.data?.answer) {
        modal.querySelector("#careeros-modal-text").value = res.data.answer;
        modal.querySelector(".careeros-modal-meta").textContent = `${res.data.answer.split(/\s+/).length} words`;
      }
    });
  }

  // ── Cover Letter button (floating, near the top of the form) ──────────────

  function injectCoverLetterButton() {
    if (document.getElementById(BTN_CL_ID)) return;

    const btn = document.createElement("button");
    btn.id = BTN_CL_ID;
    btn.type = "button";
    btn.className = "careeros-cl-floating-btn";
    btn.innerHTML = `📝 Generate Cover Letter`;
    document.body.appendChild(btn);

    btn.addEventListener("click", async () => {
      btn.textContent = "⏳ Generating…";
      btn.disabled = true;

      const { title, company, description } = detectPageJob();

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

      btn.disabled = false;
      btn.textContent = "📝 Generate Cover Letter";

      if (res?.ok && res.data?.cover_letter) {
        showCoverLetterModal(res.data, { title, company, description });
      } else {
        showInlineError(btn, res?.error || "Generation failed. Are you signed in?");
      }
    });
  }

  // ── Cover letter modal ────────────────────────────────────────────────────

  function showCoverLetterModal(data, jobCtx) {
    document.getElementById("careeros-cl-modal")?.remove();

    const modal = document.createElement("div");
    modal.id = "careeros-cl-modal";
    modal.className = "careeros-modal";
    modal.innerHTML = `
      <div class="careeros-modal-box careeros-modal-box--wide">
        <div class="careeros-modal-header">
          <span class="careeros-modal-title">📝 Cover Letter</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="careeros-modal-meta" id="careeros-cl-meta">${data.word_count} words</span>
            <button class="careeros-modal-close" id="careeros-cl-close">✕</button>
          </div>
        </div>
        ${data.job_title || data.company ? `<div class="careeros-modal-question">${escHtml(data.job_title || "")}${data.company ? ` at ${escHtml(data.company)}` : ""}</div>` : ""}
        <textarea class="careeros-modal-answer careeros-modal-answer--tall" id="careeros-cl-text">${escHtml(data.cover_letter)}</textarea>
        <div class="careeros-cl-controls">
          <div class="careeros-style-row">
            <span>Tone:</span>
            <button class="careeros-style-chip ${data.tone === "professional" ? "active" : ""}" data-tone="professional">Professional</button>
            <button class="careeros-style-chip ${data.tone === "casual" ? "active" : ""}" data-tone="casual">Casual</button>
            <button class="careeros-style-chip ${data.tone === "enthusiastic" ? "active" : ""}" data-tone="enthusiastic">Enthusiastic</button>
          </div>
          <div class="careeros-style-row">
            <span>Length:</span>
            <button class="careeros-style-chip ${data.length === "short" ? "active" : ""}" data-length="short">Short</button>
            <button class="careeros-style-chip ${data.length === "medium" ? "active" : ""}" data-length="medium">Medium</button>
            <button class="careeros-style-chip ${data.length === "long" ? "active" : ""}" data-length="long">Long</button>
          </div>
        </div>
        <div class="careeros-modal-actions">
          <button class="careeros-btn careeros-btn-secondary" id="careeros-cl-regen">↻ Regenerate</button>
          <div style="display:flex;gap:8px;">
            <button class="careeros-btn careeros-btn-secondary" id="careeros-cl-copy">Copy</button>
            <button class="careeros-btn careeros-btn-primary" id="careeros-cl-insert">Insert into Cover Letter field</button>
          </div>
        </div>
      </div>
      <div class="careeros-modal-backdrop" id="careeros-cl-backdrop"></div>
    `;
    document.body.appendChild(modal);

    let currentTone = data.tone || "professional";
    let currentLength = data.length || "medium";

    // Tone chips
    modal.querySelectorAll("[data-tone]").forEach((chip) => {
      chip.addEventListener("click", () => {
        modal.querySelectorAll("[data-tone]").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        currentTone = chip.dataset.tone;
      });
    });

    // Length chips
    modal.querySelectorAll("[data-length]").forEach((chip) => {
      chip.addEventListener("click", () => {
        modal.querySelectorAll("[data-length]").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        currentLength = chip.dataset.length;
      });
    });

    modal.querySelector("#careeros-cl-close").addEventListener("click", () => modal.remove());
    modal.querySelector("#careeros-cl-backdrop").addEventListener("click", () => modal.remove());

    modal.querySelector("#careeros-cl-copy").addEventListener("click", () => {
      const text = modal.querySelector("#careeros-cl-text").value;
      navigator.clipboard.writeText(text).catch(() => {});
      const btn = modal.querySelector("#careeros-cl-copy");
      btn.textContent = "✓ Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    });

    modal.querySelector("#careeros-cl-insert").addEventListener("click", () => {
      const text = modal.querySelector("#careeros-cl-text").value;
      // Find cover letter textarea on the page
      const coverLetterField = Array.from(document.querySelectorAll("textarea")).find((el) =>
        /cover.?letter/i.test(
          [el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.labels?.[0]?.innerText].join(" ")
        )
      );
      if (coverLetterField) {
        setNativeValue(coverLetterField, text);
        modal.remove();
      } else {
        navigator.clipboard.writeText(text).catch(() => {});
        const btn = modal.querySelector("#careeros-cl-insert");
        btn.textContent = "✓ Copied (no field found)";
        setTimeout(() => (btn.textContent = "Insert into Cover Letter field"), 1500);
      }
    });

    modal.querySelector("#careeros-cl-regen").addEventListener("click", async () => {
      const btn = modal.querySelector("#careeros-cl-regen");
      btn.textContent = "⏳ Regenerating…";
      btn.disabled = true;

      const res = await chrome.runtime.sendMessage({
        type: "GENERATE_COVER_LETTER",
        payload: {
          job_title: jobCtx.title,
          company: jobCtx.company,
          job_description: (jobCtx.description || "").slice(0, 2000),
          tone: currentTone,
          length: currentLength,
        },
      });

      btn.disabled = false;
      btn.textContent = "↻ Regenerate";

      if (res?.ok && res.data?.cover_letter) {
        modal.querySelector("#careeros-cl-text").value = res.data.cover_letter;
        modal.querySelector("#careeros-cl-meta").textContent = `${res.data.word_count} words`;
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor?.set) descriptor.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function showInlineError(btn, msg) {
    const err = document.createElement("span");
    err.className = "careeros-inline-error";
    err.textContent = msg;
    btn.insertAdjacentElement("afterend", err);
    setTimeout(() => err.remove(), 4000);
  }

  // ── Scan for question textareas ────────────────────────────────────────────

  function scanAndInject() {
    document.querySelectorAll("textarea").forEach((el) => {
      if (isOpenQuestion(el)) injectAnswerButton(el);
    });
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  await new Promise((r) => setTimeout(r, 1200));
  scanAndInject();

  // Re-scan on SPA navigation / dynamic form loads
  new MutationObserver(() => scanAndInject()).observe(document.body, { childList: true, subtree: true });
})();
