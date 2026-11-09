// "today", "yesterday", "3 days ago" ... for the "recently updated" cards
export function timeAgo(value) {
  if (!value) return "";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 7) return `Updated ${days} days ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `Updated ${w} week${w === 1 ? "" : "s"} ago`;
  }
  return "Updated " + new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// How many of the given dates fall within the last 7 days
export function countThisWeek(values) {
  const limit = Date.now() - 7 * 86400000;
  return values.filter((v) => v && new Date(v).getTime() >= limit).length;
}
