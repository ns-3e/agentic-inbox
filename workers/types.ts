// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Env extends Cloudflare.Env {
	POLICY_AUD: string;
	TEAM_DOMAIN: string;
	/** Optional: lets the app set up Email Routing and Email Sending (see workers/lib/cloudflare.ts). */
	CF_API_TOKEN?: string;
	/** Optional: this Worker's name, if it is not "agentic-inbox". */
	WORKER_NAME?: string;
}
