// k6 burst: every seeded buyer sends one POST /orders for 1 Regular ticket at
// the same moment. Run through Docker, see tools/load-test/README.md.
//
// Env: API_URL (default http://api:3000), RESULT_LABEL (names the summary file).
import http from "k6/http";
import exec from "k6/execution";
import { SharedArray } from "k6/data";
import { Counter } from "k6/metrics";

const seed = new SharedArray("seed", () => [JSON.parse(open("./.data/seed.json"))]);
const tokens = new SharedArray("tokens", () => JSON.parse(open("./.data/seed.json")).tokens);

const API_URL = __ENV.API_URL || "http://api:3000";
const LABEL = __ENV.RESULT_LABEL || "run";

const created = new Counter("orders_created");
const quotaExhausted = new Counter("orders_quota_exhausted");
const other = new Counter("orders_other");

// No-op thresholds make k6 keep these per-status submetrics in the summary.
const TRACKED_STATUSES = [400, 401, 409, 500, 503];

export const options = {
  scenarios: {
    burst: { executor: "per-vu-iterations", vus: tokens.length, iterations: 1, maxDuration: "90s" },
  },
  thresholds: Object.fromEntries(TRACKED_STATUSES.map((s) => [`http_reqs{status:${s}}`, ["count>=0"]])),
};

export default function () {
  const token = tokens[exec.vu.idInTest - 1];
  const res = http.post(
    `${API_URL}/orders`,
    JSON.stringify({ ticketTypeId: seed[0].ticketTypeId, quantity: 1 }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
  );

  if (res.status === 201) {
    created.add(1);
    return;
  }
  let code;
  try {
    code = res.json("error.code");
  } catch {
    code = undefined;
  }
  if (res.status === 409 && code === "QUOTA_EXHAUSTED") {
    quotaExhausted.add(1);
  } else {
    other.add(1);
    console.warn(`unexpected answer ${res.status} ${code ?? ""}`);
  }
}

const count = (data, name) => data.metrics[name]?.values.count ?? 0;

export function handleSummary(data) {
  const otherByStatus = {};
  for (const status of TRACKED_STATUSES) {
    const n = count(data, `http_reqs{status:${status}}`);
    if (n > 0 && status !== 409) otherByStatus[status] = n;
  }
  const summary = {
    label: LABEL,
    requests: count(data, "http_reqs"),
    created: count(data, "orders_created"),
    quotaExhausted: count(data, "orders_quota_exhausted"),
    other: count(data, "orders_other"),
    otherByStatus,
    durationMs: {
      median: data.metrics.http_req_duration?.values.med,
      p95: data.metrics.http_req_duration?.values["p(95)"],
      max: data.metrics.http_req_duration?.values.max,
    },
  };
  const ms = (value) => (value === undefined ? "-" : Math.round(value));
  const text =
    `\n[${LABEL}] ${summary.requests} requests: ${summary.created} x 201, ` +
    `${summary.quotaExhausted} x 409 QUOTA_EXHAUSTED, ${summary.other} other ${JSON.stringify(otherByStatus)}\n` +
    `[${LABEL}] latency ms: median ${ms(summary.durationMs.median)}, ` +
    `p95 ${ms(summary.durationMs.p95)}, max ${ms(summary.durationMs.max)}\n`;
  return {
    stdout: text,
    [`./results/k6-${LABEL}.json`]: JSON.stringify(summary, null, 2),
  };
}
