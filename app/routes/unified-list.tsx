// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Pagination, Tooltip } from "@cloudflare/kumo";
import { ArrowsClockwiseIcon, TrayIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router";
import { Folders, getFolderDisplayName } from "shared/folders";
import EmailListRow, { emailHasUnread } from "~/components/EmailListRow";
import MailboxSplitView from "~/components/MailboxSplitView";
import { useActiveMailbox } from "~/hooks/useActiveMailbox";
import { useUIStore } from "~/hooks/useUIStore";
import {
	useDeleteEmail,
	useMarkThreadRead,
	useUnifiedEmails,
	useUpdateEmail,
} from "~/queries/emails";
import { queryKeys } from "~/queries/keys";
import type { Email } from "~/types";

const PAGE_SIZE = 50;
const KNOWN_FOLDERS = new Set<string>([
	Folders.INBOX,
	Folders.SENT,
	Folders.DRAFT,
	Folders.ARCHIVE,
	Folders.TRASH,
]);

function ListSkeleton() {
	return (
		<div className="animate-pulse space-y-1 p-2">
			{Array.from({ length: 10 }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 px-3 py-3">
					<div className="w-4 h-4 rounded bg-kumo-fill" />
					<div className="flex-1 space-y-2">
						<div className="flex items-center gap-2">
							<div className="h-3 w-24 rounded bg-kumo-fill" />
							<div className="h-3 flex-1 rounded bg-kumo-fill" />
							<div className="h-3 w-16 rounded bg-kumo-fill" />
						</div>
						<div className="h-2.5 w-3/4 rounded bg-kumo-fill" />
					</div>
				</div>
			))}
		</div>
	);
}

export default function UnifiedListRoute() {
	const { folder: folderParam } = useParams<{ folder: string }>();
	const folder = folderParam || Folders.INBOX;

	const { selectedEmailId, isComposing, selectEmail, closePanel } = useUIStore();
	const { mailboxId: activeMailboxId, mailboxes = [], focusMailbox } = useActiveMailbox();
	const [page, setPage] = useState(1);

	const queryClient = useQueryClient();
	const updateEmail = useUpdateEmail();
	const markThreadRead = useMarkThreadRead();
	const deleteEmail = useDeleteEmail();

	const params = useMemo(
		() => ({ folder, page: String(page), limit: String(PAGE_SIZE) }),
		[folder, page],
	);
	const { data, isFetching, isPending, error } = useUnifiedEmails(params, {
		refetchInterval: 30_000,
	});

	const emails = data?.emails ?? [];
	const totalCount = data?.totalCount ?? 0;
	const failed = data?.failed ?? [];
	const isPanelOpen = selectedEmailId !== null || isComposing;

	// Reset selection + paging when the folder changes.
	const prevFolderRef = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (prevFolderRef.current !== undefined && prevFolderRef.current !== folder) {
			closePanel();
			setPage(1);
		}
		prevFolderRef.current = folder;
	}, [folder, closePanel]);

	if (!KNOWN_FOLDERS.has(folder)) return <Navigate to="/all/inbox" replace />;

	const handleOpen = (email: Email) => {
		const mailboxId = email.mailbox_id;
		if (!mailboxId) return;
		focusMailbox?.(mailboxId);
		selectEmail(email.id);
		if (emailHasUnread(email)) {
			if (email.thread_id && (email.thread_count ?? 1) > 1) {
				markThreadRead.mutate({ mailboxId, threadId: email.thread_id });
			} else {
				updateEmail.mutate({ mailboxId, id: email.id, data: { read: true } });
			}
		}
	};

	const toggleStar = (email: Email) => {
		if (email.mailbox_id)
			updateEmail.mutate({
				mailboxId: email.mailbox_id,
				id: email.id,
				data: { starred: !email.starred },
			});
	};

	const toggleRead = (email: Email) => {
		if (email.mailbox_id)
			updateEmail.mutate({
				mailboxId: email.mailbox_id,
				id: email.id,
				data: { read: !email.read },
			});
	};

	const handleDelete = (email: Email) => {
		if (!email.mailbox_id) return;
		if (!window.confirm("Are you sure you want to delete this email?")) return;
		deleteEmail.mutate({ mailboxId: email.mailbox_id, id: email.id });
		if (selectedEmailId === email.id) closePanel();
	};

	const title = folder === Folders.INBOX ? "All inboxes" : `All ${getFolderDisplayName(folder).toLowerCase()}`;

	return (
		<MailboxSplitView selectedEmailId={selectedEmailId} isComposing={isComposing}>
			<div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-kumo-line shrink-0 md:px-5">
				<h1 className="text-lg font-semibold text-kumo-default truncate">{title}</h1>
				<div className="flex items-center gap-1 shrink-0">
					{totalCount > 0 && (
						<span className="text-sm text-kumo-subtle mr-2 hidden sm:inline">
							{totalCount} conversation{totalCount !== 1 ? "s" : ""}
							{mailboxes.length > 0 && ` · ${mailboxes.length} mailboxes`}
						</span>
					)}
					<Tooltip content={isFetching ? "Refreshing..." : "Refresh"} side="bottom" asChild>
						<Button
							variant="ghost"
							shape="square"
							size="sm"
							icon={<ArrowsClockwiseIcon size={18} className={isFetching ? "animate-spin" : ""} />}
							onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.unified.all })}
							disabled={isFetching}
							aria-label="Refresh"
						/>
					</Tooltip>
				</div>
			</div>

			{failed.length > 0 && (
				<div className="px-3 pt-3">
					<Banner variant="error" text={`Could not load: ${failed.join(", ")}. Other mailboxes are shown.`} />
				</div>
			)}

			<div className="flex-1 overflow-y-auto">
				{error ? (
					<div className="p-4">
						<Banner variant="error" text={(error as Error).message || "Failed to load emails."} />
					</div>
				) : isPending ? (
					<ListSkeleton />
				) : emails.length > 0 ? (
					emails.map((email) => (
						<EmailListRow
							key={`${email.mailbox_id}:${email.id}`}
							email={email}
							mailboxId={email.mailbox_id}
							isSelected={selectedEmailId === email.id && activeMailboxId === email.mailbox_id}
							isPanelOpen={isPanelOpen}
							onOpen={handleOpen}
							onToggleStar={toggleStar}
							onToggleRead={toggleRead}
							onDelete={handleDelete}
						/>
					))
				) : (
					<div className="flex flex-col items-center justify-center py-24 px-6 text-center">
						<TrayIcon size={48} weight="thin" className="text-kumo-subtle mb-4" />
						<h3 className="text-base font-semibold text-kumo-default mb-1.5">Nothing here</h3>
						<p className="text-sm text-kumo-subtle max-w-xs">
							No conversations in {getFolderDisplayName(folder).toLowerCase()} across your mailboxes.
						</p>
					</div>
				)}
			</div>

			{totalCount > PAGE_SIZE && (
				<div className="flex justify-center py-3 border-t border-kumo-line shrink-0">
					<Pagination page={page} setPage={setPage} perPage={PAGE_SIZE} totalCount={totalCount} />
				</div>
			)}
		</MailboxSplitView>
	);
}
