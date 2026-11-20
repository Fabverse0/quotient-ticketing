import { randomUUID } from "node:crypto";
import { getContainerRuntimeClient } from "testcontainers";
import type { TestProject } from "vitest/node";

export const RUN_LABEL = "quotient.test-run";

declare module "vitest" {
  interface ProvidedContext {
    testRunId: string;
  }
}

// Every container of this run carries the run id. Teardown removes whatever is
// still there, such as a container that finished starting after its beforeAll
// timed out: no afterAll ever sees it, and Ryuk keeps it while any later run
// stays connected to the same Ryuk.
export default function setup(project: TestProject) {
  const runId = randomUUID();
  project.provide("testRunId", runId);

  return async function teardown() {
    const { dockerode } = (await getContainerRuntimeClient()).container;
    const leftovers = await dockerode.listContainers({ all: true, filters: { label: [`${RUN_LABEL}=${runId}`] } });
    await Promise.all(leftovers.map((c) => dockerode.getContainer(c.Id).remove({ force: true, v: true })));
    if (leftovers.length > 0) console.warn(`Removed ${leftovers.length} test container(s) left after the run`);
  };
}
