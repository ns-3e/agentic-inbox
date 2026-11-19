// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { createContext, useContext } from "react";
import { useParams } from "react-router";

/**
 * Lets views that span several mailboxes (the unified "All inboxes" view)
 * tell the email panel and composer which mailbox to act on. Inside a
 * single-mailbox route there is no provider and the URL param is used.
 */
export interface ActiveMailboxValue {
	mailboxId: string | undefined;
	/** When set, the composer shows a "From" picker over these mailboxes. */
	mailboxes?: string[];
	setMailboxId?: (id: string) => void;
	/** Make this the mailbox the reader / reply / draft-edit acts on. */
	focusMailbox?: (id: string) => void;
}

export const ActiveMailboxContext = createContext<ActiveMailboxValue | null>(null);

export function useActiveMailbox(): ActiveMailboxValue {
	const ctx = useContext(ActiveMailboxContext);
	const { mailboxId } = useParams<{ mailboxId: string }>();
	return ctx ?? { mailboxId };
}

export function useActiveMailboxId(): string | undefined {
	return useActiveMailbox().mailboxId;
}
