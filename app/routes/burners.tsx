// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Dialog, Loader, Switch, Tooltip, useKumoToastManager } from "@cloudflare/kumo";
import { CopyIcon, FireIcon, MagnifyingGlassIcon, ShuffleIcon, TrashIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { useParams } from "react-router";
import { formatListDate } from "shared/dates";
import { useBurners, useCreateBurner, useDeleteBurner, useUpdateBurner } from "~/queries/burners";
import type { Burner } from "~/types";

async function copy(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

export default function BurnersRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	return <BurnerManager mailboxId={mailboxId} />;
}

/**
 * Registry of one mailbox's burner addresses: create, copy, filter, toggle
 * and delete. `picker` sits in the page header; All mailboxes uses it to
 * choose the mailbox.
 */
export function BurnerManager({ mailboxId, picker }: { mailboxId?: string; picker?: ReactNode }) {
	const toast = useKumoToastManager();
	const { data: burners, isLoading } = useBurners(mailboxId);
	const createMutation = useCreateBurner(mailboxId);
	const updateMutation = useUpdateBurner(mailboxId);
	const deleteMutation = useDeleteBurner(mailboxId);

	const [label, setLabel] = useState("");
	const [localPart, setLocalPart] = useState("");
	const [pendingDelete, setPendingDelete] = useState<Burner | null>(null);
	const domain = mailboxId?.split("@")[1] ?? "";

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const burner = await createMutation.mutateAsync({
				label: label.trim() || undefined,
				localPart: localPart.trim() || undefined,
			});
			setLabel("");
			setLocalPart("");
			const copied = await copy(burner.address);
			toast.add({ title: copied ? `Copied ${burner.address}` : `Created ${burner.address}` });
		} catch (err) {
			toast.add({ title: (err as Error).message || "Could not create burner", variant: "error" });
		}
	};

	const handleToggle = (burner: Burner, enabled: boolean) => {
		updateMutation.mutate(
			{ address: burner.address, enabled },
			{ onError: () => toast.add({ title: "Could not update burner", variant: "error" }) },
		);
	};

	const handleDelete = async () => {
		if (!pendingDelete) return;
		try {
			await deleteMutation.mutateAsync(pendingDelete.address);
			toast.add({ title: `Deleted ${pendingDelete.address}` });
		} catch {
			toast.add({ title: "Could not delete burner", variant: "error" });
		} finally {
			setPendingDelete(null);
		}
	};

	const [filter, setFilter] = useState("");
	const [status, setStatus] = useState<"all" | "active" | "paused">("all");

	const all = burners ?? [];
	const active = all.filter((b) => b.enabled).length;
	const received = all.reduce((n, b) => n + b.receivedCount, 0);
	const blocked = all.reduce((n, b) => n + b.blockedCount, 0);
	const q = filter.trim().toLowerCase();
	const rows = all.filter(
		(b) =>
			(status === "all" || (status === "active" ? b.enabled : !b.enabled)) &&
			(!q || b.address.toLowerCase().includes(q) || b.label.toLowerCase().includes(q)),
	);

	const copyAddress = async (address: string) => {
		if (await copy(address)) toast.add({ title: `Copied ${address}` });
	};

	return (
		<div className="h-full flex flex-col min-h-0 overflow-hidden">
			<header className="page-head flex-wrap">
				<FireIcon size={18} className="hidden sm:block text-kumo-subtle shrink-0" />
				<div className="min-w-0 flex-1 sm:flex-none">
					<h1 className="page-title">Burner addresses</h1>
					<div className="page-meta">
						Throwaway addresses that deliver to <span className="ops-mono text-kumo-strong">{mailboxId}</span>. Turn one off and mail to it bounces.
					</div>
				</div>
				{picker && <div className="ml-auto w-full sm:w-auto">{picker}</div>}
			</header>

			<div className="stat-strip">
				<Stat label="Active" value={active} tone="ok" />
				<Stat label="Paused" value={all.length - active} />
				<Stat label="Received" value={received} />
				<Stat label="Blocked" value={blocked} tone={blocked > 0 ? "bad" : undefined} />
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto">
				{/* Create */}
				<form onSubmit={handleCreate} className="flex flex-col md:flex-row md:items-end gap-3 px-5 py-4 border-b border-kumo-line bg-kumo-tint">
					<label className="flex-1 min-w-0">
						<span className="field-label">Purpose</span>
						<input className="field" placeholder="e.g. Shoe store sign-up" value={label} onChange={(e) => setLabel(e.target.value)} />
					</label>
					<label className="flex-1 min-w-0">
						<span className="field-label">Address (optional)</span>
						<div className="flex items-center rounded-md border border-[var(--ops-line-strong)] bg-kumo-control focus-within:border-kumo-brand overflow-hidden">
							<input
								className="flex-1 min-w-0 h-8 px-2.5 bg-transparent border-0 outline-none ops-mono text-[13px] text-kumo-default placeholder:text-kumo-subtle placeholder:font-sans"
								placeholder="random"
								value={localPart}
								onChange={(e) => setLocalPart(e.target.value)}
								autoCapitalize="off"
								autoCorrect="off"
								spellCheck={false}
								aria-label="Local part of the address"
							/>
							<span className="ops-mono text-[12px] text-kumo-subtle pr-2.5 shrink-0">@{domain}</span>
						</div>
					</label>
					<button type="submit" className="btn btn-primary md:w-auto" disabled={createMutation.isPending}>
						{localPart.trim() ? <FireIcon size={14} weight="bold" /> : <ShuffleIcon size={14} weight="bold" />}
						{createMutation.isPending ? "Creating…" : localPart.trim() ? "Create burner" : "Generate burner"}
					</button>
				</form>

				{/* Filters */}
				{all.length > 0 && (
					<div className="flex items-center gap-2 px-5 py-2.5 border-b border-kumo-line">
						<div className="relative flex-1 max-w-xs">
							<MagnifyingGlassIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-kumo-subtle" />
							<input className="field !pl-8" placeholder="Filter by address or purpose" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter burners" />
						</div>
						<div role="radiogroup" aria-label="Status" className="flex items-center rounded-md border border-[var(--ops-line-strong)] p-0.5">
							{(["all", "active", "paused"] as const).map((v) => (
								<button
									key={v}
									type="button"
									role="radio"
									aria-checked={status === v}
									onClick={() => setStatus(v)}
									className={`h-6 px-2.5 rounded text-xs border-0 cursor-pointer capitalize ${status === v ? "bg-kumo-fill text-kumo-default font-semibold" : "bg-transparent text-kumo-subtle hover:text-kumo-default"}`}
								>
									{v}
								</button>
							))}
						</div>
						<span className="ml-auto ops-mono tabular text-[11px] text-kumo-subtle">
							{rows.length} of {all.length}
						</span>
					</div>
				)}

				{/* Registry */}
				{isLoading ? (
					<div className="flex justify-center py-12">
						<Loader size="lg" />
					</div>
				) : all.length === 0 ? (
					<div className="px-6 py-14 text-center">
						<div className="mx-auto mb-3 h-11 w-11 rounded-lg border border-kumo-line bg-kumo-tint flex items-center justify-center text-kumo-subtle">
							<FireIcon size={22} />
						</div>
						<div className="text-sm font-semibold text-kumo-default">No burner addresses</div>
						<p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-kumo-subtle">
							Generate one above for each sign-up or trial. If a site leaks or sells it, turn that one address off; your real address stays clean.
						</p>
					</div>
				) : rows.length === 0 ? (
					<div className="px-6 py-10 text-center text-[13px] text-kumo-subtle">No burners match this filter.</div>
				) : (
					<>
						{/* Desktop: table */}
						<table className="ops-table hidden md:table">
							<thead>
								<tr>
									<th className="w-[110px]">Status</th>
									<th>Address</th>
									<th>Purpose</th>
									<th className="!text-right">Received</th>
									<th className="!text-right">Blocked</th>
									<th>Last received</th>
									<th>Created</th>
									<th className="w-[84px]"><span className="sr-only">Actions</span></th>
								</tr>
							</thead>
							<tbody>
								{rows.map((b) => (
									<tr key={b.address} className={b.enabled ? "" : "text-kumo-subtle"}>
										<td>
											<div className="flex items-center gap-2">
												<Switch
													checked={b.enabled}
													onCheckedChange={(checked) => handleToggle(b, checked)}
													aria-label={b.enabled ? `Turn off ${b.address}` : `Turn on ${b.address}`}
												/>
												<span className={b.enabled ? "chip chip-ok" : "chip"}>{b.enabled ? "Active" : "Paused"}</span>
											</div>
										</td>
										<td className="max-w-[280px]">
											<span className={`ops-mono text-[12.5px] truncate block ${b.enabled ? "text-kumo-default" : "text-kumo-subtle line-through"}`} title={b.address}>
												{b.address}
											</span>
										</td>
										<td className="max-w-[220px]">
											<span className="truncate block">{b.label || <span className="text-kumo-subtle">—</span>}</span>
										</td>
										<td className="num">{b.receivedCount.toLocaleString()}</td>
										<td className={`num ${b.blockedCount > 0 ? "text-[var(--ops-bad)]" : ""}`}>{b.blockedCount.toLocaleString()}</td>
										<td className="ops-mono tabular text-[11.5px] text-kumo-subtle whitespace-nowrap">{b.lastReceivedAt ? formatListDate(b.lastReceivedAt) : "—"}</td>
										<td className="ops-mono tabular text-[11.5px] text-kumo-subtle whitespace-nowrap">{formatListDate(b.createdAt)}</td>
										<td>
											<div className="flex items-center justify-end gap-0.5">
												<Tooltip content="Copy address" asChild>
													<button type="button" className="icon-btn !h-7 !w-7" aria-label={`Copy ${b.address}`} onClick={() => void copyAddress(b.address)}>
														<CopyIcon size={14} />
													</button>
												</Tooltip>
												<Tooltip content="Delete" asChild>
													<button type="button" className="icon-btn !h-7 !w-7 hover:!text-[var(--ops-bad)]" aria-label={`Delete ${b.address}`} onClick={() => setPendingDelete(b)}>
														<TrashIcon size={14} />
													</button>
												</Tooltip>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>

						{/* Phone: stacked rows */}
						<ul className="md:hidden divide-y divide-kumo-line">
							{rows.map((b) => (
								<li key={b.address} className="flex items-start gap-3 px-4 py-3">
									<Switch
										checked={b.enabled}
										onCheckedChange={(checked) => handleToggle(b, checked)}
										aria-label={b.enabled ? `Turn off ${b.address}` : `Turn on ${b.address}`}
									/>
									<div className="min-w-0 flex-1">
										<button
											type="button"
											onClick={() => void copyAddress(b.address)}
											className={`ops-mono text-[13px] text-left break-all bg-transparent border-0 p-0 cursor-pointer ${b.enabled ? "text-kumo-default" : "text-kumo-subtle line-through"}`}
										>
											{b.address}
										</button>
										{b.label && <div className="text-[13px] text-kumo-strong truncate">{b.label}</div>}
										<div className="mt-0.5 ops-mono tabular text-[11px] text-kumo-subtle">
											{b.receivedCount} received{b.blockedCount > 0 ? ` · ${b.blockedCount} blocked` : ""}
											{b.lastReceivedAt ? ` · last ${formatListDate(b.lastReceivedAt)}` : ""}
										</div>
									</div>
									<button type="button" className="icon-btn" aria-label={`Delete ${b.address}`} onClick={() => setPendingDelete(b)}>
										<TrashIcon size={18} />
									</button>
								</li>
							))}
						</ul>
					</>
				)}
			</div>

			<Dialog.Root open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-2">Delete burner address</Dialog.Title>
					<p className="text-sm text-kumo-subtle mb-4">
						<span className="ops-mono text-kumo-default break-all">{pendingDelete?.address}</span> will stop working and mail to it will be
						dropped. Mail it already received stays in the mailbox. To pause it instead, turn it off.
					</p>
					<div className="flex justify-end gap-2">
						<Dialog.Close render={(props) => <Button {...props} variant="secondary">Cancel</Button>} />
						<Button variant="destructive" onClick={handleDelete} loading={deleteMutation.isPending}>
							Delete address
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" }) {
	return (
		<div className="stat">
			<div className="stat-label">{label}</div>
			<div className={`stat-value ${tone === "ok" ? "text-[var(--ops-ok)]" : tone === "bad" ? "text-[var(--ops-bad)]" : ""}`}>{value.toLocaleString()}</div>
		</div>
	);
}
