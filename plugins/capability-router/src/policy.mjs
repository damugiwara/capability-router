export function applyPolicy(records, constraints = {}) {
  const disallowed = new Set(constraints.disallow ?? []);
  const required = new Set(constraints.require ?? []);
  const masked = [];
  const allowed = [];

  for (const record of records) {
    const capabilities = new Set(record.capabilities ?? []);
    const blocked = [...disallowed].filter((capability) => capabilities.has(capability));
    const missing = [...required].filter((capability) => !capabilities.has(capability));
    if (blocked.length || missing.length) {
      masked.push({ record, reason: blocked.length ? `disallowed: ${blocked.join(", ")}` : `missing: ${missing.join(", ")}` });
    } else {
      allowed.push(record);
    }
  }

  const reasonCounts = new Map();
  for (const item of masked) {
    reasonCounts.set(item.reason, (reasonCounts.get(item.reason) ?? 0) + 1);
  }
  const maskedOutSummary = masked.length
    ? [...reasonCounts.entries()].map(([reason, count]) => `${count} masked (${reason})`).join("; ")
    : "No capabilities masked by policy.";

  return { allowed, masked, maskedOutSummary };
}
