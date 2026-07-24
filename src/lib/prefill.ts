import type { FormData } from "../store";
import { formatPhone } from "./utils";

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
  "prefill",
  "contact_id",
  "recipient_id",
  "message_id",
  "application_id",
  "entry_id",
] as const;

export function getUrlPrefill(searchParams: URLSearchParams): Partial<FormData> {
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

  return prefill;
}

export function removeUrlPrefillParams(searchParams: URLSearchParams): URLSearchParams {
  const sanitizedParams = new URLSearchParams(searchParams);
  URL_PREFILL_PARAMS.forEach((param) => sanitizedParams.delete(param));
  return sanitizedParams;
}
