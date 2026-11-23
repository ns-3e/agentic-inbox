// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	ArchiveIcon,
	ArrowBendDoubleUpLeftIcon,
	ArrowBendUpLeftIcon,
	ArrowBendUpRightIcon,
	ArrowLeftIcon,
	CaretLeftIcon,
	CaretRightIcon,
	CodeIcon,
	DotsThreeVerticalIcon,
	EnvelopeSimpleIcon,
	FolderSimpleIcon,
	StarIcon,
	TrashIcon,
	TrayIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Folders, getFolderDisplayName, SYSTEM_FOLDER_IDS } from "shared/folders";
import { InlineComposer } from "~/components/compose/ComposeHost";
import EmailPanelDialogs from "~/components/email-panel/EmailPanelDialogs";
import ThreadMessage from "~/components/email-panel/ThreadMessage";
import { MailboxLabel } from "~/components/EmailListRow";
import Menu from "~/components/Menu";
import { useActiveMailbox } from "~/hooks/useActiveMailbox";
import { useHotkeys } from "~/hooks/useHotkeys";
import { useListNav } from "~/hooks/useListNav";
import { type MailTarget, useMailActions } from "~/hooks/useMailActions";
import { useIsDesktop } from "~/hooks/useMediaQuery";
import { snackbar } from "~/hooks/useSnackbar";
import { getPreferences } from "~/hooks/usePreferences";
import { type ComposeMode, useUIStore } from "~/hooks/useUIStore";
import { parseAddress } from "~/lib/address";
import { splitEmailList, toEmailListValue } from "~/lib/utils";
import { useEmail, useReplyToEmail, useSendEmail, useDeleteEmail, useThreadReplies } from "~/queries/emails";
import { useFolders } from "~/queries/folders";
import { useMailbox } from "~/queries/mailboxes";
import api from "~/services/api";
import type { Email, Mailbox } from "~/types";

function EmailPanelSkeleton() {
	return (
		<div className="animate-pulse px-4 md:px-6 py-5 space-y-5">
			<div className="h-6 w-2/3 rounded bg-kumo-fill" />
			<div className="flex items-center gap-3">
				<div className="w-10 h-10 rounded-full bg-kumo-fill" />
				<div className="space-y-2 flex-1">
					<div className="h-3 w-40 rounded bg-kumo-fill" />
					<div className="h-2.5 w-24 rounded bg-kumo-fill" />
				</div>
			</div>
			<div className="space-y-2 md:pl-[52px]">
				<div className="h-2.5 w-full rounded bg-kumo-fill" />
				<div className="h-2.5 w-5/6 rounded bg-kumo-fill" />
				<div className="h-2.5 w-4/6 rounded bg-kumo-fill" />
			</div>
		</div>
	);
}

function ReplyPill({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="btn flex-1 md:flex-none !h-10 md:!h-8"
		>
			{icon}
			{label}
		</button>
	);
}

/** How many messages stay visible at each end before the middle folds into "N older messages". */
const FOLD_THRESHOLD = 4;

