/**
 * Lever job page parser.
 * Works on jobs.lever.co/{company}/{job-id}
 */
export function parse() {
  const title =
    document.querySelector(".posting-headline h2")?.innerText?.trim() ||
    document.querySelector("h2")?.innerText?.trim() ||
    "";

  const company =
    document.querySelector(".main-header-text .company-name")?.innerText?.trim() ||
    // Extract from URL: jobs.lever.co/{company}/{id}
    (window.location.pathname.split("/")[1] || "").replace(/-/g, " ") ||
    "";

  const location =
    document.querySelector(".sort-by-time.posting-category")?.innerText?.trim() ||
    document.querySelector(".workplaceTypes")?.innerText?.trim() ||
    document.querySelector(".location")?.innerText?.trim() ||
    "";

  const description =
    document.querySelector(".posting-description")?.innerText?.trim() ||
    document.querySelector(".content-wrapper")?.innerText?.trim() ||
    "";

  if (!title) return null;

  return {
    title,
    company,
    location,
    description: description.slice(0, 8000),
    url: window.location.href,
    source: "lever",
  };
}
