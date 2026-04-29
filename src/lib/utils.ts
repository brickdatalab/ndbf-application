import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Format phone to (XXX) XXX-XXXX as user types. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Format SSN to XXX-XX-XXXX. */
export function formatSSN(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/** Format EIN / Federal Tax ID to XX-XXXXXXX. */
export function formatEIN(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/** Format a numeric string as US dollars: 12345 -> "$12,345". */
export function formatUSD(raw: string | number): string {
  const digits = String(raw).replace(/[^\d.]/g, "");
  if (!digits) return "";
  const n = Number(digits);
  if (Number.isNaN(n)) return "";
  return "$" + n.toLocaleString("en-US");
}

/** Strip non-digit characters from a currency input. */
export function cleanCurrencyInput(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

/** Simple email regex. */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Generate a short, URL-safe ID for demo entry IDs. */
export function shortId(len = 6): string {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Slugify the business name for a folder-safe key. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

/** Fully redact an email for PDF display — no info leaked. */
export function redactEmail(_email: string): string {
  return "***********";
}

/** Fully redact a phone for PDF display — no digits leaked. */
export function redactPhone(_phone: string): string {
  return "(XXX) XXX-XXXX";
}

/** Format a sales-bucket value as its label. */
export function salesBucketLabel(value: string, buckets: Array<{ value: string; label: string }>): string {
  return buckets.find((b) => b.value === value)?.label ?? "Not provided";
}