export default function EmailPanel({ emailId }: { emailId: string }) {
	const params = useParams<{ folder: string }>();
	const { mailboxId } = useActiveMailbox();
	const unified = useParams<{ mailboxId: string }>().mailboxId === undefined;
	const isDesktop = useIsDesktop();
	const { data: email, isError } = useEmail(mailboxId, emailId) as { data?: Email; isError: boolean };
	const { data: threadRaw } = useThreadReplies(mailboxId, email?.thread_id) as { data?: Email[] };
	const { data: currentMailbox } = useMailbox(mailboxId) as { data?: Mailbox };
	const { data: folders = [] } = useFolders(mailboxId);
	const actions = useMailActions();
	const sendEmailMut = useSendEmail();
	const replyMut = useReplyToEmail();
	const deleteEmailMut = useDeleteEmail();
	const { closePanel, startCompose, isComposing, composeOptions, composeDraftId } = useUIStore();
	const navItems = useListNav((s) => s.items);
	const navTotal = useListNav((s) => s.totalCount);
	const navOffset = useListNav((s) => s.offset);
	const [isSending, setIsSending] = useState(false);
	const [sourceViewEmail, setSourceViewEmail] = useState<Email | null>(null);
	const [previewImage, setPreviewImage] = useState<{ url: string; filename: string } | null>(null);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [unfolded, setUnfolded] = useState(false);
	const selfAddress = currentMailbox?.email ?? mailboxId;

	// Oldest first, like Gmail.
	const messages = useMemo(() => {
		if (!email) return [];
		const others = (threadRaw ?? []).filter((m) => m.id !== email.id);
		return [email, ...others]
			.filter((m) => !composeDraftId || m.id !== composeDraftId || m.id === email.id)
			.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
	}, [email, threadRaw, composeDraftId]);

	const folder = params.folder ?? email?.folder_id ?? undefined;
	const isDraftFolder = folder === Folders.DRAFT;

	const draftIds = useMemo(() => {
		const ids = new Set<string>();
		for (const m of messages) if (m.folder_id === Folders.DRAFT || (isDraftFolder && m.id === emailId)) ids.add(m.id);
		return ids;
	}, [messages, isDraftFolder, emailId]);

	// Expand the newest message, unread ones, and drafts when a conversation opens.
	const threadKey = `${email?.id}:${messages.length}`;
	useEffect(() => {
		if (!messages.length) return;
		const next = new Set<string>([messages[messages.length - 1].id]);
		for (const m of messages) if (!m.read || draftIds.has(m.id)) next.add(m.id);
		setExpanded(next);
		setUnfolded(false);
	}, [threadKey]); // eslint-disable-line react-hooks/exhaustive-deps

	// Opened (from the list, a link, or auto-advance): mark it read, unless Preferences say not to.
	useEffect(() => {
		if (!getPreferences().markReadOnOpen) return;
		if (email && mailboxId && messages.some((m) => !m.read && !draftIds.has(m.id))) {
			void actions.setRead([{ email: { ...email, thread_count: messages.length }, mailboxId }], true);
		}
	}, [email?.id, mailboxId]); // eslint-disable-line react-hooks/exhaustive-deps

	/** Newest message not from me: the one Reply answers. */
	const replyTarget = useMemo(() => {
		const self = selfAddress?.toLowerCase();
		const real = messages.filter((m) => !draftIds.has(m.id));
		return (
			[...real].reverse().find((m) => parseAddress(m.sender).address.toLowerCase() !== self) ??
			real[real.length - 1] ??
			email
		);
	}, [messages, draftIds, selfAddress, email]);

	// Newer / older within the current list.
	const navIdx = navItems.findIndex((i) => i.email.id === emailId && (!unified || i.mailboxId === mailboxId));
	const newer = navIdx > 0 ? navItems[navIdx - 1] : undefined;
	const older = navIdx >= 0 && navIdx < navItems.length - 1 ? navItems[navIdx + 1] : undefined;

	const target: MailTarget | null =
		email && mailboxId ? { email: { ...email, thread_count: messages.length, folder_id: email.folder_id }, mailboxId } : null;

	const reply = (mode: ComposeMode, msg?: Email) => {
		const original = mode === "forward" ? (msg ?? messages[messages.length - 1] ?? email) : (msg ?? replyTarget);
		if (!original) return;
		startCompose({ mode, originalEmail: original, inline: isDesktop, mailboxId });
	};

	const inlineOpen = isComposing && !!composeOptions.inline && isDesktop;

	useHotkeys(
		{
			u: closePanel,
			Escape: closePanel,
			e: () => target && folder !== Folders.DRAFT && void actions.archive([target], folder),
			"#": () => target && void actions.trash([target], folder),
			r: () => reply("reply"),
			a: () => reply("reply-all"),
			f: () => reply("forward"),
			s: () => target && void actions.setStarred([target], !email?.starred),
			U: () => {
				if (!target) return;
				void actions.setRead([target], false);
				closePanel();
			},
			j: () => older && actions.open(older),
			k: () => newer && actions.open(newer),
		},
		isDesktop && !!email && !inlineOpen,
	);

	if (isError) {
		return (
			<div className="flex flex-col h-full">
				<div className="flex items-center h-12 px-2 border-b border-kumo-line">
					<button type="button" className="icon-btn" aria-label="Back" onClick={closePanel}>
						<ArrowLeftIcon size={20} />
					</button>
				</div>
				<div className="p-8 text-center text-sm text-kumo-subtle">This conversation could not be loaded. It may have been deleted.</div>
			</div>
		);
	}
	if (!email || !target) return <EmailPanelSkeleton />;

	const moveTargets = (folders.length ? folders : SYSTEM_FOLDER_IDS.map((id) => ({ id, name: getFolderDisplayName(id), unreadCount: 0 }))).filter(
		(f) => f.id !== folder && f.id !== Folders.SENT && f.id !== Folders.DRAFT,
	);
	const isArchiveLike = folder === Folders.ARCHIVE || folder === Folders.TRASH;

	const handleEditDraft = (draft: Email) => {
		const original = draft.in_reply_to ? messages.find((m) => m.id === draft.in_reply_to) : undefined;
		startCompose({
			mode: draft.in_reply_to ? "reply" : "new",
			originalEmail: original,
			draftEmail: draft,
			inline: isDesktop && !!draft.in_reply_to,
			mailboxId,
		});
	};

	const handleDeleteDraft = async (draft: Email) => {
		if (!mailboxId) return;
		await deleteEmailMut.mutateAsync({ mailboxId, id: draft.id });
		snackbar.show({ message: "Draft discarded" });
		if (draft.id === emailId) closePanel();
	};

	const handleSendDraft = async (draft: Email) => {
		if (!mailboxId || !currentMailbox) return;
		setIsSending(true);
		try {
			let t = draft;
			if (!t.recipient || !t.subject) {
				try {
					t = (await api.getEmail(mailboxId, t.id)) ?? t;
				} catch {
					// Use what we have.
				}
			}
			const toRecipients = splitEmailList(t.recipient);
			if (toRecipients.length === 0) {
				snackbar.error("Add a recipient before sending. Use Edit.");
				return;
			}
			const fromName = currentMailbox.settings?.fromName || currentMailbox.name;
			const from = fromName && fromName !== currentMailbox.email ? { email: currentMailbox.email, name: fromName } : currentMailbox.email;
			const original = t.in_reply_to ? messages.find((m) => m.id === t.in_reply_to) : undefined;
			const emailData = {
				to: toEmailListValue(toRecipients),
				cc: toEmailListValue(splitEmailList(t.cc)),
				bcc: toEmailListValue(splitEmailList(t.bcc)),
				from,
				subject: t.subject || "(no subject)",
				html: t.body || "",
				text: t.body ? t.body.replace(/<[^>]*>/g, "").trim() : "",
			};
			if (original) await replyMut.mutateAsync({ mailboxId, emailId: original.id, email: emailData });
			else await sendEmailMut.mutateAsync({ mailboxId, email: emailData });
			await deleteEmailMut.mutateAsync({ mailboxId, id: t.id });
			snackbar.show({ message: "Message sent" });
			if (isDraftFolder) closePanel();
		} catch (err) {
			snackbar.error((err as Error).message || "Failed to send email.");
		} finally {
			setIsSending(false);
		}
	};

	// Fold long conversations: first message, "N older messages", then the last two.
	const foldable = !unfolded && messages.length > FOLD_THRESHOLD;
	const hiddenIds = new Set(
		foldable ? messages.slice(1, -2).filter((m) => !expanded.has(m.id)).map((m) => m.id) : [],
	);
	const folderLabel = email.folder_id ? (folders.find((f) => f.id === email.folder_id)?.name ?? getFolderDisplayName(email.folder_id)) : null;
	const showReplyBar = !isDraftFolder && !(draftIds.size > 0 && draftIds.size === messages.length);

	return (
		<div className="flex flex-col h-full min-h-0 bg-kumo-base">
			{/* ── Toolbar ── */}
			<div className="flex items-center gap-0.5 h-14 md:h-10 px-1 md:px-2 shrink-0 md:border-b md:border-kumo-line md:bg-[var(--ops-header)]">
				<button type="button" className="icon-btn" aria-label="Back to list" title="Back to list" onClick={closePanel}>
					<ArrowLeftIcon size={20} />
				</button>
				<div className="ml-auto md:ml-2 flex items-center gap-0.5">
					{isArchiveLike ? (
						<button type="button" className="icon-btn" aria-label="Move to Inbox" title="Move to Inbox" onClick={() => void actions.move([target], Folders.INBOX, folder)}>
							<TrayIcon size={20} />
						</button>
					) : (
						folder !== Folders.DRAFT &&
						folder !== Folders.SENT && (
							<button type="button" className="icon-btn" aria-label="Archive" title="Archive" onClick={() => void actions.archive([target], folder)}>
								<ArchiveIcon size={20} />
							</button>
						)
					)}
					<button
						type="button"
						className="icon-btn"
						aria-label={folder === Folders.TRASH ? "Delete forever" : "Delete"}
						title={folder === Folders.TRASH ? "Delete forever" : "Delete"}
						onClick={() => void actions.trash([target], folder)}
					>
						<TrashIcon size={20} />
					</button>
					<div className="hidden md:block w-px h-5 bg-kumo-line mx-1.5" />
					<button
						type="button"
						className="icon-btn"
						aria-label="Mark as unread"
						title="Mark as unread"
						onClick={() => {
							void actions.setRead([target], false);
							closePanel();
						}}
					>
						<EnvelopeSimpleIcon size={20} />
					</button>
					<Menu
						align={isDesktop ? "left" : "right"}
						label="Move to"
						header={<div className="px-2.5 pt-1.5 pb-1 text-[0.6875rem] font-semibold text-kumo-subtle">Move to</div>}
						items={moveTargets.map((f) => ({ label: f.name, onSelect: () => void actions.move([target], f.id, folder) }))}
						trigger={(p) => (
							<button type="button" {...p} className="icon-btn" aria-label="Move to" title="Move to">
								<FolderSimpleIcon size={20} />
							</button>
						)}
					/>
					<Menu
						label="More"
						items={[
							{ label: email.starred ? "Remove star" : "Add star", icon: <StarIcon size={18} />, onSelect: () => void actions.setStarred([target], !email.starred) },
							{ label: "Reply", icon: <ArrowBendUpLeftIcon size={18} />, onSelect: () => reply("reply") },
							{ label: "Reply all", icon: <ArrowBendDoubleUpLeftIcon size={18} />, onSelect: () => reply("reply-all") },
							{ label: "Forward", icon: <ArrowBendUpRightIcon size={18} />, onSelect: () => reply("forward") },
							null,
							{ label: "Show original", icon: <CodeIcon size={18} />, onSelect: () => setSourceViewEmail(messages[messages.length - 1] ?? email) },
						]}
						trigger={(p) => (
							<button type="button" {...p} className="icon-btn" aria-label="More" title="More">
								<DotsThreeVerticalIcon size={20} weight="bold" />
							</button>
						)}
					/>
				</div>
				{navIdx >= 0 && (
					<div className="hidden md:flex ml-auto items-center gap-1 text-xs text-kumo-subtle">
						<span className="px-2 whitespace-nowrap ops-mono tabular text-[0.6875rem]">
							{navOffset + navIdx} of {navTotal.toLocaleString()}
						</span>
						<button type="button" className="icon-btn" aria-label="Newer" title="Newer" disabled={!newer} onClick={() => newer && actions.open(newer)}>
							<CaretLeftIcon size={16} />
						</button>
						<button type="button" className="icon-btn" aria-label="Older" title="Older" disabled={!older} onClick={() => older && actions.open(older)}>
							<CaretRightIcon size={16} />
						</button>
					</div>
				)}
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto">
				{/* ── Subject ── */}
				<div className="flex items-start gap-3 px-4 md:pl-[76px] md:pr-6 pt-4 pb-3">
					<div className="flex-1 min-w-0">
						<h2 className="text-lg leading-6 font-semibold tracking-[-0.01em] text-kumo-default break-words">{email.subject || "(no subject)"}</h2>
						<div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-kumo-subtle">
							{folderLabel && <span className="chip">{folderLabel}</span>}
							{mailboxId && <MailboxLabel mailboxId={mailboxId} full />}
							<span className="ops-mono tabular text-[0.6875rem]">
								{messages.length} message{messages.length === 1 ? "" : "s"}
							</span>
						</div>
					</div>
					<button
						type="button"
						className="icon-btn -mr-2 -mt-1.5"
						aria-label={email.starred ? "Starred" : "Not starred"}
						title={email.starred ? "Starred" : "Not starred"}
						onClick={() => void actions.setStarred([target], !email.starred)}
					>
						<StarIcon size={20} weight={email.starred ? "fill" : "regular"} className={email.starred ? "text-[var(--ops-star)]" : ""} />
					</button>
				</div>

				{/* ── Messages ── */}
				<div className="border-t border-kumo-line">
					{messages.map((msg, idx) => {
						if (hiddenIds.has(msg.id)) {
							// Render the fold marker once, in place of the first hidden message.
							if (idx !== messages.findIndex((m) => hiddenIds.has(m.id))) return null;
							return (
								<div key="fold" className="relative h-10 border-b border-kumo-line">
									<div className="absolute inset-x-0 top-1/2 border-t border-kumo-line" />
									<button
										type="button"
										onClick={() => setUnfolded(true)}
										className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 h-7 px-2.5 rounded-md bg-kumo-base border border-[var(--ops-line-strong)] ops-mono text-xs font-semibold text-kumo-strong cursor-pointer hover:bg-kumo-tint"
										aria-label={`${hiddenIds.size} older messages`}
										title={`${hiddenIds.size} older messages`}
									>
										{hiddenIds.size}
									</button>
								</div>
							);
						}
						const isDraft = draftIds.has(msg.id);
						const msgTarget = { email: msg, mailboxId: mailboxId! };
						return (
							<ThreadMessage
								key={msg.id}
								email={msg}
								mailboxId={mailboxId}
								mailboxEmail={selfAddress}
								isDraft={isDraft}
								isSending={isDraft ? isSending : false}
								isExpanded={expanded.has(msg.id)}
								onToggleExpand={() =>
									setExpanded((prev) => {
										const next = new Set(prev);
										if (next.has(msg.id)) next.delete(msg.id);
										else next.add(msg.id);
										return next;
									})
								}
								onReply={() => reply("reply", msg)}
								onReplyAll={() => reply("reply-all", msg)}
								onForward={() => reply("forward", msg)}
								onToggleStar={() => void actions.setStarred([msgTarget], !msg.starred)}
								onMarkUnread={() => {
									void actions.setRead([msgTarget], false);
									closePanel();
								}}
								onDelete={messages.length > 1 ? () => void actions.trash([{ email: { ...msg, thread_count: 1 }, mailboxId: mailboxId! }], msg.folder_id ?? undefined) : undefined}
								onSendDraft={isDraft ? () => handleSendDraft(msg) : undefined}
								onEditDraft={isDraft ? () => handleEditDraft(msg) : undefined}
								onDeleteDraft={isDraft ? () => handleDeleteDraft(msg) : undefined}
								onViewSource={() => setSourceViewEmail(msg)}
								onPreviewImage={(url, filename) => setPreviewImage({ url, filename })}
							/>
						);
					})}
				</div>

				{/* ── Reply / inline composer ── */}
				{inlineOpen ? (
					<div className="px-4 md:pl-[76px] md:pr-6 py-4">
						<InlineComposer />
					</div>
				) : (
					showReplyBar && (
						<div className="flex gap-2 md:gap-3 px-3 md:pl-[76px] md:pr-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6">
							<ReplyPill icon={<ArrowBendUpLeftIcon size={18} />} label="Reply" onClick={() => reply("reply")} />
							{replyTarget && splitEmailList(replyTarget.recipient).length + splitEmailList(replyTarget.cc).length > 1 && (
								<ReplyPill icon={<ArrowBendDoubleUpLeftIcon size={18} />} label="Reply all" onClick={() => reply("reply-all")} />
							)}
							<ReplyPill icon={<ArrowBendUpRightIcon size={18} />} label="Forward" onClick={() => reply("forward")} />
						</div>
					)
				)}
			</div>

			<EmailPanelDialogs
				sourceViewEmail={sourceViewEmail}
				previewImage={previewImage}
				onCloseSource={() => setSourceViewEmail(null)}
				onClosePreview={() => setPreviewImage(null)}
			/>
		</div>
	);
}
