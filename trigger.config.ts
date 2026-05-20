import { defineConfig } from "@trigger.dev/sdk/v3";
import { esbuildPlugin } from "@trigger.dev/build/extensions";
import { createRequire } from "module";

// Resolve to the CJS build of voyageai at config load time.
// voyageai@0.2.1 has broken ESM directory imports; the CJS build works fine.
const _require = createRequire(import.meta.url);
const voyageaiCjsPath = _require.resolve("voyageai");

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
    extensions: [
      esbuildPlugin({
        name: "force-voyageai-cjs",
        setup(build) {
          build.onResolve({ filter: /^voyageai$/ }, () => ({ path: voyageaiCjsPath }));
        },
      }),
    ],
  },
});
