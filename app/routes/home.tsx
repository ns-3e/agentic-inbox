// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	Button,
	Dialog,
	Input,
	Loader,
	Select,
	Text,
	useKumoToastManager,
} from "@cloudflare/kumo";
import { ArrowRightIcon, CaretRightIcon, EnvelopeIcon, FireIcon, PaintBrushIcon, PlusIcon, StackIcon, TrashIcon, TrayArrowDownIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Folders } from "shared/folders";
import { mailboxHue, setMailboxOrder } from "~/components/EmailListRow";
import { useBurners } from "~/queries/burners";
import { useCatchAll } from "~/queries/catchall";
import { useUnifiedSummary } from "~/queries/emails";
import { Link as RouterLink } from "react-router";
import api from "~/services/api";
import {
	useCreateMailbox,
	useDeleteMailbox,
	useMailboxes,
} from "~/queries/mailboxes";
import { queryKeys } from "~/queries/keys";

export function meta() {
	return [{ title: "Mailbox directory · Agentic Inbox" }];
}

export default function HomeRoute() {
	const toastManager = useKumoToastManager();
	const { data: mailboxes = [], refetch: refetchMailboxes, isFetched: mailboxesFetched } = useMailboxes();
	const createMailbox = useCreateMailbox();
	const deleteMailbox = useDeleteMailbox();

	const { data: configData } = useQuery({
		queryKey: queryKeys.config,
		queryFn: () => api.getConfig(),
		staleTime: Infinity, // config rarely changes
	});

	const domains = configData?.domains ?? [];
	const emailAddresses = configData?.emailAddresses ?? [];

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newPrefix, setNewPrefix] = useState("");
	const [selectedDomain, setSelectedDomain] = useState("");
	const [newName, setNewName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [mailboxToDelete, setMailboxToDelete] = useState<{
		id: string;
		email: string;
	} | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	// Set default domain when config loads
	useEffect(() => {
		if (domains.length > 0 && !selectedDomain) {
			setSelectedDomain(domains[0]);
		}
	}, [domains, selectedDomain]);

	// Auto-create mailboxes from config (run once when both data sources are ready)
	const autoCreateDone = useRef(false);
	useEffect(() => {
		if (autoCreateDone.current) return;
		if (emailAddresses.length === 0 || !mailboxesFetched) return;
		const existingEmails = new Set(
			mailboxes.map((m) => m.email.toLowerCase()),
		);
		const toCreate = emailAddresses.filter(
			(addr) => !existingEmails.has(addr.toLowerCase()),
		);
		if (toCreate.length === 0) {
			autoCreateDone.current = true;
			return;
		}
		autoCreateDone.current = true;
		let cancelled = false;
		Promise.all(
			toCreate.map((addr) => {
				const localPart = addr.split("@")[0] || addr;
				return api.createMailbox(addr, localPart).catch(() => {});
			}),
		).then(() => { if (!cancelled) refetchMailboxes(); });
		return () => { cancelled = true; };
	}, [emailAddresses, mailboxes, refetchMailboxes]);

	const handleCreate = async (e: FormEvent) => {
		e.preventDefault();
		setCreateError(null);
		if (!newPrefix || !selectedDomain) {
			setCreateError("Enter the address and choose a domain.");
			return;
		}
		const email = `${newPrefix}@${selectedDomain}`;
		const name = newName || newPrefix;
		setIsCreating(true);
		try {
			await createMailbox.mutateAsync({ email, name });
			toastManager.add({ title: `Mailbox ${email} created` });
			setIsCreateOpen(false);
			setNewPrefix("");
			setNewName("");
		} catch (err: unknown) {
			const message = (err instanceof Error ? err.message : null) || "Failed to create mailbox";
			setCreateError(message);
		} finally {
			setIsCreating(false);
		}
	};

	const handleDelete = async () => {
		if (!mailboxToDelete) return;
		setIsDeleting(true);
		try {
			await deleteMailbox.mutateAsync(mailboxToDelete.id);
			toastManager.add({ title: "Mailbox deleted" });
			setIsDeleteOpen(false);
			setMailboxToDelete(null);
		} catch {
			toastManager.add({ title: "Failed to delete mailbox", variant: "error" });
		} finally {
			setIsDeleting(false);
		}
	};

	const isConfigured = emailAddresses.length > 0;
	const accounts = isConfigured
		? emailAddresses.map((addr) => ({
				id: addr,
				email: addr,
				name: addr.split("@")[0] || addr,
			}))
		: mailboxes;

	const isLoading = !configData;
	const { data: summaries = [] } = useUnifiedSummary({ refetchInterval: 30_000 });
	const { data: catchAll = [] } = useCatchAll();
	setMailboxOrder(accounts.map((a) => a.id));

	const unread = (id: string, folder: string) =>
		summaries.find((m) => m.id === id)?.folders.find((f) => f.id === folder)?.unreadCount ?? 0;
	const inboxUnread = accounts.reduce((n, a) => n + unread(a.id, Folders.INBOX), 0);
	const otherUnread = accounts.reduce((n, a) => n + unread(a.id, Folders.OTHER), 0);
	const allDomains = domains.length ? domains : [...new Set(accounts.map((a) => a.email.split("@")[1]).filter(Boolean))];
	const catchAllTarget = (email: string) => catchAll.find((c) => c.mailboxId === email)?.domain;

	const askDelete = (account: { id: string; email: string }) => {
		setMailboxToDelete({ id: account.id, email: account.email });
		setIsDeleteOpen(true);
	};

	return (
		<div className="page-scroll bg-kumo-base pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
			{/* Top bar */}
			<div className="flex items-center gap-2.5 h-12 px-4 border-b border-kumo-line bg-kumo-base">
				<span className="h-6 w-6 rounded-[5px] bg-kumo-brand text-kumo-inverse flex items-center justify-center shrink-0">
					<TrayArrowDownIcon size={15} weight="bold" />
				</span>
				<span className="text-[0.8125rem] font-semibold text-kumo-default">Agentic Inbox</span>
				<CaretRightIcon size={12} className="text-kumo-subtle" />
				<span className="text-[0.8125rem] font-semibold text-kumo-default">Mailbox directory</span>
			</div>

			<header className="page-head flex-wrap">
				<div className="min-w-0">
					<h1 className="page-title">Mailbox directory</h1>
					<div className="page-meta">
						Every mailbox, its queues, burner addresses and catch-all route
						{allDomains.length > 0 && allDomains.length <= 3 && (
							<>
								{" "}on <span className="ops-mono text-kumo-strong">{allDomains.join(", ")}</span>
							</>
						)}
						{allDomains.length > 3 && (
							<>
								{" "}across <span className="text-kumo-strong" title={allDomains.join(", ")}>{allDomains.length} domains</span>
							</>
						)}
					</div>
				</div>
				<div className="ml-auto flex flex-wrap items-center gap-2">
					<RouterLink to="/all/preferences" className="btn btn-ghost no-underline max-sm:!w-11 max-sm:!h-11 max-sm:!px-0" title="Preferences" aria-label="Preferences">
						<PaintBrushIcon size={14} />
						<span className="max-sm:hidden">Preferences</span>
					</RouterLink>
					{accounts.length > 1 && (
						<RouterLink to="/all/inbox" className="btn no-underline">
							<StackIcon size={14} />
							<span className="max-sm:hidden">Open all mailboxes</span>
							<span className="sm:hidden">All mailboxes</span>
						</RouterLink>
					)}
					{!isConfigured && (
						<button type="button" className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>
							<PlusIcon size={14} weight="bold" />
							New mailbox
						</button>
					)}
				</div>
			</header>

			{isLoading ? (
				<div className="flex justify-center py-20">
					<Loader size="lg" />
				</div>
			) : accounts.length > 0 ? (
				<>
					<div className="stat-strip">
						<DirStat label="Mailboxes" value={accounts.length} />
						<DirStat label="Inbox unread" value={inboxUnread} accent={inboxUnread > 0} />
						<DirStat label="Catch-all unread" value={otherUnread} />
						<DirStat label="Domains" value={allDomains.length} />
					</div>

					<section aria-labelledby="dir-mailboxes">
						<h2 id="dir-mailboxes" className="px-5 pt-5 pb-2 text-[0.8125rem] font-semibold text-kumo-default">
							Mailboxes
						</h2>
						{/* Desktop: table */}
						<div className="hidden md:block border-t border-kumo-line">
							<table className="ops-table">
								<thead>
									<tr>
										<th>Mailbox</th>
										<th className="!text-right">Inbox unread</th>
										<th className="!text-right">Catch-all unread</th>
										<th>Burners</th>
										<th>Catch-all route</th>
										<th className="w-[120px]"><span className="sr-only">Actions</span></th>
									</tr>
								</thead>
								<tbody>
									{accounts.map((account) => {
										const route = catchAllTarget(account.email);
										const inbox = unread(account.id, Folders.INBOX);
										return (
											<tr key={account.id}>
												<td>
													<RouterLink to={`/mailbox/${account.id}`} className="flex items-center gap-2.5 no-underline min-w-0 group/link">
														<span className="dot" style={{ backgroundColor: `hsl(${mailboxHue(account.id)} 60% 48%)` }} />
														<span className="min-w-0">
															<span className="block ops-mono text-[0.78125rem] text-kumo-default truncate group-hover/link:text-kumo-link group-hover/link:underline">{account.email}</span>
															{account.name && account.name !== account.email && <span className="block text-[0.6875rem] text-kumo-subtle truncate">{account.name}</span>}
														</span>
													</RouterLink>
												</td>
												<td className={`num ${inbox > 0 ? "font-semibold text-kumo-brand" : "text-kumo-subtle"}`}>{inbox.toLocaleString()}</td>
												<td className="num text-kumo-subtle">{unread(account.id, Folders.OTHER).toLocaleString()}</td>
												<td>
													<BurnerCell mailboxId={account.id} />
												</td>
												<td>
													{route ? (
														<span className="chip chip-accent ops-mono !font-normal">*@{route}</span>
													) : (
														<span className="text-kumo-subtle text-xs">—</span>
													)}
												</td>
												<td>
													<div className="flex items-center justify-end gap-1">
														<RouterLink to={`/mailbox/${account.id}`} className="btn btn-ghost !h-7 !px-2 !text-xs no-underline">
															Open
															<ArrowRightIcon size={12} />
														</RouterLink>
														{!isConfigured && (
															<button type="button" className="icon-btn !h-7 !w-7 hover:!text-[var(--ops-bad)]" aria-label={`Delete mailbox ${account.email}`} title="Delete mailbox" onClick={() => askDelete(account)}>
																<TrashIcon size={14} />
															</button>
														)}
													</div>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
						{/* Phone: stacked rows */}
						<ul className="md:hidden border-t border-kumo-line divide-y divide-kumo-line">
							{accounts.map((account) => {
								const inbox = unread(account.id, Folders.INBOX);
								const route = catchAllTarget(account.email);
								return (
									<li key={account.id} className="flex items-center">
										<RouterLink to={`/mailbox/${account.id}`} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 no-underline active:bg-kumo-tint">
											<span className="dot" style={{ backgroundColor: `hsl(${mailboxHue(account.id)} 60% 48%)` }} />
											<span className="min-w-0 flex-1">
												<span className="block ops-mono text-[0.8125rem] text-kumo-default truncate">{account.email}</span>
												<span className="block text-xs text-kumo-subtle truncate">
													{route ? `Collects *@${route}` : account.name !== account.email ? account.name : "Mailbox"}
												</span>
											</span>
											{inbox > 0 && <span className="nav-count !bg-kumo-brand !text-kumo-inverse">{inbox}</span>}
											<CaretRightIcon size={14} className="text-kumo-subtle" />
										</RouterLink>
										{!isConfigured && (
											<button type="button" className="icon-btn mr-1" aria-label={`Delete mailbox ${account.email}`} onClick={() => askDelete(account)}>
												<TrashIcon size={18} />
											</button>
										)}
									</li>
								);
							})}
						</ul>
					</section>

					{catchAll.length > 0 && (
						<section aria-labelledby="dir-routing" className="pb-10">
							<h2 id="dir-routing" className="px-5 pt-6 pb-1 text-[0.8125rem] font-semibold text-kumo-default">
								Domain routing
							</h2>
							<p className="px-5 pb-2 text-xs text-kumo-subtle max-w-2xl">
								Where mail to an unknown address on each domain goes. Change a route in the collecting mailbox's Routing &amp; settings.
							</p>
							<div className="border-t border-kumo-line overflow-x-auto">
								<table className="ops-table">
									<thead>
										<tr>
											<th>Domain</th>
											<th>Unknown addresses go to</th>
											<th className="!text-right">Mailboxes</th>
											<th>Source</th>
										</tr>
									</thead>
									<tbody>
										{catchAll.map((c) => (
											<tr key={c.domain}>
												<td className="ops-mono text-[0.78125rem]">@{c.domain}</td>
												<td>
													{c.mailboxId ? (
														<RouterLink to={`/mailbox/${encodeURIComponent(c.mailboxId)}/settings`} className="inline-flex items-center gap-1.5 ops-mono text-[0.78125rem] text-kumo-default no-underline hover:text-kumo-link hover:underline">
															{c.mailboxId}
															<span className="font-sans text-kumo-subtle">/ Other addresses</span>
														</RouterLink>
													) : (
														<span className="chip chip-bad">Rejected</span>
													)}
												</td>
												<td className="num">{c.mailboxes.length}</td>
												<td>{c.configured ? <span className="chip chip-ok">Configured</span> : <span className="chip">Default</span>}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</section>
					)}
				</>
			) : (
				<div className="px-6 py-20">
					<div className="flex flex-col items-center text-center">
						<div className="mb-3 h-11 w-11 rounded-lg border border-kumo-line bg-kumo-tint flex items-center justify-center text-kumo-subtle">
							<EnvelopeIcon size={22} />
						</div>
						<h3 className="text-sm font-semibold text-kumo-default mb-1">No mailboxes yet</h3>
						<p className="text-[0.8125rem] leading-relaxed text-kumo-subtle max-w-sm mb-5">
							{isConfigured
								? "Email routing is configured. The mailboxes are being created and will appear here."
								: "Create a mailbox for an address on your domain. Each mailbox gets its own storage, agent, burner addresses and queues."}
						</p>
						{!isConfigured && (
							<button type="button" className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>
								<PlusIcon size={14} weight="bold" />
								Create mailbox
							</button>
						)}
					</div>
				</div>
			)}

			{/* Create Dialog */}
			<Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-5">
						Create New Mailbox
					</Dialog.Title>
					<form onSubmit={handleCreate} className="space-y-4">
						{createError && (
							<Text variant="error" size="sm">
								{createError}
							</Text>
						)}
						<div>
							<span className="text-sm font-medium text-kumo-default mb-1.5 block">
								Address
							</span>
							<div className="flex items-center gap-2">
								<div className="flex-1">
									<Input
										aria-label="Address prefix"
										placeholder="info"
										size="sm"
										value={newPrefix}
										onChange={(e) => setNewPrefix(e.target.value)}
										required
									/>
								</div>
								<span className="text-sm text-kumo-subtle">@</span>
								{domains.length > 1 ? (
									<div className="flex-1">
							<Select
								aria-label="Domain"
								value={selectedDomain}
								onValueChange={(value) => {
									if (value) setSelectedDomain(value);
								}}
							>
											{domains.map((d) => (
												<Select.Option key={d} value={d}>
													{d}
												</Select.Option>
											))}
										</Select>
									</div>
								) : (
									<span className="text-sm text-kumo-subtle">
										{selectedDomain || "no domain"}
									</span>
								)}
							</div>
						</div>
						<Input
							label="Display name (optional)"
							placeholder="Info"
							size="sm"
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
						/>
						<div className="flex justify-end gap-2 pt-2">
							<Dialog.Close
								render={(props) => (
									<Button {...props} variant="secondary" size="sm">
										Cancel
									</Button>
								)}
							/>
							<Button
								type="submit"
								variant="primary"
								size="sm"
								loading={isCreating}
								disabled={!selectedDomain}
							>
								Create
							</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>

			{/* Delete Dialog */}
			<Dialog.Root
				open={isDeleteOpen}
				onOpenChange={(open) => {
					setIsDeleteOpen(open);
					if (!open) setMailboxToDelete(null);
				}}
			>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-2">
						Delete Mailbox
					</Dialog.Title>
					<Dialog.Description className="text-kumo-subtle text-sm mb-5">
						Are you sure you want to delete{" "}
						<strong className="text-kumo-default">
							{mailboxToDelete?.email}
						</strong>
						? This action cannot be undone.
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<Dialog.Close
							render={(props) => (
								<Button {...props} variant="secondary" size="sm">
									Cancel
								</Button>
							)}
						/>
						<Button
							variant="destructive"
							size="sm"
							loading={isDeleting}
							onClick={handleDelete}
						>
							Delete
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}

function DirStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
	return (
		<div className="stat">
			<div className="stat-label">{label}</div>
			<div className={`stat-value ${accent ? "text-kumo-brand" : ""}`}>{value.toLocaleString()}</div>
		</div>
	);
}

/** Active / total burner addresses of one mailbox. */
function BurnerCell({ mailboxId }: { mailboxId: string }) {
	const { data } = useBurners(mailboxId);
	if (!data) return <span className="text-xs text-kumo-subtle">…</span>;
	const active = data.filter((b) => b.enabled).length;
	return (
		<RouterLink to={`/mailbox/${encodeURIComponent(mailboxId)}/burners`} className="inline-flex items-center gap-1.5 no-underline text-xs text-kumo-strong hover:text-kumo-link">
			<FireIcon size={13} className="text-kumo-subtle" />
			<span className="ops-mono tabular">
				{active}
				<span className="text-kumo-subtle">/{data.length}</span>
			</span>
			<span className="text-kumo-subtle">active</span>
		</RouterLink>
	);
}
