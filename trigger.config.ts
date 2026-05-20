import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_hyrguaodlpvlxcwmwxra",
  runtime: "node",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./trigger/jobs"],
  build: {
    // voyageai@0.2.1 has broken directory imports in its ESM build.
    // The CJS build (require condition) is fine. Setting conditions here
    // tells esbuild to resolve the "require" export entry from package.json
    // for all packages, which bundles the CJS version of voyageai correctly.
    conditions: ["require", "node"],
  },
});
