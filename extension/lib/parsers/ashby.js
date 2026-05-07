/**
 * Ashby HQ job page parser.
 */
export function parse() {
  const title =
    document.querySelector(".ashby-job-posting-heading")?.innerText?.trim() ||
    document.querySelector("h1")?.innerText?.trim() ||
    "";

  const company =
    document.querySelector(".ashby-job-posting-company-name")?.innerText?.trim() ||
    // Extract from URL: jobs.ashbyhq.com/{company}/...
    (window.location.pathname.split("/")[1] || "").replace(/-/g, " ") ||
    "";

  const location =
    document.querySelector(".ashby-job-posting-brief-location")?.innerText?.trim() ||
    document.querySelector("[class*='location']")?.innerText?.trim() ||
    "";

  const description =
    document.querySelector("[class*='_descriptionText_']")?.innerText?.trim() ||
    document.querySelector(".ashby-job-posting-description")?.innerText?.trim() ||
    "";

  if (!title) return null;

  return {
    title,
    company,
    location,
    description: description.slice(0, 8000),
    url: window.location.href,
    source: "ashby",
  };
}
