// The oversell demo in one command: naive, then atomic, each on a freshly reset
// database. Runs in its own compose project (quotient-demo, ports 3100 and 5434),
// so the dev stack and its data are never touched.
//
//   node tools/demo.mjs          tears the demo stack down at the end
//   node tools/demo.mjs --keep   leaves the atomic stack running for inspection
//
// Exit code 0 only when naive shows a violation and atomic sells exactly the quota.
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LOAD_TEST = path.join(ROOT, "tools", "load-test");
const RESULTS = path.join(LOAD_TEST, "results");
const CHECKER = path.join(ROOT, "tools", "invariant-check", "check.mts");

const PROJECT = "quotient-demo";
const API_PORT = "3100";
const POSTGRES_PORT = "5434";
const K6_IMAGE = "grafana/k6:2.3.0";
const BUYERS = 200;
const QUOTA = 100;
// Enough for the lost update to show on every run; see NAIVE_RACE_DELAY_MS.
const NAIVE_RACE_DELAY_MS = "30";
const ORGANIZER = { ORGANIZER_EMAIL: "demo-organizer@quotient.local", ORGANIZER_PASSWORD: "demo-organizer-pass" };
const DATABASE_URL = `postgres://quotient:quotient@localhost:${POSTGRES_PORT}/quotient`;

function run(command, args, { env = {}, cwd = ROOT, capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return result;
}

function must(result, step) {
  if (result.status !== 0) throw new Error(`${step} failed with exit code ${result.status}`);
  return result;
}

const composeEnv = (strategy) => ({
  API_PORT,
  POSTGRES_PORT,
  NODE_ENV: "development",
  QUOTA_STRATEGY: strategy,
  NAIVE_RACE_DELAY_MS: strategy === "naive" ? NAIVE_RACE_DELAY_MS : "0",
  ...ORGANIZER,
});

const compose = (strategy, ...args) =>
  must(run("docker", ["compose", "-p", PROJECT, ...args], { env: composeEnv(strategy) }), `docker compose ${args[0]}`);

function heading(text) {
  console.log(`\n${"=".repeat(8)} ${text} ${"=".repeat(Math.max(0, 60 - text.length))}`);
}

async function phase(strategy) {
  heading(`${strategy}: reset database`);
  compose(strategy, "down", "-v", "--remove-orphans");
  compose(strategy, "up", "-d", "--build", "--wait");

  heading(`${strategy}: seed ${BUYERS} buyers, quota ${QUOTA}`);
  must(
    run(process.execPath, [path.join(LOAD_TEST, "seed.mjs")], {
      env: { API_URL: `http://localhost:${API_PORT}`, BUYERS: String(BUYERS), QUOTA: String(QUOTA), ...ORGANIZER },
    }),
    "seed",
  );

  heading(`${strategy}: k6, ${BUYERS} POST /orders at once`);
  must(
    run("docker", [
      "run", "--rm",
      "--network", `${PROJECT}_default`,
      "--mount", `type=bind,source=${LOAD_TEST},target=/scripts`,
      "-w", "/scripts",
      "-e", "API_URL=http://api:3000",
      "-e", `RESULT_LABEL=${strategy}`,
      K6_IMAGE, "run", "--quiet", "/scripts/orders.js",
    ]),
    "k6",
  );
  const k6 = JSON.parse(await readFile(path.join(RESULTS, `k6-${strategy}.json`), "utf8"));

  heading(`${strategy}: invariant checker`);
  const checker = (args, capture) =>
    run(process.execPath, ["--import", "tsx", CHECKER, ...args], {
      cwd: path.join(ROOT, "api"),
      env: { DATABASE_URL },
      capture,
    });
  if (checker([], false).status === 2) throw new Error("invariant checker could not run");
  const json = checker(["--json"], true);
  if (json.status === 2) throw new Error("invariant checker could not run");
  return { strategy, k6, report: JSON.parse(json.stdout) };
}

function verdict({ strategy, k6, report }) {
  if (strategy === "naive") {
    return report.ok ? "TIDAK SESUAI: naive seharusnya LANGGAR" : "SESUAI: naive LANGGAR";
  }
  const exact = report.ok && k6.created === QUOTA && k6.quotaExhausted === BUYERS - QUOTA && k6.other === 0;
  return exact ? `SESUAI: atomic OK, tepat ${QUOTA} terjual` : "TIDAK SESUAI: atomic seharusnya OK dengan tepat 100 terjual";
}

function markdown(results, startedAt) {
  const lines = [
    `# Demo oversell, ${startedAt}`,
    "",
    `${BUYERS} pembeli mengirim POST /orders (1 tiket Reguler) bersamaan, kuota ${QUOTA}. ` +
      `Naive memakai NAIVE_RACE_DELAY_MS=${NAIVE_RACE_DELAY_MS}.`,
    "",
    "| Strategi | 201 | 409 QUOTA_EXHAUSTED | Lain | p95 (ms) | Invariant | Hasil |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const r of results) {
    const failed = r.report.checks.filter((c) => !c.ok).length;
    lines.push(
      `| ${r.strategy} | ${r.k6.created} | ${r.k6.quotaExhausted} | ${r.k6.other} | ${Math.round(r.k6.durationMs.p95)} | ` +
        `${r.report.ok ? "OK" : `LANGGAR (${failed})`} | ${verdict(r)} |`,
    );
  }
  for (const r of results) {
    lines.push("", `## ${r.strategy}`, "");
    const pairs = (values) => Object.entries(values).map(([k, v]) => `${k}=${v}`).join(", ");
    for (const c of r.report.checks) {
      lines.push(`- ${c.ok ? "OK" : "LANGGAR"}: ${c.description} (total: ${pairs(c.values)})`);
      // Per ticket type, so a quota is never mixed with the other type's.
      for (const v of c.violations) lines.push(`  - ${v.subject.kind ?? "pembeli"}: ${pairs(v.values)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

const startedAt = new Date().toISOString();
await mkdir(RESULTS, { recursive: true });
const results = [];
let failure;
try {
  results.push(await phase("naive"));
  results.push(await phase("atomic"));
} catch (err) {
  failure = err;
} finally {
  if (!process.argv.includes("--keep") || failure) {
    heading("tear down the demo stack");
    run("docker", ["compose", "-p", PROJECT, "down", "-v", "--remove-orphans"], { env: composeEnv("atomic") });
  }
}
if (failure) {
  console.error(`\nDemo stopped: ${failure.message}`);
  process.exit(2);
}

const stamp = startedAt.replace(/[:.]/g, "-");
const summary = markdown(results, startedAt);
await writeFile(path.join(RESULTS, `demo-${stamp}.md`), summary);
await writeFile(path.join(RESULTS, `demo-${stamp}.json`), JSON.stringify({ startedAt, results }, null, 2));
await writeFile(path.join(RESULTS, "demo-latest.md"), summary);

heading("summary");
console.log(summary);
console.log(`Saved to ${path.join(RESULTS, `demo-${stamp}.md`)}`);
process.exit(results.every((r) => verdict(r).startsWith("SESUAI")) ? 0 : 1);
