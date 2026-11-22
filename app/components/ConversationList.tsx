// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner } from "@cloudflare/kumo";
import {
	ArchiveIcon,
	ArrowClockwiseIcon,
	ArrowLeftIcon,
	CaretDownIcon,
	CaretLeftIcon,
	CaretRightIcon,
	DotsThreeVerticalIcon,
	EnvelopeOpenIcon,
	EnvelopeSimpleIcon,
	FolderSimpleIcon,
	StarIcon,
	TrashIcon,
	TrayIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Folders, getFolderDisplayName, SYSTEM_FOLDER_IDS } from "shared/folders";
import EmailListRow, { emailHasUnread } from "~/components/EmailListRow";
import Menu from "~/components/Menu";
import PullToRefresh from "~/components/PullToRefresh";
import { highlightTerms } from "~/components/SearchResultRow";
import { useHotkeys } from "~/hooks/useHotkeys";
import { useListNav } from "~/hooks/useListNav";
import { type MailTarget, useMailActions } from "~/hooks/useMailActions";
import { useIsDesktop } from "~/hooks/useMediaQuery";
import { useSwipeActions } from "~/hooks/useSwipeActions";
import { rowKey, useUIStore } from "~/hooks/useUIStore";
import { useFolders } from "~/queries/folders";
import { type MailListSource, useMailList } from "~/queries/mailList";
import api from "~/services/api";
import type { Email } from "~/types";

const DESKTOP_PAGE = 50;
const PHONE_PAGE = 25;

function ListSkeleton() {
	return (
		<div className="animate-pulse">
			{Array.from({ length: 12 }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 px-4 py-3 md:py-2.5">
					<div className="h-10 w-10 md:h-4 md:w-4 rounded-full md:rounded bg-kumo-fill shrink-0" />
					<div className="flex-1 space-y-2 md:space-y-0 md:flex md:items-center md:gap-4">
						<div className="h-3 w-28 md:w-44 rounded bg-kumo-fill" />
						<div className="h-3 w-3/4 md:flex-1 rounded bg-kumo-fill" />
					</div>
				</div>
			))}
		</div>
	);
}

export interface ConversationListProps {
	source: MailListSource;
	/** Title shown on phones above the list ("Inbox", "Search results"). */
	title: string;
	/** Folder the list shows; undefined for searches (actions then use each email's own folder). */
	folder?: string;
	/** Unified view: rows carry `mailbox_id` and show a mailbox chip. */
	unified?: boolean;
	empty: ReactNode;
	highlightQuery?: string;
	selfAddress?: string;
	/** Desktop: "← back" button in the toolbar (search results). */
	onBack?: () => void;
}

/**
 * The Gmail conversation list: toolbar with select-all, bulk actions and
 * "1–50 of N ‹ ›" on desktop; avatar rows, swipe, long-press selection and
 * infinite scroll on phones; j/k/x/e/#/s keyboard shortcuts.
 */
