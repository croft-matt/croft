import { defineConfig } from "@trigger.dev/sdk/v3";
import { createRequire } from "module";

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
    // voyageai@0.2.1 has broken directory imports in its ESM build. The CJS
    // build works fine. This esbuild plugin intercepts the voyageai import and
    // redirects it to the resolved CJS entry point, bypassing the broken ESM one.
    esbuildPlugins: [
      {
        name: "force-voyageai-cjs",
        setup(build) {
          const require = createRequire(import.meta.url);
          const cjsPath = require.resolve("voyageai");
          build.onResolve({ filter: /^voyageai$/ }, () => ({ path: cjsPath }));
        },
      },
    ],
  },
});
