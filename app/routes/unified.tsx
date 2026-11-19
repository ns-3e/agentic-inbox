// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router";
import { UNIFIED_AGENT_NAME } from "shared/agents";
import AgentSidebar from "~/components/AgentSidebar";
import { setMailboxOrder } from "~/components/EmailListRow";
import Header from "~/components/Header";
import UnifiedSidebar from "~/components/UnifiedSidebar";
import { ActiveMailboxContext } from "~/hooks/useActiveMailbox";
import { useUIStore } from "~/hooks/useUIStore";
import { useUnifiedSummary } from "~/queries/emails";

export function meta() {
	return [{ title: "All inboxes · Agentic Inbox" }];
}

/**
 * Layout for the unified "All inboxes" view: sidebar, search header and the
 * all-mailbox agent, around a child route (folder list or search results).
 *
 * Owns which mailbox the email panel / composer act on, and shares it with
 * children and the agent panel through ActiveMailboxContext.
 */
export default function UnifiedLayout() {
	const {
		isComposing,
		startCompose,
		closePanel,
		isSidebarOpen,
		closeSidebar,
		isAgentPanelOpen,
	} = useUIStore();
	const composeOptions = useUIStore((s) => s.composeOptions);

	// Mailbox of the email open in the reader, and mailbox a new message is sent from.
	const [selectedMailboxId, setSelectedMailboxId] = useState<string | undefined>();
	const [composeMailboxId, setComposeMailboxId] = useState<string | undefined>();

	const { data: summaries = [] } = useUnifiedSummary({ refetchInterval: 30_000 });
	const mailboxIds = useMemo(() => {
		const ids = summaries.map((m) => m.id);
		setMailboxOrder(ids);
		return ids;
	}, [summaries]);

	// Don't let a panel left open in a single-mailbox view leak in here.
	useEffect(() => {
		closePanel();
	}, [closePanel]);

	// Default the composer's "From" to the first mailbox once they load.
	useEffect(() => {
		if (!composeMailboxId && mailboxIds.length > 0) setComposeMailboxId(mailboxIds[0]);
	}, [composeMailboxId, mailboxIds]);

	const focusMailbox = useCallback((id: string) => {
		setSelectedMailboxId(id);
		setComposeMailboxId(id);
	}, []);

	// A brand-new message uses the "From" picker; everything else (reading,
	// replying, forwarding, editing a draft) acts on the selected email's mailbox.
	const isNewCompose = isComposing && composeOptions.mode === "new" && !composeOptions.draftEmail;
	const activeMailboxId = isNewCompose ? composeMailboxId : (selectedMailboxId ?? composeMailboxId);
	const activeMailbox = useMemo(
		() => ({
			mailboxId: activeMailboxId,
			mailboxes: mailboxIds,
			setMailboxId: setComposeMailboxId,
			focusMailbox,
		}),
		[activeMailboxId, mailboxIds, focusMailbox],
	);

	return (
		<ActiveMailboxContext.Provider value={activeMailbox}>
			<div className="flex h-screen overflow-hidden">
				{isSidebarOpen && (
					<div
						className="fixed inset-0 z-30 bg-black/30 md:hidden"
						onClick={closeSidebar}
						onKeyDown={(e) => e.key === "Escape" && closeSidebar()}
						role="button"
						tabIndex={-1}
						aria-label="Close sidebar"
					/>
				)}
				<div
					className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:z-0 ${
						isSidebarOpen ? "translate-x-0" : "-translate-x-full"
					}`}
				>
					<UnifiedSidebar summaries={summaries} onCompose={() => startCompose()} />
				</div>

				<div className="flex-1 flex flex-col min-w-0 bg-kumo-base">
					<Header />
					<main className="flex-1 overflow-hidden">
						<Outlet />
					</main>
				</div>

				{isAgentPanelOpen && (
					<div className="hidden lg:flex w-[380px] shrink-0 border-l border-kumo-line flex-col bg-kumo-base overflow-hidden">
						<AgentSidebar agentName={UNIFIED_AGENT_NAME} />
					</div>
				)}
			</div>
		</ActiveMailboxContext.Provider>
	);
}
