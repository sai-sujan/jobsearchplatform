/**
 * Workday job page parser.
 */
export function parse() {
  const title =
    document.querySelector('[data-automation-id="jobPostingHeader"]')?.innerText?.trim() ||
    document.querySelector(".css-1q2dra3")?.innerText?.trim() ||
    document.querySelector("h2.css-1q2dra3")?.innerText?.trim() ||
    "";

  // Company is usually in subdomain: {company}.myworkdayjobs.com
  const company =
    document.querySelector('[data-automation-id="headerTitle"]')?.innerText?.trim() ||
    window.location.hostname.split(".")[0].replace(/-/g, " ") ||
    "";

  const location =
    document.querySelector('[data-automation-id="locations"]')?.innerText?.trim() ||
    document.querySelector(".css-wmqx74")?.innerText?.trim() ||
    "";

  const description =
    document.querySelector('[data-automation-id="jobPostingDescription"]')?.innerText?.trim() ||
    document.querySelector(".css-cygeeu")?.innerText?.trim() ||
    "";

  if (!title) return null;

  return {
    title,
    company,
    location,
    description: description.slice(0, 8000),
    url: window.location.href,
    source: "workday",
  };
}
