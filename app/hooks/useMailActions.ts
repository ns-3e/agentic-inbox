// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { Folders, getFolderDisplayName } from "shared/folders";
import { emailHasUnread } from "~/components/EmailListRow";
import { useListNav } from "~/hooks/useListNav";
import { getPreferences } from "~/hooks/usePreferences";
import { snackbar } from "~/hooks/useSnackbar";
import { rowKey, useUIStore } from "~/hooks/useUIStore";
import { queryKeys } from "~/queries/keys";
import api from "~/services/api";
import type { Email } from "~/types";

/** A conversation row (or single message) and the mailbox it lives in. */
export interface MailTarget {
	email: Email;
	mailboxId: string;
}

type EmailList = { emails: Email[]; totalCount: number };

function isListKey(key: readonly unknown[]) {
	return (
		(key[0] === "emails" && typeof key[2] === "object" && key[2] !== null) ||
		(key[0] === "unified" && (key[1] === "emails" || key[1] === "search")) ||
		key[0] === "search"
	);
}

/** Patch every cached list so the change shows at once (server refetch follows). */
function patchLists(qc: QueryClient, targets: MailTarget[], fn: (e: Email) => Email | null) {
	const keys = new Set(targets.map((t) => `${t.mailboxId}:${t.email.id}`));
	for (const [key, data] of qc.getQueriesData<EmailList & { results?: Email[]; pages?: EmailList[] }>({ predicate: (q) => isListKey(q.queryKey) })) {
		if (!data) continue;
		const mailboxOfKey = key[0] === "emails" || key[0] === "search" ? (key[1] as string) : undefined;
		const apply = (list: Email[]) => {
			let removed = 0;
			const next: Email[] = [];
			for (const e of list) {
				const k = `${e.mailbox_id ?? mailboxOfKey}:${e.id}`;
				if (!keys.has(k)) {
					next.push(e);
					continue;
				}
				const patched = fn(e);
				if (patched) next.push(patched);
				else removed++;
			}
			return { next, removed };
		};
		if (Array.isArray(data.pages)) {
			let removedTotal = 0;
			const pages = data.pages.map((p) => {
				const { next, removed } = apply(p.emails ?? []);
				removedTotal += removed;
				return { ...p, emails: next };
			});
			qc.setQueryData(key, {
				...data,
				pages: pages.map((p) => ({ ...p, totalCount: Math.max(0, (p.totalCount ?? 0) - removedTotal) })),
			});
		} else if (Array.isArray(data.emails)) {
			const { next, removed } = apply(data.emails);
			qc.setQueryData(key, { ...data, emails: next, totalCount: Math.max(0, (data.totalCount ?? 0) - removed) });
		} else if (Array.isArray(data.results)) {
			const { next, removed } = apply(data.results);
			qc.setQueryData(key, { ...data, results: next, totalCount: Math.max(0, (data.totalCount ?? 0) - removed) });
		}
	}
}

function invalidateAll(qc: QueryClient, mailboxIds: Iterable<string>) {
	for (const id of new Set(mailboxIds)) {
		qc.invalidateQueries({ queryKey: ["emails", id] });
		qc.invalidateQueries({ queryKey: queryKeys.folders.list(id) });
		qc.invalidateQueries({ queryKey: ["search", id] });
	}
	qc.invalidateQueries({ queryKey: queryKeys.unified.all });
}

/** Message ids of a conversation that are in `folder` (all of them when folder is unknown). */
async function conversationIds(t: MailTarget, folder?: string): Promise<{ id: string; folder: string }[]> {
	const own = [{ id: t.email.id, folder: t.email.folder_id || folder || Folders.INBOX }];
	if (!t.email.thread_id || (t.email.thread_count ?? 1) <= 1) return own;
	try {
		const thread = await api.getThread(t.mailboxId, t.email.thread_id);
		const inFolder = thread.filter((m) =>
			folder ? m.folder_id === folder : m.folder_id !== Folders.SENT && m.folder_id !== Folders.DRAFT,
		);
		return inFolder.length ? inFolder.map((m) => ({ id: m.id, folder: m.folder_id || Folders.INBOX })) : own;
	} catch {
		return own;
	}
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? `Conversation ${one}` : `${n} conversations ${many}`);

