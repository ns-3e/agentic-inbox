// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Dialog, Input } from "@cloudflare/kumo";
import { CaretLeftIcon, FireIcon, FolderIcon, PlusIcon, StackIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Folders, SYSTEM_FOLDER_IDS } from "shared/folders";
import { ComposePill, NAV_FOLDERS, NavPill, useActiveNav } from "~/components/NavItems";
import { useUIStore } from "~/hooks/useUIStore";
import { useCreateFolder, useFolders } from "~/queries/folders";
import { useMailbox } from "~/queries/mailboxes";

export default function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const { data: folders = [] } = useFolders(mailboxId);
	const { data: mailbox } = useMailbox(mailboxId);
	const createFolder = useCreateFolder();
	const startCompose = useUIStore((s) => s.startCompose);
	const closeSidebar = useUIStore((s) => s.closeSidebar);
	const active = useActiveNav();
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	const custom = useMemo(() => folders.filter((f) => !(SYSTEM_FOLDER_IDS as readonly string[]).includes(f.id) && f.id !== Folders.SPAM), [folders]);
	const unread = (id: string) => (id === Folders.SENT || id === Folders.TRASH || id === "starred" ? 0 : (folders.find((f) => f.id === id)?.unreadCount ?? 0));
	const base = `/mailbox/${mailboxId}`;
	const name = mailbox?.settings?.fromName || (mailbox?.name && mailbox.name !== mailbox.email ? mailbox.name : "");

	return (
		<aside className="h-full w-full flex flex-col bg-kumo-recessed pt-[env(safe-area-inset-top)] md:pt-0">
			{/* Phone drawer: product name and mailbox */}
			<div className="md:hidden px-5 pt-4 pb-3 border-b border-kumo-line mb-2">
				<div className="text-xl text-kumo-strong">Inbox</div>
				<div className="text-sm text-kumo-subtle truncate mt-0.5">{name ? `${name} · ` : ""}{mailbox?.email || mailboxId}</div>
			</div>

			<div className={`hidden md:block pt-2 pb-4 ${collapsed ? "pl-2" : "pl-2 pr-4"}`}>
				<ComposePill collapsed={collapsed} onClick={() => startCompose()} />
			</div>

			<nav aria-label="Folders" className="flex-1 overflow-y-auto overflow-x-hidden pr-2 md:pr-4 pb-4 space-y-px">
				{NAV_FOLDERS.map(({ id, label, icon: Icon }) => (
					<NavPill
						key={id}
						to={id === "starred" ? `${base}/search?q=is:starred` : `${base}/emails/${id}`}
						label={label}
						icon={<Icon size={20} weight={active === id ? "fill" : "regular"} />}
						count={unread(id)}
						active={active === id}
						collapsed={collapsed}
					/>
				))}

				<NavPill
					to={`${base}/burners`}
					label="Burner addresses"
					icon={<FireIcon size={20} weight={active === "burners" ? "fill" : "regular"} />}
					active={active === "burners"}
					collapsed={collapsed}
				/>

				{!collapsed && (
					<div className="flex items-center justify-between pl-[1.625rem] pr-1 pt-4 pb-1">
						<span className="text-base text-kumo-default">Labels</span>
						<button type="button" className="icon-btn !h-8 !w-8" aria-label="Create new label" title="Create new label" onClick={() => setIsCreateOpen(true)}>
							<PlusIcon size={18} />
						</button>
					</div>
				)}
				{custom.map((f) => (
					<NavPill
						key={f.id}
						to={`${base}/emails/${f.id}`}
						label={f.name}
						icon={<FolderIcon size={20} weight={active === f.id ? "fill" : "regular"} />}
						count={f.unreadCount}
						active={active === f.id}
						collapsed={collapsed}
					/>
				))}

				{!collapsed && (
					<div className="pt-4 mt-3 border-t border-kumo-line space-y-px">
						<Link to="/all/inbox" onClick={closeSidebar} className="nav-pill">
							<StackIcon size={20} />
							<span>All inboxes</span>
						</Link>
						<Link to="/" onClick={closeSidebar} className="nav-pill">
							<CaretLeftIcon size={20} />
							<span>Mailboxes</span>
						</Link>
					</div>
				)}
			</nav>

			<Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-4">New label</Dialog.Title>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							if (!newFolderName.trim() || !mailboxId) return;
							createFolder.mutate({ mailboxId, name: newFolderName.trim() });
							setNewFolderName("");
							setIsCreateOpen(false);
						}}
						className="space-y-4"
					>
						<Input label="Please enter a new label name:" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} required autoFocus />
						<div className="flex justify-end gap-2">
							<Dialog.Close render={(props) => <Button {...props} variant="secondary">Cancel</Button>} />
							<Button type="submit" variant="primary" disabled={!newFolderName.trim()}>
								Create
							</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>
		</aside>
	);
}
