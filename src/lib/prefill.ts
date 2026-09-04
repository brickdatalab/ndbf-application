import type { Address, FormData } from "../store";
import { US_STATES } from "./constants";
import { formatEIN, formatPhone } from "./utils";

const FIELD_PARAMS: Record<string, keyof Pick<
  FormData,
  "contactEmail" | "businessLegalName"
>> = {
  email: "contactEmail",
  business_legal_name: "businessLegalName",
};

const URL_PREFILL_PARAMS = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "business_legal_name",
  "ein",
  "amount_requested",
  "business_street",
  "business_city",
  "business_state",
  "business_zip",
  "owner_street",
  "owner_city",
  "owner_state",
  "owner_zip",
  "prefill",
  "contact_id",
  "recipient_id",
  "message_id",
  "application_id",
  "entry_id",
] as const;

/**
 * One address from the URL, under the given parameter prefix. Each part is
 * normalized the way its own form control normalizes typed input, so a
 * prefilled value is indistinguishable from one the applicant entered: the
 * state must be a real US code because it feeds a <select> that would otherwise
 * show blank while holding junk, and the ZIP is reduced to its first five
 * digits. Returns null when the URL carries none of the four.
 *
 * `current` is the address already in session state. Both addresses live inside
 * objects that are replaced wholesale on update, so a URL carrying only some of
 * the four parts would blank the rest. Falling back to `current` per part keeps
 * anything the applicant has already typed.
 */
function getUrlAddress(
  searchParams: URLSearchParams,
  prefix: "business" | "owner",
  current?: Address,
): Address | null {
  const street = searchParams.get(`${prefix}_street`)?.trim() ?? "";
  const city = searchParams.get(`${prefix}_city`)?.trim() ?? "";

  const rawState = searchParams.get(`${prefix}_state`)?.trim().toUpperCase() ?? "";
  const state = US_STATES.includes(rawState) ? rawState : "";

  const zip = (searchParams.get(`${prefix}_zip`) ?? "").replace(/\D/g, "").slice(0, 5);

  if (!street && !city && !state && !zip) return null;
  return {
    street: street || current?.street || "",
    city: city || current?.city || "",
    state: state || current?.state || "",
    zip: zip || current?.zip || "",
  };
}

/**
 * Whole dollars from the URL. The field stores an unformatted digit string, so
 * currency symbols, separators and cents are stripped. Cents are cut at the
 * decimal point rather than folded into the digits, or "200000.00" would arrive
 * as twenty million.
 */
function getUrlAmount(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get("amount_requested");
  if (raw === null) return null;
  const dollars = raw.split(".")[0].replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return dollars && dollars !== "0" ? dollars : null;
}

/** The owner's address, applied separately because it lives inside `owner`. */
export function getUrlOwnerAddress(
  searchParams: URLSearchParams,
  current?: Address,
): Address | null {
  return getUrlAddress(searchParams, "owner", current);
}

export function getUrlPrefill(
  searchParams: URLSearchParams,
  currentAddress?: Address,
): Partial<FormData> {
  const prefill = Object.entries(FIELD_PARAMS).reduce<Partial<FormData>>((values, [param, field]) => {
    const value = searchParams.get(param)?.trim();
    if (value) values[field] = value;
    return values;
  }, {});

  const firstName = searchParams.get("first_name")?.trim();
  const lastName = searchParams.get("last_name")?.trim();
  const fullName = searchParams.get("full_name")?.trim();

  if (firstName || lastName) {
    prefill.contactName = [firstName, lastName].filter(Boolean).join(" ");
  } else if (fullName) {
    prefill.contactName = fullName;
  }

  const phone = searchParams.get("phone")?.trim();
  if (phone) prefill.contactPhone = formatPhone(phone);

  const ein = formatEIN(searchParams.get("ein")?.trim() ?? "");
  if (ein) prefill.federalTaxId = ein;

  const amount = getUrlAmount(searchParams);
  if (amount) prefill.requestedFundingAmount = amount;

  const address = getUrlAddress(searchParams, "business", currentAddress);
  if (address) prefill.physicalAddress = address;

  return prefill;
}

export function removeUrlPrefillParams(searchParams: URLSearchParams): URLSearchParams {
  const sanitizedParams = new URLSearchParams(searchParams);
  URL_PREFILL_PARAMS.forEach((param) => sanitizedParams.delete(param));
  return sanitizedParams;
}
