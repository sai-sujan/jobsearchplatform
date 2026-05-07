/**
 * Indeed job page parser.
 */
export function parse() {
  const title =
    document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"] span')?.innerText?.trim() ||
    document.querySelector("h1.jobsearch-JobInfoHeader-title")?.innerText?.trim() ||
    document.querySelector("h1[class*='jobTitle']")?.innerText?.trim() ||
    "";

  const company =
    document.querySelector('[data-testid="inlineHeader-companyName"] a')?.innerText?.trim() ||
    document.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText?.trim() ||
    document.querySelector(".jobsearch-InlineCompanyRating-companyHeader a")?.innerText?.trim() ||
    "";

  const location =
    document.querySelector('[data-testid="job-location"]')?.innerText?.trim() ||
    document.querySelector('[data-testid="inlineHeader-companyLocation"]')?.innerText?.trim() ||
    "";

  const description =
    document.querySelector("#jobDescriptionText")?.innerText?.trim() ||
    document.querySelector('[data-testid="jobsearch-jobDescriptionText"]')?.innerText?.trim() ||
    "";

  if (!title || !company) return null;

  return {
    title,
    company,
    location,
    description: description.slice(0, 8000),
    url: window.location.href,
    source: "indeed",
  };
}
