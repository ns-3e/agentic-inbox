// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * EmailAgent instance name for the unified "All inboxes" view. Every other
 * agent instance is named after its mailbox address; this one has no "@" so
 * it can never collide with a mailbox, and its tools span every mailbox.
 */
export const UNIFIED_AGENT_NAME = "all-mailboxes";
