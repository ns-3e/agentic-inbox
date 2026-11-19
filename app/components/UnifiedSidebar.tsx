// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button } from "@cloudflare/kumo";
import {
	ArchiveIcon,
	CaretLeftIcon,
	FileIcon,
	PaperPlaneTiltIcon,
	PencilSimpleIcon,
	TrashIcon,
	TrayIcon,
} from "@phosphor-icons/react";
import { NavLink, useNavigate } from "react-router";
import { Folders } from "shared/folders";
import { mailboxHue } from "~/components/EmailListRow";
import { useUIStore } from "~/hooks/useUIStore";
import type { MailboxSummary } from "~/types";

const FOLDER_LINKS = [
	{ id: Folders.INBOX, label: "Inbox", icon: <TrayIcon size={18} /> },
	{ id: Folders.SENT, label: "Sent", icon: <PaperPlaneTiltIcon size={18} /> },
	{ id: Folders.DRAFT, label: "Drafts", icon: <FileIcon size={18} /> },
	{ id: Folders.ARCHIVE, label: "Archive", icon: <ArchiveIcon size={18} /> },
	{ id: Folders.TRASH, label: "Trash", icon: <TrashIcon size={18} /> },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
	`flex items-center gap-3 py-2 px-3 rounded-md text-sm transition-colors no-underline ${
		isActive
			? "bg-kumo-fill font-semibold text-kumo-default"
			: "text-kumo-strong hover:bg-kumo-tint"
	}`;

function unreadIn(summary: MailboxSummary, folderId: string) {
	return summary.folders.find((f) => f.id === folderId)?.unreadCount ?? 0;
}

export default function UnifiedSidebar({
	summaries,
	onCompose,
}: {
	summaries: MailboxSummary[];
	onCompose: () => void;
}) {
	const navigate = useNavigate();
	const closeSidebar = useUIStore((s) => s.closeSidebar);

	const totalUnread = (folderId: string) =>
		summaries.reduce((sum, m) => sum + unreadIn(m, folderId), 0);

	return (
		<aside className="h-full w-64 bg-kumo-recessed flex flex-col shrink-0 border-r border-kumo-line">
			<div className="px-4 pt-4 pb-1">
				<button
					type="button"
					onClick={() => {
						navigate("/");
						closeSidebar();
					}}
					className="flex items-center gap-1.5 text-kumo-subtle text-sm hover:text-kumo-default transition-colors mb-2.5 cursor-pointer bg-transparent border-0 p-0"
				>
					<CaretLeftIcon size={14} />
					<span>Mailboxes</span>
				</button>
				<div className="px-1">
					<div className="text-base font-semibold text-kumo-default truncate">
						All inboxes
					</div>
					<div className="text-sm text-kumo-subtle truncate mt-0.5">
						{summaries.length} mailbox{summaries.length === 1 ? "" : "es"}
					</div>
				</div>
			</div>

			<div className="px-3 py-3">
				<Button
					variant="primary"
					icon={<PencilSimpleIcon size={16} />}
					onClick={onCompose}
					className="w-full"
					disabled={summaries.length === 0}
				>
					Compose
				</Button>
			</div>

			<nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
				{FOLDER_LINKS.map((f) => {
					const unread = f.id === Folders.SENT ? 0 : totalUnread(f.id);
					return (
						<NavLink key={f.id} to={`/all/${f.id}`} onClick={closeSidebar} className={navClass}>
							<span className="shrink-0">{f.icon}</span>
							<span className="truncate flex-1">{f.label}</span>
							{unread > 0 && <Badge variant="secondary">{unread}</Badge>}
						</NavLink>
					);
				})}

				<div className="pt-5">
					<div className="px-3 mb-1.5">
						<span className="text-xs uppercase tracking-wider font-semibold text-kumo-subtle">
							Mailboxes
						</span>
					</div>
					{summaries.map((m) => {
						const unread = unreadIn(m, Folders.INBOX);
						return (
							<NavLink
								key={m.id}
								to={`/mailbox/${encodeURIComponent(m.id)}/emails/inbox`}
								onClick={closeSidebar}
								className={navClass}
								title={m.email}
							>
								<span
									className="h-2.5 w-2.5 rounded-full shrink-0"
									style={{ backgroundColor: `hsl(${mailboxHue(m.id)} 65% 55%)` }}
								/>
								<span className="truncate flex-1">{m.email}</span>
								{unread > 0 && <Badge variant="secondary">{unread}</Badge>}
							</NavLink>
						);
					})}
				</div>
			</nav>
		</aside>
	);
}
