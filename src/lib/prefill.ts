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
  "business_street",
  "business_city",
  "business_state",
  "business_zip",
  "prefill",
  "contact_id",
  "recipient_id",
  "message_id",
  "application_id",
  "entry_id",
] as const;

/**
 * Business address from the URL. Each part is normalized the way its own form
 * control normalizes typed input, so a prefilled value is indistinguishable
 * from one the applicant entered: the state must be a real US code because it
 * feeds a <select> that would otherwise show blank while holding junk, and the
 * ZIP is reduced to its first five digits. Returns null when the URL carries
 * none of the four, so the address object is left untouched.
 *
 * `current` is the address already in session state. Because physicalAddress is
 * a nested object, updateFormData replaces it wholesale, so a URL carrying only
 * some of the four parts would blank the rest. Falling back to `current` keeps
 * anything the applicant has already typed.
 */
function getUrlAddress(
  searchParams: URLSearchParams,
  current?: Address,
): Address | null {
  const street = searchParams.get("business_street")?.trim() ?? "";
  const city = searchParams.get("business_city")?.trim() ?? "";

  const rawState = searchParams.get("business_state")?.trim().toUpperCase() ?? "";
  const state = US_STATES.includes(rawState) ? rawState : "";

  const zip = (searchParams.get("business_zip") ?? "").replace(/\D/g, "").slice(0, 5);

  if (!street && !city && !state && !zip) return null;
  return {
    street: street || current?.street || "",
    city: city || current?.city || "",
    state: state || current?.state || "",
    zip: zip || current?.zip || "",
  };
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

  const address = getUrlAddress(searchParams, currentAddress);
  if (address) prefill.physicalAddress = address;

  return prefill;
}

export function removeUrlPrefillParams(searchParams: URLSearchParams): URLSearchParams {
  const sanitizedParams = new URLSearchParams(searchParams);
  URL_PREFILL_PARAMS.forEach((param) => sanitizedParams.delete(param));
  return sanitizedParams;
}
