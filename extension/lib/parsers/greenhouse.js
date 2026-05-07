/**
 * Greenhouse job board parser.
 * Works on boards.greenhouse.io and job-boards.greenhouse.io.
 */
export function parse() {
  const title =
    document.querySelector(".app-title")?.innerText?.trim() ||
    document.querySelector("h1.posting-headline")?.innerText?.trim() ||
    document.querySelector("h1")?.innerText?.trim() ||
    "";

  const company =
    document.querySelector(".company-name")?.innerText?.trim() ||
    document.querySelector("#header .company-name")?.innerText?.trim() ||
    // Extract from URL: boards.greenhouse.io/{company}/jobs/{id}
    (window.location.pathname.split("/")[1] || "").replace(/-/g, " ") ||
    "";

  const location =
    document.querySelector(".location")?.innerText?.trim() ||
    document.querySelector(".office-location")?.innerText?.trim() ||
    "";

  const description =
    document.querySelector("#content")?.innerText?.trim() ||
    document.querySelector(".job-post-content")?.innerText?.trim() ||
    "";

  if (!title) return null;

  return {
    title,
    company,
    location,
    description: description.slice(0, 8000),
    url: window.location.href,
    source: "greenhouse",
  };
}
