import assert from "node:assert/strict";
import test from "node:test";

import { resolveRecipients } from "./recipient-routing.js";

test("app=nicole adds Nicole's NextDay Biz Funding address", () => {
  const result = resolveRecipients(["default@example.com"], "  NiCoLe  ");

  assert.deepEqual(result, {
    appKey: "nicole",
    extras: ["Nicole@nextdaybizfunding.com"],
    recipients: ["default@example.com", "Nicole@nextdaybizfunding.com"],
  });
});

test("an unknown app parameter adds no extra recipient", () => {
  const result = resolveRecipients(["default@example.com"], "unknown");

  assert.deepEqual(result, {
    appKey: "unknown",
    extras: [],
    recipients: ["default@example.com"],
  });
});