export default function ConversationList({
	source,
	title,
	folder,
	unified,
	empty,
	highlightQuery,
	selfAddress,
	onBack,
}: ConversationListProps) {
	const isDesktop = useIsDesktop();
	const qc = useQueryClient();
	const actions = useMailActions();
	const { selectedEmailId, checked, toggleChecked, setChecked, clearChecked, readingPane } = useUIStore();
	const compact = readingPane === "right";

	const sourceKey = JSON.stringify(source);
	const [page, setPage] = useState(1);
	const [focusIdx, setFocusIdx] = useState(-1);
	useEffect(() => {
		setPage(1);
		setFocusIdx(-1);
		clearChecked();
	}, [sourceKey, clearChecked]);

	const pageSize = isDesktop ? DESKTOP_PAGE : PHONE_PAGE;
	const list = useMailList(source, { paged: isDesktop, page, pageSize, refetchInterval: 30_000 });
	const { emails, totalCount } = list;

	const mailboxOf = useCallback(
		(e: Email) => (unified ? e.mailbox_id : source.mailboxId),
		[unified, source.mailboxId],
	);
	const targetOf = useCallback((e: Email): MailTarget | null => {
		const mailboxId = mailboxOf(e);
		return mailboxId ? { email: e, mailboxId } : null;
	}, [mailboxOf]);
	const targets = useCallback(
		(list: Email[]) => list.map(targetOf).filter((t): t is MailTarget => !!t),
		[targetOf],
	);

	// Share the visible list with the reader (newer / older arrows).
	const setNav = useListNav((s) => s.setItems);
	useEffect(() => {
		setNav(targets(emails), totalCount, isDesktop ? (page - 1) * pageSize + 1 : 1);
	}, [emails, totalCount, page, pageSize, isDesktop, setNav, targets]);

	const checkedEmails = useMemo(() => emails.filter((e) => checked.has(rowKey(e))), [emails, checked]);
	const selectionMode = checked.size > 0;
	const allChecked = emails.length > 0 && checkedEmails.length === emails.length;

	const refresh = useCallback(async () => {
		await list.refetch();
		qc.invalidateQueries({ queryKey: ["folders"] });
		qc.invalidateQueries({ queryKey: ["unified", "summary"] });
	}, [list, qc]);

	const swipeFor = useSwipeActions(folder, mailboxOf, actions);

	const isArchiveLike = folder === Folders.ARCHIVE || folder === Folders.TRASH;
	const rowActions = useMemo(
		() => ({
			onOpen: (e: Email) => {
				const t = targetOf(e);
				if (!t) return;
				setFocusIdx(emails.indexOf(e));
				if (e.folder_id === Folders.DRAFT) {
					// Gmail opens a draft straight in the composer.
					void api
						.getEmail(t.mailboxId, e.id)
						.then((full) =>
							useUIStore.getState().startCompose({
								mode: full.in_reply_to ? "reply" : "new",
								draftEmail: full,
								mailboxId: t.mailboxId,
							}),
						)
						.catch(() => actions.open(t));
					return;
				}
				actions.open(t);
			},
			onToggleCheck: (e: Email) => toggleChecked(rowKey(e)),
			onToggleStar: (e: Email) => {
				const t = targetOf(e);
				if (t) void actions.setStarred([t], !e.starred);
			},
			onToggleRead: (e: Email) => {
				const t = targetOf(e);
				if (t) void actions.setRead([t], emailHasUnread(e));
			},
			onArchive: folder && folder !== Folders.DRAFT && folder !== Folders.SENT
				? (e: Email) => {
						const t = targetOf(e);
						if (t) void actions.archive([t], folder);
					}
				: undefined,
			onUnarchive: isArchiveLike
				? (e: Email) => {
						const t = targetOf(e);
						if (t) void actions.move([t], Folders.INBOX, folder);
					}
				: undefined,
			onDelete: (e: Email) => {
				const t = targetOf(e);
				if (t) void actions.trash([t], folder ?? e.folder_id ?? undefined);
			},
		}),
		[actions, targetOf, toggleChecked, folder, isArchiveLike, emails],
	);

	// ── Bulk actions ──
	const bulk = {
		archive: () => void actions.archive(targets(checkedEmails), folder),
		unarchive: () => void actions.move(targets(checkedEmails), Folders.INBOX, folder),
		trash: () => void actions.trash(targets(checkedEmails), folder),
		read: (read: boolean) => {
			void actions.setRead(targets(checkedEmails), read);
			clearChecked();
		},
		star: (starred: boolean) => {
			void actions.setStarred(targets(checkedEmails), starred);
			clearChecked();
		},
		move: (to: string) => void actions.move(targets(checkedEmails), to, folder),
	};
	const anyUnreadChecked = checkedEmails.some(emailHasUnread);

	const { data: folders = [] } = useFolders(unified ? undefined : source.mailboxId);
	const moveTargets = (unified || !folders.length
		? SYSTEM_FOLDER_IDS.filter((f) => f !== Folders.SENT && f !== Folders.DRAFT).map((id) => ({ id, name: getFolderDisplayName(id) }))
		: folders.filter((f) => f.id !== Folders.SENT && f.id !== Folders.DRAFT)
	).filter((f) => f.id !== folder);

	const selectBy = (pred: (e: Email) => boolean) => setChecked(emails.filter(pred).map(rowKey));

	// ── Keyboard (desktop, while the list is visible) ──
	const listVisible = !selectedEmailId;
	const focused = focusIdx >= 0 ? emails[focusIdx] : undefined;
	const focusedOrChecked = () => (checkedEmails.length ? checkedEmails : focused ? [focused] : []);
	useHotkeys(
		{
			j: () => setFocusIdx((i) => Math.min(emails.length - 1, i + 1)),
			k: () => setFocusIdx((i) => Math.max(0, i - 1)),
			o: () => focused && rowActions.onOpen(focused),
			Enter: () => focused && rowActions.onOpen(focused),
			x: () => focused && toggleChecked(rowKey(focused)),
			s: () => focused && rowActions.onToggleStar(focused),
			e: () => {
				const t = targets(focusedOrChecked());
				if (t.length && folder !== Folders.DRAFT) void actions.archive(t, folder);
			},
			"#": () => {
				const t = targets(focusedOrChecked());
				if (t.length) void actions.trash(t, folder);
			},
			I: () => void actions.setRead(targets(focusedOrChecked()), true),
			U: () => void actions.setRead(targets(focusedOrChecked()), false),
			Escape: () => clearChecked(),
		},
		isDesktop && listVisible,
	);
	useEffect(() => {
		if (focusIdx < 0) return;
		document.querySelector(`[data-row-id="${CSS.escape(emails[focusIdx]?.id ?? "")}"]`)?.scrollIntoView({ block: "nearest" });
	}, [focusIdx, emails]);

	// ── Infinite scroll (phones) ──
	const sentinel = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (isDesktop || !list.hasMore || !sentinel.current) return;
		const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && list.loadMore(), { rootMargin: "400px" });
		io.observe(sentinel.current);
		return () => io.disconnect();
	}, [isDesktop, list.hasMore, list.loadMore]);

	const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
	const to = Math.min(totalCount, page * pageSize);
	const highlight = useMemo(
		() => (highlightQuery ? (t: string) => highlightTerms(t, highlightQuery) : undefined),
		[highlightQuery],
	);

	return (
		<div className="flex flex-col h-full min-h-0">
			{/* ── Desktop toolbar ── */}
			<div className="hidden md:flex items-center gap-1 h-12 pl-3 pr-3 shrink-0 border-b border-kumo-line">
				{onBack && (
					<button type="button" className="icon-btn" aria-label="Back" title="Back" onClick={onBack}>
						<ArrowLeftIcon size={18} />
					</button>
				)}
				<div className="flex items-center rounded hover:bg-black/5 dark:hover:bg-white/10 pl-2">
					<input
						type="checkbox"
						aria-label="Select all"
						checked={allChecked}
						ref={(el) => {
							if (el) el.indeterminate = selectionMode && !allChecked;
						}}
						onChange={() => (selectionMode ? clearChecked() : selectBy(() => true))}
						className="h-[18px] w-[18px] cursor-pointer accent-[var(--color-kumo-brand)]"
					/>
					<Menu
						align="left"
						label="Select"
						items={[
							{ label: "All", onSelect: () => selectBy(() => true) },
							{ label: "None", onSelect: clearChecked },
							{ label: "Read", onSelect: () => selectBy((e) => !emailHasUnread(e)) },
							{ label: "Unread", onSelect: () => selectBy(emailHasUnread) },
							{ label: "Starred", onSelect: () => selectBy((e) => e.starred) },
							{ label: "Unstarred", onSelect: () => selectBy((e) => !e.starred) },
						]}
						trigger={(p) => (
							<button type="button" {...p} aria-label="Select options" className="h-8 w-5 flex items-center justify-center bg-transparent border-0 cursor-pointer text-kumo-strong">
								<CaretDownIcon size={12} weight="bold" />
							</button>
						)}
					/>
				</div>

				{!selectionMode ? (
					<>
						<button type="button" className="icon-btn" aria-label="Refresh" title="Refresh" onClick={refresh}>
							<ArrowClockwiseIcon size={18} className={list.isFetching ? "animate-spin" : ""} />
						</button>
						<Menu
							align="left"
							label="More"
							items={[
								{ label: "Mark all as read", icon: <EnvelopeOpenIcon size={18} />, onSelect: () => void actions.setRead(targets(emails.filter(emailHasUnread)), true) },
							]}
							trigger={(p) => (
								<button type="button" {...p} className="icon-btn" aria-label="More" title="More">
									<DotsThreeVerticalIcon size={18} weight="bold" />
								</button>
							)}
						/>
					</>
				) : (
					<div className="flex items-center gap-0.5">
						{isArchiveLike ? (
							<button type="button" className="icon-btn" title="Move to Inbox" aria-label="Move to Inbox" onClick={bulk.unarchive}>
								<TrayIcon size={18} />
							</button>
						) : (
							folder && folder !== Folders.DRAFT && folder !== Folders.SENT && (
								<button type="button" className="icon-btn" title="Archive" aria-label="Archive" onClick={bulk.archive}>
									<ArchiveIcon size={18} />
								</button>
							)
						)}
						<button
							type="button"
							className="icon-btn"
							title={folder === Folders.TRASH ? "Delete forever" : "Delete"}
							aria-label={folder === Folders.TRASH ? "Delete forever" : "Delete"}
							onClick={bulk.trash}
						>
							<TrashIcon size={18} />
						</button>
						<div className="w-px h-5 bg-kumo-line mx-1.5" />
						<button
							type="button"
							className="icon-btn"
							title={anyUnreadChecked ? "Mark as read" : "Mark as unread"}
							aria-label={anyUnreadChecked ? "Mark as read" : "Mark as unread"}
							onClick={() => bulk.read(anyUnreadChecked)}
						>
							{anyUnreadChecked ? <EnvelopeOpenIcon size={18} /> : <EnvelopeSimpleIcon size={18} />}
						</button>
						{folder !== Folders.DRAFT && (
							<Menu
								align="left"
								label="Move to"
								header={<div className="px-4 py-1.5 text-xs font-medium text-kumo-subtle">Move to:</div>}
								items={moveTargets.map((f) => ({ label: f.name, onSelect: () => bulk.move(f.id) }))}
								trigger={(p) => (
									<button type="button" {...p} className="icon-btn" title="Move to" aria-label="Move to">
										<FolderSimpleIcon size={18} />
									</button>
								)}
							/>
						)}
						<Menu
							align="left"
							label="More"
							items={[
								{ label: "Mark as read", icon: <EnvelopeOpenIcon size={18} />, onSelect: () => bulk.read(true) },
								{ label: "Mark as unread", icon: <EnvelopeSimpleIcon size={18} />, onSelect: () => bulk.read(false) },
								{ label: "Add star", icon: <StarIcon size={18} />, onSelect: () => bulk.star(true) },
								{ label: "Remove star", icon: <StarIcon size={18} />, onSelect: () => bulk.star(false) },
							]}
							trigger={(p) => (
								<button type="button" {...p} className="icon-btn" aria-label="More" title="More">
									<DotsThreeVerticalIcon size={18} weight="bold" />
								</button>
							)}
						/>
						<span className="ml-2 text-sm text-kumo-subtle">{checkedEmails.length} selected</span>
					</div>
				)}

				<div className="ml-auto flex items-center gap-1 text-xs text-kumo-subtle">
					{totalCount > 0 && (
						<span className="px-2 whitespace-nowrap">
							{from}–{to} of {totalCount.toLocaleString()}
						</span>
					)}
					<button type="button" className="icon-btn" aria-label="Newer" title="Newer" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
						<CaretLeftIcon size={16} />
					</button>
					<button type="button" className="icon-btn" aria-label="Older" title="Older" disabled={to >= totalCount} onClick={() => setPage((p) => p + 1)}>
						<CaretRightIcon size={16} />
					</button>
				</div>
			</div>

			{/* ── Phone: selection bar over the search header ── */}
			{selectionMode && (
				<div className="md:hidden fixed top-0 inset-x-0 z-30 pt-[env(safe-area-inset-top)] bg-kumo-base shadow-sm">
					<div className="flex items-center gap-1 h-14 px-1">
						<button type="button" className="icon-btn" aria-label="Clear selection" onClick={clearChecked}>
							<XIcon size={22} />
						</button>
						<span className="text-lg font-medium text-kumo-default px-1">{checkedEmails.length}</span>
						<div className="ml-auto flex items-center">
							{isArchiveLike ? (
								<button type="button" className="icon-btn" aria-label="Move to Inbox" onClick={bulk.unarchive}>
									<TrayIcon size={22} />
								</button>
							) : (
								folder && folder !== Folders.DRAFT && folder !== Folders.SENT && (
									<button type="button" className="icon-btn" aria-label="Archive" onClick={bulk.archive}>
										<ArchiveIcon size={22} />
									</button>
								)
							)}
							<button type="button" className="icon-btn" aria-label="Delete" onClick={bulk.trash}>
								<TrashIcon size={22} />
							</button>
							<button
								type="button"
								className="icon-btn"
								aria-label={anyUnreadChecked ? "Mark as read" : "Mark as unread"}
								onClick={() => bulk.read(anyUnreadChecked)}
							>
								{anyUnreadChecked ? <EnvelopeOpenIcon size={22} /> : <EnvelopeSimpleIcon size={22} />}
							</button>
							<Menu
								label="More"
								items={[
									{ label: allChecked ? "Deselect all" : "Select all", onSelect: () => (allChecked ? clearChecked() : selectBy(() => true)) },
									null,
									{ label: "Add star", onSelect: () => bulk.star(true) },
									{ label: "Remove star", onSelect: () => bulk.star(false) },
									...(folder !== Folders.DRAFT
										? [null, ...moveTargets.map((f) => ({ label: `Move to ${f.name}`, onSelect: () => bulk.move(f.id) }))]
										: []),
								]}
								trigger={(p) => (
									<button type="button" {...p} className="icon-btn" aria-label="More">
										<DotsThreeVerticalIcon size={22} weight="bold" />
									</button>
								)}
							/>
						</div>
					</div>
				</div>
			)}

			{list.failed.length > 0 && (
				<div className="px-3 pt-3">
					<Banner variant="error" text={`Could not load: ${list.failed.join(", ")}. Other mailboxes are shown.`} />
				</div>
			)}

			<PullToRefresh onRefresh={refresh} className="flex-1 min-h-0 pb-24 md:pb-0">
				{/* Phone: folder title like the Gmail app */}
				<div className="md:hidden flex items-center gap-1 px-4 pt-2 pb-1">
					{onBack && (
						<button type="button" className="icon-btn -ml-2" aria-label="Back" onClick={onBack}>
							<ArrowLeftIcon size={20} />
						</button>
					)}
					<h1 className="text-xs font-medium uppercase tracking-wide text-kumo-subtle truncate">{title}</h1>
				</div>

				{list.error ? (
					<div className="p-4">
						<Banner variant="error" text={list.error.message || "Failed to load emails."} />
					</div>
				) : list.isPending ? (
					<ListSkeleton />
				) : emails.length === 0 ? (
					empty
				) : (
					<div role="list" aria-label={title}>
						{emails.map((email, i) => (
							<EmailListRow
								key={rowKey(email)}
								email={email}
								mailboxId={unified ? email.mailbox_id : undefined}
								isSelected={selectedEmailId === email.id}
								isChecked={checked.has(rowKey(email))}
								isFocused={i === focusIdx && isDesktop}
								selectionMode={selectionMode}
								compact={compact}
								selfAddress={selfAddress}
								highlight={highlight}
								{...rowActions}
								{...swipeFor(email)}
							/>
						))}
						{list.hasMore && (
							<div ref={sentinel} className="flex justify-center py-4">
								<ArrowClockwiseIcon size={20} className="animate-spin text-kumo-subtle" />
							</div>
						)}
					</div>
				)}
			</PullToRefresh>
		</div>
	);
}
