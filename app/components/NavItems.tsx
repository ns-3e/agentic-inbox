// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	ArchiveIcon,
	FileIcon,
	FunnelSimpleIcon,
	PaperPlaneTiltIcon,
	PencilSimpleIcon,
	PlugsIcon,
	RobotIcon,
	StarIcon,
	TrashIcon,
	TrayIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Folders } from "shared/folders";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { useUIStore } from "~/hooks/useUIStore";

/** Mail queues, in rail order. "Other addresses" is the catch-all queue. */
export const NAV_FOLDERS = [
	{ id: Folders.INBOX, label: "Inbox", icon: TrayIcon },
	{ id: Folders.OTHER, label: "Other addresses", icon: FunnelSimpleIcon },
	{ id: "starred", label: "Starred", icon: StarIcon },
	{ id: Folders.DRAFT, label: "Drafts", icon: FileIcon },
	{ id: Folders.SENT, label: "Sent", icon: PaperPlaneTiltIcon },
	{ id: Folders.ARCHIVE, label: "Archive", icon: ArchiveIcon },
	{ id: Folders.TRASH, label: "Trash", icon: TrashIcon },
] as const;

/** Primary rail action: start a new message. Square icon when the rail is collapsed. */
export function ComposePill({ collapsed, onClick, disabled }: { collapsed: boolean; onClick: () => void; disabled?: boolean }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-label="New message"
			title="New message (c)"
			className={`btn btn-primary ${collapsed ? "!w-10 !h-9 !px-0 mx-auto" : "w-full justify-between"}`}
		>
			<span className="flex items-center gap-2">
				<PencilSimpleIcon size={16} weight="bold" />
				{!collapsed && "New message"}
			</span>
			{!collapsed && <kbd className="!bg-transparent !border-white/30 !text-current opacity-80">c</kbd>}
		</button>
	);
}

/** A rail section heading ("Queues", "Identity"…); hidden when the rail is collapsed. */
export function NavSection({ label, collapsed, action }: { label: string; collapsed: boolean; action?: ReactNode }) {
	if (collapsed) return <div className="mx-3 my-2.5 h-px bg-kumo-line" />;
	return (
		<div className="nav-section">
			<span>{label}</span>
			{action}
		</div>
	);
}

/** One rail entry. Counts are unread messages. */
export function NavPill({
	to,
	label,
	icon,
	count,
	active,
	collapsed,
	mono,
	tooltip,
}: {
	to: string;
	label: string;
	icon: ReactNode;
	count?: number;
	active: boolean;
	collapsed: boolean;
	/** The label is an address: set it in mono. */
	mono?: boolean;
	/** Full text on hover (for shortened labels). */
	tooltip?: string;
}) {
	const closeSidebar = useUIStore((s) => s.closeSidebar);
	return (
		<Link
			to={to}
			onClick={closeSidebar}
			aria-current={active ? "page" : undefined}
			title={collapsed ? (count ? `${tooltip ?? label} (${count} unread)` : (tooltip ?? label)) : (tooltip ?? (mono ? label : undefined))}
			className={`nav-pill relative ${active ? "active" : ""} ${collapsed ? "collapsed" : ""}`}
		>
			<span className="shrink-0 flex">{icon}</span>
			{!collapsed && <span className={`flex-1 min-w-0 truncate ${mono ? "ops-mono" : ""} ${count ? "text-kumo-default font-semibold" : ""}`}>{label}</span>}
			{!collapsed && !!count && <span className="nav-count">{count > 999 ? "999+" : count}</span>}
			{collapsed && !!count && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-kumo-brand" />}
		</Link>
	);
}

/** Rail entries that open the agent dock on the Agent or MCP view. */
export function AutomationNav({ collapsed }: { collapsed: boolean }) {
	const isLg = useMediaQuery("(min-width: 1024px)");
	const { openAgentDock, isAgentPanelOpen, agentTab } = useUIStore();
	const items = [
		{ tab: "agent" as const, label: "Agent console", icon: <RobotIcon size={18} />, tone: "text-[var(--ops-agent)]" },
		{ tab: "mcp" as const, label: "MCP endpoint", icon: <PlugsIcon size={18} />, tone: "" },
	];
	return (
		<>
			<NavSection label="Automation" collapsed={collapsed} />
			{items.map((it) => {
				const on = isLg && isAgentPanelOpen && agentTab === it.tab;
				return (
					<button
						key={it.tab}
						type="button"
						onClick={() => openAgentDock(it.tab, isLg)}
						aria-pressed={on}
						title={collapsed ? it.label : undefined}
						className={`nav-pill ${on ? "active" : ""} ${collapsed ? "collapsed" : ""}`}
					>
						<span className={`shrink-0 flex ${it.tone}`}>{it.icon}</span>
						{!collapsed && <span className="flex-1 min-w-0 truncate">{it.label}</span>}
					</button>
				);
			})}
		</>
	);
}

/** Which nav entry the URL points at. */
export function useActiveNav(): string | undefined {
	const { pathname, search } = useLocation();
	if (pathname.endsWith("/search")) return new URLSearchParams(search).get("q") === "is:starred" ? "starred" : undefined;
	const m = pathname.match(/\/(?:emails\/)?([^/]+)$/);
	return m?.[1];
}
