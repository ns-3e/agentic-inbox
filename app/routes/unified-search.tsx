// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Loader, Pagination, Tooltip } from "@cloudflare/kumo";
import { ArrowLeftIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import MailboxSplitView from "~/components/MailboxSplitView";
import SearchResultRow from "~/components/SearchResultRow";
import { useActiveMailbox } from "~/hooks/useActiveMailbox";
import { useUIStore } from "~/hooks/useUIStore";
import { useUpdateEmail } from "~/queries/emails";
import { SEARCH_PAGE_SIZE, useUnifiedSearch } from "~/queries/search";
import type { Email } from "~/types";

export function meta() {
	return [{ title: "Search all mailboxes · Agentic Inbox" }];
}

export default function UnifiedSearchRoute() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const urlQuery = searchParams.get("q") || "";
	const { selectedEmailId, isComposing, selectEmail, closePanel } = useUIStore();
	const { mailboxId: activeMailboxId, focusMailbox } = useActiveMailbox();
	const updateEmail = useUpdateEmail();
	const [page, setPage] = useState(1);

	// New query: back to page 1 and close the reader.
	const prevQueryRef = useRef(urlQuery);
	const queryChanged = prevQueryRef.current !== urlQuery;
	const currentPage = queryChanged ? 1 : page;
	useEffect(() => {
		if (!queryChanged) return;
		prevQueryRef.current = urlQuery;
		setPage(1);
		closePanel();
	}, [queryChanged, urlQuery, closePanel]);

	const { data, isPending, isFetching, error } = useUnifiedSearch(urlQuery, currentPage);
	const results = data?.emails ?? [];
	const totalCount = data?.totalCount ?? 0;
	const failed = data?.failed ?? [];
	const mailboxCount = data?.mailboxes?.length ?? 0;
	const isPanelOpen = selectedEmailId !== null || isComposing;
	const isLoading = !!urlQuery && isPending;

	const handleOpen = (email: Email) => {
		const mailboxId = email.mailbox_id;
		if (!mailboxId) return;
		focusMailbox?.(mailboxId);
		selectEmail(email.id);
		if (!email.read) updateEmail.mutate({ mailboxId, id: email.id, data: { read: true } });
	};

	return (
		<MailboxSplitView selectedEmailId={selectedEmailId} isComposing={isComposing}>
			<div className="flex items-center gap-2 px-4 py-3.5 border-b border-kumo-line shrink-0 md:px-5">
				<Tooltip content="Back to all inboxes" side="bottom" asChild>
					<Button variant="ghost" shape="square" size="sm" icon={<ArrowLeftIcon size={18} />} onClick={() => navigate("/all/inbox")} aria-label="Back to all inboxes" />
				</Tooltip>
				<div className="min-w-0 flex-1">
					<h1 className="text-lg font-semibold text-kumo-default truncate">Search all mailboxes</h1>
					{!isLoading && urlQuery && (
						<span className="text-sm text-kumo-subtle">
							{totalCount} result{totalCount !== 1 ? "s" : ""} for "{urlQuery}"
							{mailboxCount > 0 && ` across ${mailboxCount} mailboxes`}
						</span>
					)}
				</div>
				{isFetching && !isLoading && <Loader size="sm" />}
			</div>

			{failed.length > 0 && (
				<div className="px-3 pt-3">
					<Banner variant="error" text={`Could not search: ${failed.join(", ")}. Results from other mailboxes are shown.`} />
				</div>
			)}

			<div className="flex-1 overflow-y-auto">
				{error ? (
					<div className="p-4">
						<Banner variant="error" text={(error as Error).message || "Search failed."} />
					</div>
				) : isLoading ? (
					<div className="flex justify-center py-16"><Loader size="lg" /></div>
				) : results.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 px-6 text-center">
						<div className="mb-4"><MagnifyingGlassIcon size={48} weight="thin" className="text-kumo-subtle" /></div>
						<h3 className="text-base font-semibold text-kumo-default mb-1.5">No results found</h3>
						<p className="text-sm text-kumo-subtle max-w-xs">
							{urlQuery
								? `Nothing matched "${urlQuery}" in any mailbox. Try different keywords.`
								: "Enter a search term to search every mailbox by subject, sender, or content."}
						</p>
						<p className="text-xs text-kumo-subtle mt-3 max-w-sm">
							Tip: Use operators like <code className="bg-kumo-tint px-1 rounded">from:name</code>, <code className="bg-kumo-tint px-1 rounded">in:sent</code>, <code className="bg-kumo-tint px-1 rounded">is:unread</code>, <code className="bg-kumo-tint px-1 rounded">has:attachment</code>
						</p>
					</div>
				) : (
					results.map((email) => (
						<SearchResultRow
							key={`${email.mailbox_id}:${email.id}`}
							email={email}
							query={urlQuery}
							mailboxId={email.mailbox_id}
							isSelected={selectedEmailId === email.id && activeMailboxId === email.mailbox_id}
							isPanelOpen={isPanelOpen}
							onOpen={handleOpen}
						/>
					))
				)}
			</div>

			{totalCount > SEARCH_PAGE_SIZE && (
				<div className="flex justify-center py-3 border-t border-kumo-line shrink-0">
					<Pagination page={currentPage} setPage={setPage} perPage={SEARCH_PAGE_SIZE} totalCount={totalCount} />
				</div>
			)}
		</MailboxSplitView>
	);
}
