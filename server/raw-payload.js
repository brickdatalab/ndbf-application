function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeRawPayloadForBigQuery(payload) {
  if (!isRecord(payload) || !isRecord(payload.formData)) return payload;

  const { signature: _signature, ...formDataWithoutSignature } = payload.formData;
  return {
    ...payload,
    formData: formDataWithoutSignature,
  };
}

export function serializeRawPayloadForBigQuery(payload) {
  return JSON.stringify(sanitizeRawPayloadForBigQuery(payload));
}