/**
 * Gmail-style actions on conversations, shared by the list (hover, bulk,
 * swipe), the reader toolbar and keyboard shortcuts. Moves show at once,
 * and archive / delete / move offer Undo.
 */
/**
 * The conversation to show after the open one is archived or deleted:
 * the next older or newer one in the visible list, skipping the ones that
 * are being removed. Null means "go back to the list".
 */
export function nextAfterRemoval(
	openId: string,
	removed: MailTarget[],
	mode: "list" | "older" | "newer",
	items: MailTarget[] = useListNav.getState().items,
): MailTarget | null {
	if (mode === "list") return null;
	const gone = new Set(removed.map((t) => rowKey(t.email)));
	const idx = items.findIndex((t) => t.email.id === openId);
	if (idx < 0) return null;
	const step = mode === "older" ? 1 : -1;
	for (let i = idx + step; i >= 0 && i < items.length; i += step) {
		if (!gone.has(rowKey(items[i].email))) return items[i];
	}
	return null;
}

export function useMailActions() {
	const qc = useQueryClient();

	const leaveReaderIfOpen = useCallback((targets: MailTarget[]) => {
		const { selectedEmailId, closePanel, selectEmail, checked, setChecked } = useUIStore.getState();
		if (selectedEmailId && targets.some((t) => t.email.id === selectedEmailId)) {
			// Preferences → After archive or delete: back to the list, or open the next conversation.
			const next = nextAfterRemoval(selectedEmailId, targets, getPreferences().afterAction);
			if (next) selectEmail(next.email.id, next.mailboxId);
			else closePanel();
		}
		if (checked.size) {
			const gone = new Set(targets.map((t) => rowKey(t.email)));
			setChecked([...checked].filter((k) => !gone.has(k)));
		}
	}, []);

	/** Move whole conversations from `fromFolder` to `toFolder`, with Undo. */
	const move = useCallback(
		async (targets: MailTarget[], toFolder: string, fromFolder?: string, label?: string) => {
			if (!targets.length) return;
			leaveReaderIfOpen(targets);
			patchLists(qc, targets, () => null);
			const moved: { mailboxId: string; id: string; folder: string }[] = [];
			try {
				const groups = await Promise.all(targets.map(async (t) => ({ t, ids: await conversationIds(t, fromFolder) })));
				await Promise.all(
					groups.flatMap(({ t, ids }) =>
						ids.map(async ({ id, folder }) => {
							await api.moveEmail(t.mailboxId, id, toFolder);
							moved.push({ mailboxId: t.mailboxId, id, folder });
						}),
					),
				);
				const n = targets.length;
				const msg =
					label ??
					(toFolder === Folders.ARCHIVE
						? plural(n, "archived")
						: toFolder === Folders.TRASH
							? plural(n, "moved to Trash")
							: toFolder === Folders.INBOX
								? plural(n, "moved to Inbox")
								: plural(n, `moved to ${getFolderDisplayName(toFolder)}`));
				snackbar.show({
					message: msg,
					actionLabel: "Undo",
					onAction: async () => {
						await Promise.all(moved.map((m) => api.moveEmail(m.mailboxId, m.id, m.folder).catch(() => {})));
						invalidateAll(qc, moved.map((m) => m.mailboxId));
						snackbar.show({ message: "Action undone" });
					},
				});
			} catch (err) {
				snackbar.error((err as Error).message || "Could not move the conversation");
			} finally {
				invalidateAll(qc, targets.map((t) => t.mailboxId));
			}
		},
		[qc, leaveReaderIfOpen],
	);

	const archive = useCallback(
		(targets: MailTarget[], fromFolder?: string) => move(targets, Folders.ARCHIVE, fromFolder),
		[move],
	);

	/** Permanently delete (Trash and Drafts) after a confirmation. */
	const deleteForever = useCallback(
		async (targets: MailTarget[], what = "conversation") => {
			if (!targets.length) return;
			const n = targets.length;
			if (!window.confirm(n === 1 ? `Delete this ${what} forever? This cannot be undone.` : `Delete ${n} ${what}s forever? This cannot be undone.`))
				return;
			leaveReaderIfOpen(targets);
			patchLists(qc, targets, () => null);
			try {
				await Promise.all(
					targets.map(async (t) => {
						const ids = what === "draft" ? [{ id: t.email.id }] : await conversationIds(t, t.email.folder_id || undefined);
						await Promise.all(ids.map(({ id }) => api.deleteEmail(t.mailboxId, id)));
					}),
				);
				snackbar.show({ message: n === 1 ? `${what[0].toUpperCase()}${what.slice(1)} deleted forever` : `${n} ${what}s deleted forever` });
			} catch (err) {
				snackbar.error((err as Error).message || "Could not delete");
			} finally {
				invalidateAll(qc, targets.map((t) => t.mailboxId));
			}
		},
		[qc, leaveReaderIfOpen],
	);

	/** Delete: to Trash with Undo; from Trash, forever (asks first). Drafts are discarded. */
	const trash = useCallback(
		async (targets: MailTarget[], fromFolder?: string) => {
			if (fromFolder === Folders.TRASH) return deleteForever(targets);
			if (fromFolder === Folders.DRAFT) {
				leaveReaderIfOpen(targets);
				patchLists(qc, targets, () => null);
				await Promise.all(targets.map((t) => api.deleteEmail(t.mailboxId, t.email.id).catch(() => {})));
				invalidateAll(qc, targets.map((t) => t.mailboxId));
				snackbar.show({ message: targets.length === 1 ? "Draft discarded" : `${targets.length} drafts discarded` });
				return;
			}
			return move(targets, Folders.TRASH, fromFolder);
		},
		[move, deleteForever, leaveReaderIfOpen, qc],
	);

	const setRead = useCallback(
		async (targets: MailTarget[], read: boolean) => {
			patchLists(qc, targets, (e) => ({ ...e, read, thread_unread_count: read ? 0 : Math.max(1, e.thread_unread_count ?? 1) }));
			try {
				await Promise.all(
					targets.map((t) =>
						read && t.email.thread_id && (t.email.thread_count ?? 1) > 1
							? api.markThreadRead(t.mailboxId, t.email.thread_id)
							: api.updateEmail(t.mailboxId, t.email.id, { read }),
					),
				);
			} catch (err) {
				snackbar.error((err as Error).message || "Could not update");
			} finally {
				invalidateAll(qc, targets.map((t) => t.mailboxId));
			}
		},
		[qc],
	);

	const setStarred = useCallback(
		async (targets: MailTarget[], starred: boolean) => {
			patchLists(qc, targets, (e) => ({ ...e, starred }));
			for (const t of targets) {
				const key = queryKeys.emails.detail(t.mailboxId, t.email.id);
				const prev = qc.getQueryData<Email>(key);
				if (prev) qc.setQueryData(key, { ...prev, starred });
			}
			try {
				await Promise.all(targets.map((t) => api.updateEmail(t.mailboxId, t.email.id, { starred })));
			} catch (err) {
				snackbar.error((err as Error).message || "Could not update");
			} finally {
				invalidateAll(qc, targets.map((t) => t.mailboxId));
			}
		},
		[qc],
	);

	/** Open a conversation from the list: select it and mark it read. */
	const open = useCallback(
		(t: MailTarget) => {
			useUIStore.getState().selectEmail(t.email.id, t.mailboxId);
			if (emailHasUnread(t.email) && getPreferences().markReadOnOpen) void setRead([t], true);
		},
		[setRead],
	);

	return useMemo(
		() => ({ move, archive, trash, deleteForever, setRead, setStarred, open }),
		[move, archive, trash, deleteForever, setRead, setStarred, open],
	);
}

export type MailActions = ReturnType<typeof useMailActions>;
