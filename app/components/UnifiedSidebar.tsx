// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { CaretLeftIcon, FireIcon } from "@phosphor-icons/react";
import { Link } from "react-router";
import { Folders } from "shared/folders";
import { mailboxHue } from "~/components/EmailListRow";
import { ComposePill, NAV_FOLDERS, NavPill, useActiveNav } from "~/components/NavItems";
import { useUIStore } from "~/hooks/useUIStore";
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
	const closeSidebar = useUIStore((s) => s.closeSidebar);
	const active = useActiveNav();
	const total = (id: string) =>
		id === Folders.SENT || id === Folders.TRASH || id === "starred" ? 0 : summaries.reduce((n, m) => n + unreadIn(m, id), 0);

	return (
		<aside className="h-full w-full flex flex-col bg-kumo-recessed pt-[env(safe-area-inset-top)] md:pt-0">
			<div className="md:hidden px-5 pt-4 pb-3 border-b border-kumo-line mb-2">
				<div className="text-xl text-kumo-strong">Inbox</div>
				<div className="text-sm text-kumo-subtle mt-0.5">
					All inboxes · {summaries.length} mailbox{summaries.length === 1 ? "" : "es"}
				</div>
			</div>

			<div className={`hidden md:block pt-2 pb-4 ${collapsed ? "pl-2" : "pl-2 pr-4"}`}>
				<ComposePill collapsed={collapsed} onClick={onCompose} disabled={summaries.length === 0} />
			</div>

			<nav aria-label="Folders" className="flex-1 overflow-y-auto overflow-x-hidden pr-2 md:pr-4 pb-4 space-y-px">
				{NAV_FOLDERS.map(({ id, label, icon: Icon }) => (
					<NavPill
						key={id}
						to={id === "starred" ? "/all/search?q=is:starred" : `/all/${id}`}
						label={id === Folders.INBOX ? "All inboxes" : label}
						icon={<Icon size={20} weight={active === id ? "fill" : "regular"} />}
						count={total(id)}
						active={active === id}
						collapsed={collapsed}
					/>
				))}

				<NavPill
					to="/all/burners"
					label="Burner addresses"
					icon={<FireIcon size={20} weight={active === "burners" ? "fill" : "regular"} />}
					active={active === "burners"}
					collapsed={collapsed}
				/>

				{!collapsed && <div className="pl-[1.625rem] pt-4 pb-1 text-base text-kumo-default">Mailboxes</div>}
				{summaries.map((m) => (
					<NavPill
						key={m.id}
						to={`/mailbox/${encodeURIComponent(m.id)}/emails/inbox`}
						label={m.email}
						icon={<span className="h-3 w-3 m-1 rounded-full" style={{ backgroundColor: `hsl(${mailboxHue(m.id)} 65% 50%)` }} />}
						count={unreadIn(m, Folders.INBOX)}
						active={false}
						collapsed={collapsed}
					/>
				))}

				{!collapsed && (
					<div className="pt-4 mt-3 border-t border-kumo-line">
						<Link to="/" onClick={closeSidebar} className="nav-pill">
							<CaretLeftIcon size={20} />
							<span>Mailboxes</span>
						</Link>
					</div>
				)}
			</nav>
		</aside>
	);
}
