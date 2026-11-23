// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useMemo, useState } from "react";
import { UNIFIED_AGENT_NAME } from "shared/agents";
import { setMailboxOrder } from "~/components/EmailListRow";
import MailShell from "~/components/MailShell";
import UnifiedSidebar from "~/components/UnifiedSidebar";
import { ActiveMailboxContext } from "~/hooks/useActiveMailbox";
import { usePreferences } from "~/hooks/usePreferences";
import { useUIStore } from "~/hooks/useUIStore";
import { useUnifiedSummary } from "~/queries/emails";

export function meta() {
	return [{ title: "All mailboxes · Agentic Inbox" }];
}

/**
 * Layout for the unified "All inboxes" view. The open email's mailbox comes
 * from the UI store (set when a row is opened, or from ?mb= in the URL); the
 * From picker for new mail is kept here.
 */
export default function UnifiedLayout() {
	const startCompose = useUIStore((s) => s.startCompose);
	const selectedMailboxId = useUIStore((s) => s.selectedMailboxId);
	const [composeFrom, setComposeFrom] = useState<string | undefined>();

	const refreshSeconds = usePreferences((s) => s.refreshSeconds);
	const { data: summaries = [] } = useUnifiedSummary({ refetchInterval: refreshSeconds ? refreshSeconds * 1000 : undefined });
	const mailboxIds = useMemo(() => {
		const ids = summaries.map((m) => m.id);
		setMailboxOrder(ids);
		return ids;
	}, [summaries]);

	useEffect(() => {
		if (!composeFrom && mailboxIds.length > 0) setComposeFrom(mailboxIds[0]);
	}, [composeFrom, mailboxIds]);

	const value = useMemo(
		() => ({
			mailboxId: selectedMailboxId ?? undefined,
			mailboxes: mailboxIds,
			composeFrom,
			setComposeFrom,
			focusMailbox: setComposeFrom,
		}),
		[selectedMailboxId, mailboxIds, composeFrom],
	);

	return (
		<ActiveMailboxContext.Provider value={value}>
			<MailShell
				unified
				basePath="/all"
				agentName={UNIFIED_AGENT_NAME}
				sidebar={(collapsed) => <UnifiedSidebar summaries={summaries} onCompose={() => startCompose()} collapsed={collapsed} />}
			/>
		</ActiveMailboxContext.Provider>
	);
}
