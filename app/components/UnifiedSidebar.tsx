// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { FireIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { Folders } from "shared/folders";
import { mailboxHue, mailboxShortName } from "~/components/EmailListRow";
import { AutomationNav, ComposePill, NAV_FOLDERS, NavPill, NavSection, useActiveNav } from "~/components/NavItems";
import type { MailboxSummary } from "~/types";

function unreadIn(summary: MailboxSummary, folderId: string) {
	return summary.folders.find((f) => f.id === folderId)?.unreadCount ?? 0;
}

export default function UnifiedSidebar({
	summaries,
	onCompose,
	collapsed = false,
}: {
	summaries: MailboxSummary[];
	onCompose: () => void;
	collapsed?: boolean;
}) {
	const active = useActiveNav();
	const total = (id: string) =>
		id === Folders.SENT || id === Folders.TRASH || id === "starred" ? 0 : summaries.reduce((n, m) => n + unreadIn(m, id), 0);

	const totalUnread = summaries.reduce((n, m) => n + unreadIn(m, Folders.INBOX), 0);

	return (
		<aside className="h-full w-full flex flex-col bg-kumo-recessed border-r border-kumo-line pt-[env(safe-area-inset-top)] md:pt-0">
			{!collapsed && (
				<div className="px-4 pt-3 pb-2">
					<div className="text-[11px] font-semibold text-kumo-subtle">Scope</div>
					<div className="text-[13px] font-semibold text-kumo-default">All mailboxes</div>
					<div className="text-xs text-kumo-subtle tabular">
						{summaries.length} mailbox{summaries.length === 1 ? "" : "es"} · {totalUnread.toLocaleString()} unread
					</div>
				</div>
			)}

			<div className={`hidden md:block pt-2 pb-1 ${collapsed ? "px-2" : "px-3"}`}>
				<ComposePill collapsed={collapsed} onClick={onCompose} disabled={summaries.length === 0} />
			</div>

			<nav aria-label="All mailboxes navigation" className="flex-1 overflow-y-auto overflow-x-hidden pb-3 space-y-px">
				<NavSection label="Queues" collapsed={collapsed} />
				{NAV_FOLDERS.map(({ id, label, icon: Icon }) => (
					<NavPill
						key={id}
						to={id === "starred" ? "/all/search?q=is:starred" : `/all/${id}`}
						label={label}
						icon={<Icon size={18} weight={active === id ? "fill" : "regular"} />}
						count={total(id)}
						active={active === id}
						collapsed={collapsed}
					/>
				))}

				<NavSection label="Mailboxes" collapsed={collapsed} />
				{summaries.map((m) => (
					<NavPill
						key={m.id}
						to={`/mailbox/${encodeURIComponent(m.id)}/emails/inbox`}
						label={mailboxShortName(m.email)}
						tooltip={m.email}
						mono
						icon={<span className="dot m-[5px]" style={{ backgroundColor: `hsl(${mailboxHue(m.id)} 60% 48%)` }} />}
						count={unreadIn(m, Folders.INBOX)}
						active={false}
						collapsed={collapsed}
					/>
				))}

				<NavSection label="Identity" collapsed={collapsed} />
				<NavPill
					to="/all/burners"
					label="Burner addresses"
					icon={<FireIcon size={18} weight={active === "burners" ? "fill" : "regular"} />}
					active={active === "burners"}
					collapsed={collapsed}
				/>

				<AutomationNav collapsed={collapsed} />

				<NavSection label="Workspace" collapsed={collapsed} />
				<NavPill to="/" label="Mailbox directory" icon={<SquaresFourIcon size={18} />} active={false} collapsed={collapsed} />
			</nav>
		</aside>
	);
}
