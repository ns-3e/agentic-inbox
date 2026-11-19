// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Production deploy that never overwrites the Worker's live variables.
 *
 * wrangler.jsonc holds placeholder `vars` (DOMAINS, EMAIL_ADDRESSES) for local
 * development and type generation. A plain `wrangler deploy` would replace the
 * real values set in the Cloudflare dashboard with those placeholders. This
 * script strips `vars` from the generated build config and deploys with
 * --keep-vars, so the dashboard values stay in force.
 *
 * Usage: npm run deploy [-- extra wrangler args, e.g. --message "..."]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const configPath = "build/server/wrangler.json";
const config = JSON.parse(readFileSync(configPath, "utf8"));
delete config.vars;
config.keep_vars = true;
writeFileSync(configPath, JSON.stringify(config));
console.log("Deploying with live dashboard vars kept (build config vars removed).");

execFileSync("npx", ["wrangler", "deploy", "--keep-vars", ...process.argv.slice(2)], {
	stdio: "inherit",
});
