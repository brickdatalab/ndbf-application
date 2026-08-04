import assert from "node:assert/strict";
import test from "node:test";

import { serializeRawPayloadForBigQuery } from "./raw-payload.js";

test("omits only the signature image and preserves every other value", () => {
  const payload = {
    clientEntryIdHint: "ndbf_synthetic",
    appParam: "synthetic-rep",
    utm: {
      utm_source: "synthetic-source",
      utm_campaign: "synthetic-campaign",
    },
    formData: {
      contactName: "Synthetic Applicant",
      federalTaxId: "00-0000000",
      signature: "data:image/png;base64,SYNTHETIC_SIGNATURE",
      termsAccepted: true,
      owner: {
        ssn: "000-00-0000",
        dateOfBirth: "1980-01-02",
      },
      bankStatements: [
        { name: "synthetic.pdf", type: "application/pdf", size: 1234 },
      ],
      futureField: {
        nested: ["preserve", 42, true, null],
      },
    },
  };
  const originalSnapshot = structuredClone(payload);
  const expected = structuredClone(payload);
  delete expected.formData.signature;

  const serialized = serializeRawPayloadForBigQuery(payload);
  const storedPayload = JSON.parse(serialized);

  assert.deepEqual(storedPayload, expected);
  assert.equal(Object.hasOwn(storedPayload.formData, "signature"), false);
  assert.deepEqual(payload, originalSnapshot);
  assert.equal(Boolean(payload.formData.signature), true);
});

test("preserves payloads with missing or non-object formData", () => {
  const fixtures = [
    { appParam: "missing-form-data" },
    { appParam: "null-form-data", formData: null },
    { appParam: "string-form-data", formData: "unexpected" },
  ];

  for (const payload of fixtures) {
    assert.deepEqual(JSON.parse(serializeRawPayloadForBigQuery(payload)), payload);
  }
});
