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
