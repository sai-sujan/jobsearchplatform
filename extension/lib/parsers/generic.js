/**
 * Generic fallback parser using JSON-LD JobPosting schema.
 * Fires on any page when site-specific parsers return null.
 */
export function parse() {
  // Try JSON-LD first
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const posting = findJobPosting(data);
      if (posting) {
        const title = posting.title || "";
        const company =
          (typeof posting.hiringOrganization === "object"
            ? posting.hiringOrganization?.name
            : posting.hiringOrganization) || "";
        const location =
          (typeof posting.jobLocation === "object"
            ? posting.jobLocation?.address?.addressLocality ||
              posting.jobLocation?.address?.addressRegion ||
              (Array.isArray(posting.jobLocation)
                ? posting.jobLocation[0]?.address?.addressLocality
                : "")
            : posting.jobLocation) || "";
        const description = posting.description
          ? posting.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
          : "";
        if (title || company) {
          return {
            title,
            company,
            location,
            description: description.slice(0, 8000),
            url: window.location.href,
            source: "web",
          };
        }
      }
    } catch (_) {}
  }

  // Last resort: try meta tags
  const title =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector("title")?.innerText?.trim() ||
    "";
  const description =
    document.querySelector('meta[property="og:description"]')?.content || "";

  if (title && (title.toLowerCase().includes("job") || title.toLowerCase().includes("engineer") ||
    title.toLowerCase().includes("developer") || title.toLowerCase().includes("manager") ||
    title.toLowerCase().includes("analyst") || title.toLowerCase().includes("intern"))) {
    return {
      title: title.split(" at ")[0]?.trim() || title,
      company: title.split(" at ")[1]?.trim() || "",
      location: "",
      description: description.slice(0, 8000),
      url: window.location.href,
      source: "web",
    };
  }

  return null;
}

function findJobPosting(data) {
  if (!data) return null;
  if (data["@type"] === "JobPosting") return data;
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
