// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Dialog } from "@cloudflare/kumo";
import { Link } from "react-router";
import BurnerCreateForm from "~/components/BurnerCreateForm";

/**
 * Create a burner from any page. In All mailboxes scope, `mailboxes` lists
 * every mailbox and the form shows a picker; in one mailbox, it is fixed.
 */
export default function NewBurnerDialog({
	open,
	onOpenChange,
	mailboxId,
	mailboxes,
	manageHref,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mailboxId: string | undefined;
	mailboxes?: string[];
	manageHref: string;
}) {
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog size="lg" className="p-6">
				<Dialog.Title className="text-base font-semibold mb-1">New burner address</Dialog.Title>
				<p className="text-[0.8125rem] text-kumo-subtle mb-5">
					Pick a domain, then use a random name or type your own. The new address is copied to the clipboard.
				</p>
				{mailboxId ? (
					<BurnerCreateForm mailboxId={mailboxId} mailboxes={mailboxes} layout="stack" autoFocus onCreated={() => onOpenChange(false)} />
				) : (
					<p className="text-sm text-kumo-subtle">Create a mailbox in the Mailbox directory first. Burner addresses belong to a mailbox.</p>
				)}
				<div className="mt-4 pt-3 border-t border-kumo-line text-[0.75rem]">
					<Link to={manageHref} onClick={() => onOpenChange(false)} className="text-kumo-link no-underline hover:underline">
						Manage all burner addresses
					</Link>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
