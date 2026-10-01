// Dates rendered by both the server and the browser must format identically,
// or React reports a hydration mismatch. Intl's month abbreviations differ
// between Node's and the browser's locale data ("Sept" vs "Sep" for en-GB),
// so the months are spelled out here. UTC on both sides for the same reason.

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "30 Sep 2026" */
export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "30 September 2026" */
export function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "1 Oct 2026, 13:53 UTC" -- audit times are shown in UTC, said so, not guessed. */
export function formatDateTimeUtc(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatDateShort(iso)}, ${hh}:${mm} UTC`;
}

/** "October 2026", from "2026-10-01" -- a calendar month, no time zone involved. */
export function formatMonth(isoDate: string): string {
  const [year, month] = isoDate.split("-").map(Number);
  return `${LONG[month - 1]} ${year}`;
}
