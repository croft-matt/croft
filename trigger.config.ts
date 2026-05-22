import { defineConfig } from "@trigger.dev/sdk/v3";
import { esbuildPlugin } from "@trigger.dev/build/extensions";
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
    extensions: [
      esbuildPlugin({
        name: "force-voyageai-cjs",
        setup(build: { onResolve(options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; external?: boolean } | null | undefined): void }) {
          // Resolve to the CJS build of voyageai lazily inside the bundle step.
          // voyageai@0.2.1 has broken ESM directory imports; the CJS build works fine.
          // Resolving eagerly at config load time fails in the Trigger.dev cloud build
          // environment where the module is not yet available when the config is parsed.
          build.onResolve({ filter: /^voyageai$/ }, () => {
            const _require = createRequire(import.meta.url);
            return { path: _require.resolve("voyageai") };
          });
          // @huggingface/transformers is a lazy require inside voyageai's local
          // tokenizer — only used for offline models. We use the API so mark it
          // external to prevent esbuild failing on an unresolvable optional dep.
          build.onResolve({ filter: /^@huggingface\/transformers$/ }, () => ({
            path: "@huggingface/transformers",
            external: true,
          }));
        },
      }),
    ],
  },
});
