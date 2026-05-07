/**
 * LinkedIn job page parser.
 * Works on /jobs/view/<id>/ URLs.
 */
export function parse() {
  const title =
    document.querySelector(".job-details-jobs-unified-top-card__job-title h1")?.innerText?.trim() ||
    document.querySelector(".jobs-unified-top-card__job-title h1")?.innerText?.trim() ||
    document.querySelector("h1.t-24")?.innerText?.trim() ||
    "";

  const company =
    document.querySelector(".job-details-jobs-unified-top-card__company-name a")?.innerText?.trim() ||
    document.querySelector(".jobs-unified-top-card__company-name a")?.innerText?.trim() ||
    document.querySelector(".topcard__org-name-link")?.innerText?.trim() ||
    "";

  const location =
    document.querySelector(".job-details-jobs-unified-top-card__bullet")?.innerText?.trim() ||
    document.querySelector(".jobs-unified-top-card__bullet")?.innerText?.trim() ||
    "";

  const description =
    document.querySelector(".job-details-jobs-unified-top-card__job-description")?.innerText?.trim() ||
    document.querySelector(".jobs-description__content")?.innerText?.trim() ||
    document.querySelector("#job-details")?.innerText?.trim() ||
    "";

  const jobType =
    document.querySelector(".job-details-jobs-unified-top-card__job-insight span")?.innerText?.trim() || "";

  if (!title || !company) return null;

  return {
    title,
    company,
    location,
    description: description.slice(0, 8000),
    job_type: jobType,
    url: window.location.href,
    source: "linkedin",
  };
}
