/**
 * Common autofill rules and field-filling utilities.
 * Used by all site fillers.
 */

export const FIELD_RULES = [
  { match: /first[\s_-]?name|given[\s_-]?name|fname/i, key: "personal.firstName" },
  { match: /last[\s_-]?name|surname|lname|family[\s_-]?name/i, key: "personal.lastName" },
  { match: /full[\s_-]?name|your[\s_-]?name/i, key: "personal.fullName" },
  { match: /e?mail/i, key: "personal.email" },
  { match: /phone|mobile|tel(?:ephone)?|cell/i, key: "personal.phone" },
  { match: /linkedin/i, key: "personal.linkedin" },
  { match: /github/i, key: "personal.github" },
  { match: /portfolio|personal[\s_-]?(?:website|site|url)|website/i, key: "personal.portfolio" },
  { match: /street|address(?!\s*2)/i, key: "personal.address" },
  { match: /city|town/i, key: "personal.city" },
  { match: /state|province|region/i, key: "personal.state", type: "select" },
  { match: /zip|postal/i, key: "personal.zip" },
  { match: /country/i, key: "personal.country", type: "select" },
  { match: /authori[sz]ed[\s\S]{0,20}work|eligible[\s\S]{0,20}work/i, key: "work_auth.authorized", type: "yesno" },
  { match: /sponsor/i, key: "work_auth.requires_sponsorship", type: "yesno-inverse" },
  { match: /visa/i, key: "work_auth.visa_status" },
  { match: /gender/i, key: "demographics.gender", type: "select" },
  { match: /race|ethnic/i, key: "demographics.race", type: "select" },
  { match: /veteran/i, key: "demographics.veteran", type: "select" },
  { match: /disab/i, key: "demographics.disability", type: "select" },
  { match: /school|university|college|institution/i, key: "education.0.school" },
  { match: /degree/i, key: "education.0.degree", type: "select" },
  { match: /major|field[\s_-]?of[\s_-]?study|concentration/i, key: "education.0.field" },
  { match: /gpa|grade\s*point/i, key: "education.0.gpa" },
  { match: /current[\s_-]?(?:company|employer|organization)/i, key: "experience.0.company" },
  { match: /current[\s_-]?(?:role|title|position|job)/i, key: "experience.0.title" },
  { match: /years[\s\S]{0,15}experience|experience[\s\S]{0,15}years/i, key: "_years_exp" },
  { match: /cover[\s_-]?letter/i, key: "cover_letter_template" },
  { match: /how[\s\S]{0,20}hear|referr|source/i, key: "_heard_about" },
];

/** Resolve a dot-path like "personal.firstName" from the profile object */
export function resolvePath(profile, path) {
  if (path.startsWith("_")) return ""; // special keys — no value
  const parts = path.split(".");
  let val = profile;
  for (const part of parts) {
    if (val == null) return "";
    val = val[part];
  }
  return val == null ? "" : String(val);
}

/** Build a text signature for an input element to match against rules */
export function getFieldSignature(el) {
  const label = el.labels?.[0]?.innerText?.trim() || "";
  const ariaLabel = el.getAttribute("aria-label") || "";
  const placeholder = el.getAttribute("placeholder") || "";
  const name = el.getAttribute("name") || "";
  const id = el.getAttribute("id") || "";
  // Walk up to find nearby label text
  let parentText = "";
  let node = el.parentElement;
  for (let i = 0; i < 3 && node; i++) {
    const text = node.innerText?.slice(0, 60) || "";
    if (text && text !== el.value) { parentText = text; break; }
    node = node.parentElement;
  }
  return [label, ariaLabel, placeholder, name, id, parentText].join(" ").toLowerCase();
}

/** Set a value on a controlled or native input and fire React-compatible events */
export function setNativeValue(el, value) {
  const descriptor = Object.getOwnPropertyDescriptor(
    el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    "value"
  );
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Fill a single element with the appropriate value from the profile */
export function fillElement(el, rule, profile) {
  const raw = resolvePath(profile, rule.key);
  if (!raw && !rule.type) return false;

  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute("type") || "text").toLowerCase();

  // Checkbox
  if (type === "checkbox") {
    const val = raw === "true" || raw === "1" || raw === "yes";
    if (rule.type === "yesno-inverse") el.checked = !val;
    else el.checked = val;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  // Radio group — find matching label
  if (type === "radio") {
    const form = el.form || document;
    const radios = form.querySelectorAll(`input[type="radio"][name="${el.name}"]`);
    for (const radio of radios) {
      const radioLabel = (radio.labels?.[0]?.innerText || radio.value || "").toLowerCase();
      let match = false;
      if (rule.type === "yesno") {
        const isYes = raw === "true" || raw === "1";
        match = isYes ? /^yes|true/i.test(radioLabel) : /^no|false/i.test(radioLabel);
      } else if (rule.type === "yesno-inverse") {
        const isYes = raw === "true" || raw === "1";
        match = !isYes ? /^yes|true/i.test(radioLabel) : /^no|false/i.test(radioLabel);
      } else {
        match = radioLabel.includes(raw.toLowerCase()) || raw.toLowerCase().includes(radioLabel);
      }
      if (match) {
        radio.click();
        return true;
      }
    }
    return false;
  }

  // Select
  if (tag === "select") {
    const options = Array.from(el.options);
    const target = raw.toLowerCase();
    const opt = options.find(
      (o) => o.text.toLowerCase().includes(target) || o.value.toLowerCase().includes(target)
    );
    if (opt) {
      el.value = opt.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  // Text / textarea / email / tel / url
  if (["text", "email", "tel", "url", "textarea"].includes(type) || tag === "textarea") {
    if (raw) {
      setNativeValue(el, raw);
      return true;
    }
    return false;
  }

  return false;
}

/** Main fill function: scan all inputs on the page and fill matched ones */
export function fillPage(profile) {
  const filled = [];
  const inputs = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="password"]), textarea, select'
  );

  for (const el of inputs) {
    if (el.disabled || el.readOnly) continue;
    const sig = getFieldSignature(el);
    for (const rule of FIELD_RULES) {
      if (rule.match.test(sig)) {
        const ok = fillElement(el, rule, profile);
        if (ok) {
          filled.push({ label: sig.slice(0, 40), key: rule.key });
        }
        break;
      }
    }
  }

  return filled;
}
