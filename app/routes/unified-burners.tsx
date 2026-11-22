// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Loader } from "@cloudflare/kumo";
import { useSearchParams } from "react-router";
import { useMailboxes } from "~/queries/mailboxes";
import { BurnerManager } from "~/routes/burners";

export function meta() {
	return [{ title: "Burner addresses · Agentic Inbox" }];
}

/**
 * Burner addresses from the All inboxes view. Burners belong to one mailbox,
 * so the page starts with a mailbox chooser (kept in ?mb= so reload and Back
 * keep the choice).
 */
export default function UnifiedBurnersRoute() {
	const { data: mailboxes = [], isPending } = useMailboxes();
	const [params, setParams] = useSearchParams();
	const wanted = params.get("mb");
	const mailboxId = mailboxes.find((m) => m.id === wanted)?.id ?? mailboxes[0]?.id;

	if (isPending) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}
	if (mailboxes.length === 0) {
		return <div className="px-4 py-12 text-center text-sm text-kumo-subtle">Create a mailbox first.</div>;
	}

	const picker =
		mailboxes.length > 1 ? (
			<label className="flex items-center gap-2 mb-6 text-sm">
				<span className="text-kumo-subtle shrink-0">Mailbox</span>
				<select
					value={mailboxId}
					onChange={(e) => setParams({ mb: e.target.value }, { replace: true })}
					className="flex-1 min-w-0 h-10 rounded-lg border border-kumo-line bg-kumo-base px-3 text-kumo-default"
				>
					{mailboxes.map((m) => (
						<option key={m.id} value={m.id}>
							{m.email}
						</option>
					))}
				</select>
			</label>
		) : null;

	return <BurnerManager key={mailboxId} mailboxId={mailboxId} picker={picker} />;
}
