// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Dialog, Input } from "@cloudflare/kumo";
import { FireIcon, GearSixIcon, PaintBrushIcon, PlusIcon, SquaresFourIcon, StackIcon, TagIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { Folders, SYSTEM_FOLDER_IDS } from "shared/folders";
import { AutomationNav, ComposePill, NAV_FOLDERS, NavPill, NavSection, useActiveNav } from "~/components/NavItems";
import { useUIStore } from "~/hooks/useUIStore";
import { useCreateFolder, useFolders } from "~/queries/folders";
import { useMailbox } from "~/queries/mailboxes";

export default function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const { data: folders = [] } = useFolders(mailboxId);
	const { data: mailbox } = useMailbox(mailboxId);
	const createFolder = useCreateFolder();
	const startCompose = useUIStore((s) => s.startCompose);
	const active = useActiveNav();
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	const custom = useMemo(() => folders.filter((f) => !(SYSTEM_FOLDER_IDS as readonly string[]).includes(f.id) && f.id !== Folders.SPAM), [folders]);
	const unread = (id: string) => (id === Folders.SENT || id === Folders.TRASH || id === "starred" ? 0 : (folders.find((f) => f.id === id)?.unreadCount ?? 0));
	const base = `/mailbox/${mailboxId}`;
	const name = mailbox?.settings?.fromName || (mailbox?.name && mailbox.name !== mailbox.email ? mailbox.name : "");
	const address = mailbox?.email || mailboxId || "";

	return (
		<aside className="h-full w-full flex flex-col bg-kumo-recessed border-r border-kumo-line pt-[env(safe-area-inset-top)] md:pt-0">
			{/* Scope: the mailbox this rail controls */}
			{!collapsed && (
				<div className="px-4 pt-3 pb-2 md:pt-3">
					<div className="text-[0.6875rem] font-semibold text-kumo-subtle">Mailbox</div>
					<div className="ops-mono text-[0.8125rem] text-kumo-default truncate" title={address}>{address}</div>
					{name && <div className="text-xs text-kumo-subtle truncate">{name}</div>}
				</div>
			)}

			<div className={`hidden md:block pt-2 pb-1 ${collapsed ? "px-2" : "px-3"}`}>
				<ComposePill collapsed={collapsed} onClick={() => startCompose()} />
			</div>

			<nav aria-label="Mailbox navigation" className="flex-1 overflow-y-auto overflow-x-hidden pb-3 space-y-px">
				<NavSection label="Queues" collapsed={collapsed} />
				{NAV_FOLDERS.map(({ id, label, icon: Icon }) => (
					<NavPill
						key={id}
						to={id === "starred" ? `${base}/search?q=is:starred` : `${base}/emails/${id}`}
						label={label}
						icon={<Icon size={18} weight={active === id ? "fill" : "regular"} />}
						count={unread(id)}
						active={active === id}
						collapsed={collapsed}
					/>
				))}

				<NavSection
					label="Labels"
					collapsed={collapsed}
					action={
						<button type="button" className="icon-btn !h-6 !w-6" aria-label="Create label" title="Create label" onClick={() => setIsCreateOpen(true)}>
							<PlusIcon size={14} weight="bold" />
						</button>
					}
				/>
				{!collapsed && custom.length === 0 && <div className="px-[1.125rem] py-1 text-xs text-kumo-subtle">No labels</div>}
				{custom.map((f) => (
					<NavPill
						key={f.id}
						to={`${base}/emails/${f.id}`}
						label={f.name}
						icon={<TagIcon size={18} weight={active === f.id ? "fill" : "regular"} />}
						count={f.unreadCount}
						active={active === f.id}
						collapsed={collapsed}
					/>
				))}

				<NavSection label="Identity" collapsed={collapsed} />
				<NavPill
					to={`${base}/burners`}
					label="Burner addresses"
					icon={<FireIcon size={18} weight={active === "burners" ? "fill" : "regular"} />}
					active={active === "burners"}
					collapsed={collapsed}
				/>
				<NavPill
					to={`${base}/settings`}
					label="Routing & settings"
					icon={<GearSixIcon size={18} weight={active === "settings" ? "fill" : "regular"} />}
					active={active === "settings"}
					collapsed={collapsed}
				/>

				<AutomationNav collapsed={collapsed} />

				<NavSection label="Workspace" collapsed={collapsed} />
				<NavPill to="/all/inbox" label="All mailboxes" icon={<StackIcon size={18} />} active={false} collapsed={collapsed} />
				<NavPill
					to={`${base}/preferences`}
					label="Preferences"
					icon={<PaintBrushIcon size={18} weight={active === "preferences" ? "fill" : "regular"} />}
					active={active === "preferences"}
					collapsed={collapsed}
				/>
				<NavPill to="/" label="Mailbox directory" icon={<SquaresFourIcon size={18} />} active={false} collapsed={collapsed} />
			</nav>

			<Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-4">Create label</Dialog.Title>
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
						<Input label="Label name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} required autoFocus />
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
