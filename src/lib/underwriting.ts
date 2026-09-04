// Hidden underwriting values passed in the application URL by a rep, e.g.
//   ?avg_monthly_deposits=52340&open_mca=2
// They are never rendered as form inputs. They are read once on page load,
// removed from the URL before analytics initializes, held in session state,
// printed on the application PDF (only when present), stored in BigQuery, and
// carried by the submission webhook.

export const UNDERWRITING_PARAMS = [
  "avg_monthly_deposits",
  "total_mca_debits",
  "avg_balance",
  "avg_negative_balance_days",
  "open_mca",
] as const;

export type UnderwritingParam = (typeof UNDERWRITING_PARAMS)[number];
export type UnderwritingValues = Record<UnderwritingParam, string | null>;

// Printed on the application PDF only. src/lib/pdf.ts uppercases every field
// label at render time, so these appear in full caps regardless of the case
// written here.
export const UNDERWRITING_LABELS: Record<UnderwritingParam, string> = {
  avg_monthly_deposits: "AVG MONTHLY DEPOSITS (True Revenue over all statements)",
  total_mca_debits: "TOTAL MCA DEBITS (sum of mca debits over most recent statement)",
  avg_balance: "AVERAGE DAILY BALANCE (most recent statement)",
  avg_negative_balance_days: "NEGATIVE ENDING BALANCE DAYS (most recent statement)",
  open_mca: "ACTIVE MCA LENDERS, FREQUENCEY, AMOUNT (most recent statement",
};

const DEFAULT_MAX_LENGTH = 100;

export const UNDERWRITING_MAX_LENGTH: Record<UnderwritingParam, number> = {
  avg_monthly_deposits: DEFAULT_MAX_LENGTH,
  total_mca_debits: DEFAULT_MAX_LENGTH,
  avg_balance: DEFAULT_MAX_LENGTH,
  avg_negative_balance_days: DEFAULT_MAX_LENGTH,
  open_mca: 600,
};

export const EMPTY_UNDERWRITING: UnderwritingValues = {
  avg_monthly_deposits: null,
  total_mca_debits: null,
  avg_balance: null,
  avg_negative_balance_days: null,
  open_mca: null,
};

/** Read the five values from the URL. Trimmed, capped, blank → null. */
export function getUrlUnderwriting(searchParams: URLSearchParams): UnderwritingValues {
  const values: UnderwritingValues = { ...EMPTY_UNDERWRITING };
  for (const param of UNDERWRITING_PARAMS) {
    const raw = searchParams.get(param)?.trim();
    values[param] = raw ? raw.slice(0, UNDERWRITING_MAX_LENGTH[param]) : null;
  }
  return values;
}

export function hasUnderwritingValues(
  values: UnderwritingValues | null | undefined
): boolean {
  if (!values) return false;
  return UNDERWRITING_PARAMS.some((param) => Boolean(values[param]));
}

export function removeUrlUnderwritingParams(searchParams: URLSearchParams): URLSearchParams {
  const sanitized = new URLSearchParams(searchParams);
  UNDERWRITING_PARAMS.forEach((param) => sanitized.delete(param));
  return sanitized;
}
