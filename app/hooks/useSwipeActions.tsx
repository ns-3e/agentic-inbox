// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { ArchiveIcon, EnvelopeOpenIcon, EnvelopeSimpleIcon, TrashIcon, TrayIcon } from "@phosphor-icons/react";
import { useCallback } from "react";
import { Folders } from "shared/folders";
import { emailHasUnread, type SwipeAction } from "~/components/EmailListRow";
import type { MailActions } from "~/hooks/useMailActions";
import type { Email } from "~/types";

/**
 * Gmail-style swipe actions for a list row:
 *  - swipe left: Archive (Inbox in Archive/Trash, Delete in Drafts and searches)
 *  - swipe right: mark read / unread
 * Archive and Inbox move the whole conversation, with Undo.
 */
export function useSwipeActions(
	folder: string | undefined,
	mailboxOf: (email: Email) => string | undefined,
	actions: MailActions,
) {
	return useCallback(
		(email: Email): { swipeLeft?: SwipeAction; swipeRight?: SwipeAction } => {
			const mailboxId = mailboxOf(email);
			if (!mailboxId) return {};
			const target = [{ email, mailboxId }];
			const unread = emailHasUnread(email);

			const swipeRight: SwipeAction = {
				label: unread ? "Read" : "Unread",
				icon: unread ? <EnvelopeOpenIcon size={20} /> : <EnvelopeSimpleIcon size={20} />,
				className: "bg-[var(--color-kumo-brand)]",
				run: () => void actions.setRead(target, unread),
			};

			let swipeLeft: SwipeAction;
			if (folder === Folders.DRAFT || folder === Folders.TRASH) {
				swipeLeft = {
					label: folder === Folders.DRAFT ? "Discard" : "Inbox",
					icon: folder === Folders.DRAFT ? <TrashIcon size={20} /> : <TrayIcon size={20} />,
					className: folder === Folders.DRAFT ? "bg-[var(--ops-bad)]" : "bg-[var(--color-kumo-brand)]",
					removesRow: true,
					run: () =>
						folder === Folders.DRAFT
							? void actions.trash(target, folder)
							: void actions.move(target, Folders.INBOX, folder),
				};
			} else if (folder === Folders.ARCHIVE) {
				swipeLeft = {
					label: "Inbox",
					icon: <TrayIcon size={20} />,
					className: "bg-[var(--color-kumo-brand)]",
					removesRow: true,
					run: () => void actions.move(target, Folders.INBOX, folder),
				};
			} else if (folder) {
				swipeLeft = {
					label: "Archive",
					icon: <ArchiveIcon size={20} />,
					className: "bg-[var(--ops-ok)]",
					removesRow: true,
					run: () => void actions.archive(target, folder),
				};
			} else {
				swipeLeft = {
					label: "Delete",
					icon: <TrashIcon size={20} />,
					className: "bg-[var(--ops-bad)]",
					removesRow: true,
					run: () => void actions.trash(target, email.folder_id || undefined),
				};
			}
			return { swipeLeft, swipeRight };
		},
		[folder, mailboxOf, actions],
	);
}
