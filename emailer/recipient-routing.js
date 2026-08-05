const REP_EXTRA_RECIPIENTS = {
  nicole: ["Nicole@nextdaybizfunding.com"],
};

export function resolveRecipients(defaultRecipients, appParam) {
  const appKey = String(appParam || "").toLowerCase().trim();
  const extras = REP_EXTRA_RECIPIENTS[appKey] || [];

  return {
    appKey,
    extras,
    recipients: Array.from(new Set([...defaultRecipients, ...extras])),
  };
}
