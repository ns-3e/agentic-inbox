// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import AgentSidebar from "~/components/AgentSidebar";
import ComposeHost from "~/components/compose/ComposeHost";
import ComposeFab from "~/components/ComposeFab";
import Header, { SEARCH_INPUT_ID } from "~/components/Header";
import MobileAgentSheet from "~/components/MobileAgentSheet";
import ShortcutsDialog from "~/components/ShortcutsDialog";
import UrlStateSync from "~/components/UrlStateSync";
import { useHotkeys } from "~/hooks/useHotkeys";
import { useIsDesktop } from "~/hooks/useMediaQuery";
import { useUIStore } from "~/hooks/useUIStore";

/**
 * Console frame shared by a single mailbox and the unified view: top bar,
 * left rail, the work area, and the docked agent console on the right.
 * Panes meet at hairlines; nothing floats.
 */
export default function MailShell({
	sidebar,
	agentName,
	unified,
	basePath,
}: {
	sidebar: (collapsed: boolean) => ReactNode;
	agentName?: string;
	unified?: boolean;
	/** "/all" or "/mailbox/<id>": for the g-then-x shortcuts. */
	basePath: string;
}) {
	const navigate = useNavigate();
	const isDesktop = useIsDesktop();
	const { isSidebarOpen, closeSidebar, isAgentPanelOpen, sidebarCollapsed, hydratePrefs, startCompose } = useUIStore();
	const [showShortcuts, setShowShortcuts] = useState(false);

	useEffect(() => hydratePrefs(), [hydratePrefs]);

	// Gmail "g then i" style jumps.
	const gPressed = useRef(0);
	const folderPath = (f: string) => (unified ? `${basePath}/${f}` : `${basePath}/emails/${f}`);
	const go = (path: string) => () => {
		if (Date.now() - gPressed.current < 1500) {
			gPressed.current = 0;
			navigate(path);
		}
	};
	useHotkeys(
		{
			c: () => startCompose(),
			"/": () => document.getElementById(SEARCH_INPUT_ID)?.focus(),
			"?": () => setShowShortcuts(true),
			g: () => (gPressed.current = Date.now()),
			i: go(folderPath("inbox")),
			t: go(folderPath("sent")),
			d: go(folderPath("draft")),
			a: go("/all/inbox"),
		},
		isDesktop,
	);
	// "g then s" conflicts with "s" (star) in lists, so it is handled here only right after g.
	useEffect(() => {
		if (!isDesktop) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "s" && Date.now() - gPressed.current < 1500) {
				e.preventDefault();
				e.stopImmediatePropagation();
				gPressed.current = 0;
				navigate(`${basePath}/search?q=is:starred`);
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [isDesktop, basePath, navigate]);

	return (
		<div className="app-shell flex flex-col overflow-hidden bg-kumo-base">
			<UrlStateSync unified={unified} />
			<Header onShowShortcuts={() => setShowShortcuts(true)} />

			<div className="flex flex-1 min-h-0">
				{/* Phone drawer backdrop */}
				{isSidebarOpen && (
					<div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={closeSidebar} aria-hidden />
				)}
				<div
					className={`fixed inset-y-0 left-0 z-40 w-[80vw] max-w-[300px] shadow-xl md:shadow-none md:static md:z-0 md:max-w-none transform transition-[transform,width] duration-200 ease-out md:translate-x-0 ${
						sidebarCollapsed ? "md:w-[56px]" : "md:w-[232px]"
					} ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} pb-[env(safe-area-inset-bottom)] md:pb-0 shrink-0`}
				>
					{sidebar(sidebarCollapsed && isDesktop)}
				</div>

				<main className="flex-1 min-w-0 min-h-0 flex flex-col bg-kumo-base overflow-hidden">
					<Outlet />
				</main>

				{isAgentPanelOpen && (
					<aside aria-label="Agent console" className="hidden lg:flex w-[400px] shrink-0 flex-col bg-kumo-base border-l border-kumo-line overflow-hidden">
						<AgentSidebar agentName={agentName} />
					</aside>
				)}
			</div>

			<ComposeHost />
			<ComposeFab />
			<MobileAgentSheet agentName={agentName} />
			<ShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
		</div>
	);
}
