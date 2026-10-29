// timeframe.js - the "which dates?" choices for the admin screens, and what they turn into.
// A range looks like { preset: "7d", from: "", to: "" }. from/to are only used for "custom".

export const PRESETS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom dates..." },
];

export const ALL_TIME = { preset: "all", from: "", to: "" };

// 2026-10-28 (the person's own calendar day, not UTC)
function ymd(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + m + "-" + d;
}

// The first and last day (YYYY-MM-DD, or "") that a range covers
export function rangeDates(range) {
  const today = new Date();
  if (range.preset === "today") return { from: ymd(today), to: ymd(today) };
  if (range.preset === "7d" || range.preset === "30d") {
    const start = new Date(today);
    start.setDate(start.getDate() - (range.preset === "7d" ? 6 : 29));     // today counts as a day
    return { from: ymd(start), to: ymd(today) };
  }
  if (range.preset === "month") return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
  if (range.preset === "custom") return { from: range.from, to: range.to };
  return { from: "", to: "" };
}

// The bit added to the web address: "&date_from=2026-10-01&date_to=2026-10-28"
export function rangeQuery(range) {
  const { from, to } = rangeDates(range);
  return (from ? "&date_from=" + from : "") + (to ? "&date_to=" + to : "");
}