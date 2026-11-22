// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { ArchiveIcon, FileIcon, FunnelSimpleIcon, PaperPlaneTiltIcon, PencilSimpleIcon, StarIcon, TrashIcon, TrayIcon } from "@phosphor-icons/react";
import { Link, useLocation } from "react-router";
import { Folders } from "shared/folders";
import { useUIStore } from "~/hooks/useUIStore";

export const NAV_FOLDERS = [
	{ id: Folders.INBOX, label: "Inbox", icon: TrayIcon },
	{ id: Folders.OTHER, label: "Other addresses", icon: FunnelSimpleIcon },
	{ id: "starred", label: "Starred", icon: StarIcon },
	{ id: Folders.SENT, label: "Sent", icon: PaperPlaneTiltIcon },
	{ id: Folders.DRAFT, label: "Drafts", icon: FileIcon },
	{ id: Folders.ARCHIVE, label: "Archive", icon: ArchiveIcon },
	{ id: Folders.TRASH, label: "Trash", icon: TrashIcon },
] as const;

/** Gmail's big "Compose" button (pill; round icon when the rail is collapsed). */
export function ComposePill({ collapsed, onClick, disabled }: { collapsed: boolean; onClick: () => void; disabled?: boolean }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-label="Compose"
			title="Compose"
			className={`flex items-center gap-3 h-14 rounded-2xl border-0 cursor-pointer font-medium text-sm transition-shadow hover:shadow-[0_1px_3px_0_rgba(60,64,67,0.3),0_4px_8px_3px_rgba(60,64,67,0.15)] disabled:opacity-50 ${
				collapsed ? "w-14 justify-center" : "pl-4 pr-6"
			}`}
			style={{ background: "var(--compose-pill)", color: "var(--compose-pill-text)" }}
		>
			<PencilSimpleIcon size={22} />
			{!collapsed && "Compose"}
		</button>
	);
}

/** One left-nav entry: rounded-right pill, bold with a count when it has unread mail. */
export function NavPill({
	to,
	label,
	icon,
	count,
	active,
	collapsed,
}: {
	to: string;
	label: string;
	icon: React.ReactNode;
	count?: number;
	active: boolean;
	collapsed: boolean;
}) {
	const closeSidebar = useUIStore((s) => s.closeSidebar);
	return (
		<Link
			to={to}
			onClick={closeSidebar}
			aria-current={active ? "page" : undefined}
			title={collapsed ? (count ? `${label} (${count})` : label) : undefined}
			className={`nav-pill relative ${active ? "active" : ""} ${collapsed ? "collapsed" : ""} ${count ? "font-bold" : ""}`}
		>
			<span className="shrink-0 flex">{icon}</span>
			{!collapsed && <span className="flex-1 min-w-0 truncate">{label}</span>}
			{!collapsed && !!count && <span className="text-xs">{count.toLocaleString()}</span>}
			{collapsed && !!count && <span className="absolute top-0.5 right-2 h-2 w-2 rounded-full bg-[#d93025]" />}
		</Link>
	);
}

/** Which nav entry the URL points at. */
export function useActiveNav(): string | undefined {
	const { pathname, search } = useLocation();
	if (pathname.endsWith("/search")) return new URLSearchParams(search).get("q") === "is:starred" ? "starred" : undefined;
	const m = pathname.match(/\/(?:emails\/)?([^/]+)$/);
	return m?.[1];
}
