// Shared by the forms and the server actions. No server-only import: the rules
// are not secret, and the forms show them.

/**
 * A–Z and 0–9 only, 2–64 characters. Stricter than the app project's own
 * constraint (upper-case, no whitespace): easy to say out loud, easy to type
 * from a caption, and valid as an App Store custom offer code.
 */
export const CODE_PATTERN = /^[A-Z0-9]{2,64}$/;

/**
 * What people paste -- " sarah ", "Sa Rah" -- upper-cased with every space
 * removed, the same normalisation the app applies before a claim.
 */
export function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function codeError(code: string): string | null {
  return CODE_PATTERN.test(code)
    ? null
    : "Use 2–64 characters, letters A–Z and digits 0–9 only.";
}

export function nameError(name: string): string | null {
  return name.length >= 1 && name.length <= 200 ? null : "Enter a name (up to 200 characters).";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Mirrors the CHECK in migration 0003, so the form can say why before saving. */
export function looksLikeIban(value: string): boolean {
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(value.replace(/\s/g, "").toUpperCase());
}

/** Contract states, in order (migration 0007). The contract itself is in Skribble. */
export const CONTRACT_STATUSES = ["none", "sent", "signed", "ended"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  none: "No contract",
  sent: "Sent for signature",
  signed: "Signed",
  ended: "Ended",
};

export function isContractStatus(value: string): value is ContractStatus {
  return (CONTRACT_STATUSES as readonly string[]).includes(value);
}

/**
 * Mirrors creators_contract_url_check (0007): a Skribble link only. A file
 * share could carry the PDF -- bank details included -- to anyone holding it.
 */
export function isSkribbleUrl(value: string): boolean {
  return value.length <= 500 && /^https:\/\/my\.skribble\.(com|de)\/\S+$/.test(value);
}

/** The ways we can pay today (0007). A label only; the payee lives in that service. */
export const PAYOUT_METHODS = ["bank", "wise"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  bank: "Bank transfer",
  wise: "Wise",
};

export function isPayoutMethod(value: string): value is PayoutMethod {
  return (PAYOUT_METHODS as readonly string[]).includes(value);
}
