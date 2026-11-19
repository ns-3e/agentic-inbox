// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useKumoToastManager } from "@cloudflare/kumo";
import {
	ArchiveIcon,
	EnvelopeOpenIcon,
	EnvelopeSimpleIcon,
	TrashIcon,
	TrayIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Folders } from "shared/folders";
import { emailHasUnread, type SwipeAction } from "~/components/EmailListRow";
import { useUIStore } from "~/hooks/useUIStore";
import { useDeleteEmail, useMarkThreadRead, useUpdateEmail } from "~/queries/emails";
import { queryKeys } from "~/queries/keys";
import api from "~/services/api";
import type { Email } from "~/types";

/**
 * Gmail-style swipe actions for a list row:
 *  - swipe left: Archive (or "Inbox" in Archive/Trash, Delete in Drafts)
 *  - swipe right: mark read / unread
 *
 * Archive/Inbox move the whole conversation out of the current folder, not
 * just its newest message, so the row really leaves the list.
 */
export function useSwipeActions(
	folder: string,
	mailboxOf: (email: Email) => string | undefined,
) {
	const qc = useQueryClient();
	const toast = useKumoToastManager();
	const updateEmail = useUpdateEmail();
	const markThreadRead = useMarkThreadRead();
	const deleteEmail = useDeleteEmail();
	const { selectedEmailId, closePanel } = useUIStore();

	const moveConversation = useCallback(
		async (email: Email, mailboxId: string, target: string) => {
			try {
				let ids = [email.id];
				if (email.thread_id && (email.thread_count ?? 1) > 1) {
					const thread = (await api.getThread(mailboxId, email.thread_id)) as Email[];
					const inFolder = thread.filter((m) => m.folder_id === folder).map((m) => m.id);
					if (inFolder.length > 0) ids = inFolder;
				}
				await Promise.all(ids.map((id) => api.moveEmail(mailboxId, id, target)));
				toast.add({ title: target === Folders.ARCHIVE ? "Archived" : "Moved to Inbox" });
			} catch (err) {
				toast.add({ title: (err as Error).message || "Could not move email", variant: "error" });
			} finally {
				qc.invalidateQueries({ queryKey: ["emails", mailboxId] });
				qc.invalidateQueries({ queryKey: queryKeys.folders.list(mailboxId) });
				qc.invalidateQueries({ queryKey: queryKeys.unified.all });
			}
		},
		[folder, qc, toast],
	);

	return useCallback(
		(email: Email): { swipeLeft?: SwipeAction; swipeRight?: SwipeAction } => {
			const mailboxId = mailboxOf(email);
			if (!mailboxId) return {};
			const unread = emailHasUnread(email);

			const swipeRight: SwipeAction = {
				label: unread ? "Read" : "Unread",
				icon: unread ? <EnvelopeOpenIcon size={20} /> : <EnvelopeSimpleIcon size={20} />,
				className: "bg-kumo-brand",
				run: (e) => {
					if (unread && e.thread_id && (e.thread_count ?? 1) > 1) {
						markThreadRead.mutate({ mailboxId, threadId: e.thread_id });
					} else {
						updateEmail.mutate({ mailboxId, id: e.id, data: { read: unread } });
					}
				},
			};

			let swipeLeft: SwipeAction;
			if (folder === Folders.DRAFT) {
				swipeLeft = {
					label: "Delete",
					icon: <TrashIcon size={20} />,
					className: "bg-red-600",
					removesRow: true,
					run: (e) => {
						deleteEmail.mutate({ mailboxId, id: e.id });
						if (selectedEmailId === e.id) closePanel();
						toast.add({ title: "Draft deleted" });
					},
				};
			} else if (folder === Folders.ARCHIVE || folder === Folders.TRASH) {
				swipeLeft = {
					label: "Inbox",
					icon: <TrayIcon size={20} />,
					className: "bg-sky-600",
					removesRow: true,
					run: (e) => void moveConversation(e, mailboxId, Folders.INBOX),
				};
			} else {
				swipeLeft = {
					label: "Archive",
					icon: <ArchiveIcon size={20} />,
					className: "bg-emerald-600",
					removesRow: true,
					run: (e) => void moveConversation(e, mailboxId, Folders.ARCHIVE),
				};
			}
			return { swipeLeft, swipeRight };
		},
		[folder, mailboxOf, markThreadRead, updateEmail, deleteEmail, moveConversation, selectedEmailId, closePanel, toast],
	);
}
