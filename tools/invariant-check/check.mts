// Invariant checker: compares quota counters with the orders and tickets tables.
// Run from the repo root: npm --prefix api run invariants [-- --json]
// Exit code: 0 all OK, 1 at least one LANGGAR, 2 the check could not run.
import { formatReport } from "../../api/src/modules/invariants/format.js";
import { createInvariantsService } from "../../api/src/modules/invariants/service.js";
import { createDatabase } from "../../api/src/shared/db/client.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required, e.g. postgres://quotient:quotient@localhost:5433/quotient");
  process.exit(2);
}

const { db, close } = createDatabase({ databaseUrl, dbPoolMax: 1 });
try {
  const report = await createInvariantsService({ db }).check();
  process.stdout.write(process.argv.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
  process.exitCode = report.ok ? 0 : 1;
} catch (err) {
  console.error("Invariant check could not run:", err);
  process.exitCode = 2;
} finally {
  await close();
}
