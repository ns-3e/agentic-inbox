// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Dialog, Input, Loader, Switch, Tooltip, useKumoToastManager } from "@cloudflare/kumo";
import { CopyIcon, FireIcon, ShuffleIcon, TrashIcon } from "@phosphor-icons/react";
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
 * Create, copy, toggle and delete the burners of one mailbox. `picker` is
 * shown under the intro; All inboxes uses it to choose the mailbox.
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

	const active = burners?.filter((b) => b.enabled).length ?? 0;

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-1">Burner addresses</h1>
			<p className="text-sm text-kumo-subtle mb-6">
				Throwaway addresses that deliver to this inbox. Turn one off and mail to it bounces.
			</p>
			{picker}

			{/* Create */}
			<form onSubmit={handleCreate} className="rounded-lg border border-kumo-line bg-kumo-base p-5 mb-6 space-y-3">
				<Input
					label="What is it for?"
					placeholder="e.g. Shoe store sign-up"
					value={label}
					onChange={(e) => setLabel(e.target.value)}
				/>
				<div>
					<Input
						label="Custom name (optional)"
						placeholder="Leave empty for a random name"
						value={localPart}
						onChange={(e) => setLocalPart(e.target.value)}
						autoCapitalize="off"
						autoCorrect="off"
						spellCheck={false}
					/>
					{localPart.trim() && (
						<p className="text-xs text-kumo-subtle mt-1 break-all">
							{localPart.trim().toLowerCase()}@{domain}
						</p>
					)}
				</div>
				<div className="flex justify-end">
					<Button
						type="submit"
						variant="primary"
						icon={localPart.trim() ? <FireIcon size={16} /> : <ShuffleIcon size={16} />}
						loading={createMutation.isPending}
					>
						{localPart.trim() ? "Create burner" : "Generate burner"}
					</Button>
				</div>
			</form>

			{/* List */}
			{isLoading ? (
				<div className="flex justify-center py-12">
					<Loader size="lg" />
				</div>
			) : !burners?.length ? (
				<div className="text-center py-12 text-sm text-kumo-subtle">
					No burner addresses yet.
				</div>
			) : (
				<>
					<div className="text-xs uppercase tracking-wider font-semibold text-kumo-subtle mb-2 px-1">
						{active} of {burners.length} active
					</div>
					<ul className="rounded-lg border border-kumo-line bg-kumo-base divide-y divide-kumo-line">
						{burners.map((b) => (
							<li key={b.address} className={`flex items-center gap-3 px-4 py-3 ${b.enabled ? "" : "opacity-60"}`}>
								<Switch
									checked={b.enabled}
									onCheckedChange={(checked) => handleToggle(b, checked)}
									aria-label={b.enabled ? `Turn off ${b.address}` : `Turn on ${b.address}`}
								/>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1">
										<span className={`text-sm font-medium truncate ${b.enabled ? "text-kumo-default" : "text-kumo-subtle line-through"}`}>
											{b.address}
										</span>
										<Tooltip content="Copy address" asChild>
											<Button
												variant="ghost"
												shape="square"
												size="xs"
												icon={<CopyIcon size={14} />}
												aria-label={`Copy ${b.address}`}
												onClick={async () => {
													if (await copy(b.address)) toast.add({ title: "Copied" });
												}}
											/>
										</Tooltip>
									</div>
									<div className="text-xs text-kumo-subtle truncate">
										{[
											b.label || null,
											`${b.receivedCount} received`,
											b.blockedCount > 0 ? `${b.blockedCount} blocked` : null,
											b.lastReceivedAt ? `last ${formatListDate(b.lastReceivedAt)}` : null,
										]
											.filter(Boolean)
											.join(" · ")}
									</div>
								</div>
								<Tooltip content="Delete" asChild>
									<Button
										variant="ghost"
										shape="square"
										size="sm"
										icon={<TrashIcon size={16} />}
										aria-label={`Delete ${b.address}`}
										onClick={() => setPendingDelete(b)}
									/>
								</Tooltip>
							</li>
						))}
					</ul>
				</>
			)}

			<Dialog.Root open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-2">Delete burner?</Dialog.Title>
					<p className="text-sm text-kumo-subtle mb-4 break-all">
						{pendingDelete?.address} will stop working and mail to it will be dropped.
						Emails it already received stay in your inbox. To pause it instead, turn it off.
					</p>
					<div className="flex justify-end gap-2">
						<Dialog.Close render={(props) => <Button {...props} variant="secondary">Cancel</Button>} />
						<Button variant="destructive" onClick={handleDelete} loading={deleteMutation.isPending}>
							Delete
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
