// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	ArchiveIcon,
	EnvelopeOpenIcon,
	EnvelopeSimpleIcon,
	PaperclipIcon,
	StarIcon,
	TrashIcon,
	TrayIcon,
} from "@phosphor-icons/react";
import { memo, useRef, useState } from "react";
import { formatListDate } from "shared/dates";
import Avatar from "~/components/Avatar";
import { usePreferences } from "~/hooks/usePreferences";
import { displayName } from "~/lib/address";
import { hour12For } from "~/lib/preferences";
import { getSnippetText } from "~/lib/utils";
import type { Email } from "~/types";

export function emailHasUnread(email: Email): boolean {
	if (email.thread_unread_count !== undefined) {
		return email.thread_unread_count > 0;
	}
	return !email.read;
}

/** "Jane, Bob, me" style sender list for a conversation row. */
export function formatParticipants(email: Email, self?: string): string {
	const raw = email.participants ? email.participants.split(",") : [email.sender];
	const names = raw
		.map((p) => p.trim())
		.filter(Boolean)
		.map((p) => (self && p.toLowerCase().includes(self.toLowerCase()) ? "me" : displayName(p)))
		.filter((name, idx, arr) => arr.indexOf(name) === idx);
	if (names.length === 0) return "(unknown)";
	if (names.length <= 3) return names.join(", ");
	return `${names[0]} .. ${names.slice(-2).join(", ")}`;
}

// Per-mailbox colour so the eye can group rows by mailbox at a glance.
// Hues are spread by the golden angle over the sorted mailbox list, so every
// mailbox gets a clearly different colour (a plain hash collides quickly).
let mailboxOrder = new Map<string, number>();

export function setMailboxOrder(ids: string[]) {
	mailboxOrder = new Map([...ids].sort().map((id, i) => [id, i]));
}

/**
 * Short label for a mailbox: the local part ("alice"), or the domain
 * ("advsys.io") when several mailboxes share that local part.
 */
export function mailboxShortName(mailboxId: string): string {
	const [local, domain] = mailboxId.split("@");
	if (!domain) return mailboxId;
	let same = 0;
	for (const id of mailboxOrder.keys()) if (id.split("@")[0] === local) same++;
	return same > 1 ? domain : local;
}

export function mailboxHue(mailboxId: string): number {
	let idx = mailboxOrder.get(mailboxId);
	if (idx === undefined) {
		let h = 0;
		for (let i = 0; i < mailboxId.length; i++) h = (h * 31 + mailboxId.charCodeAt(i)) | 0;
		idx = Math.abs(h);
	}
	return Math.round((210 + idx * 137.508) % 360);
}

export function MailboxLabel({ mailboxId, full }: { mailboxId: string; full?: boolean }) {
	const hue = mailboxHue(mailboxId);
	return (
		<span title={mailboxId} className="shrink-0 inline-flex items-center gap-1.5 max-w-[11rem] min-w-0 text-xs text-kumo-strong">
			<span className="dot" style={{ backgroundColor: `hsl(${hue} 60% 48%)` }} />
			<span className="ops-mono truncate">{full ? mailboxId : mailboxShortName(mailboxId)}</span>
		</span>
	);
}

/** A swipe gesture on touch screens. */
export interface SwipeAction {
	label: string;
	icon: React.ReactNode;
	/** Tailwind classes for the revealed background. */
	className: string;
	/** True when the action removes the row from this list (archive, delete). */
	removesRow?: boolean;
	run: (email: Email) => void;
}

export interface RowActions {
	onOpen: (email: Email) => void;
	onToggleCheck: (email: Email) => void;
	onToggleStar: (email: Email) => void;
	onToggleRead: (email: Email) => void;
	onArchive?: (email: Email) => void;
	onDelete: (email: Email) => void;
	/** "Move to Inbox" instead of Archive (Archive, Trash). */
	onUnarchive?: (email: Email) => void;
}

interface EmailListRowProps extends RowActions {
	email: Email;
	isSelected: boolean;
	isChecked: boolean;
	/** At least one row is checked: a tap toggles the check instead of opening. */
	selectionMode: boolean;
	/** Narrow list next to the reading pane: use the two-line layout. */
	compact: boolean;
	/** Shown in the unified view so each row says which mailbox it came from. */
	mailboxId?: string;
	/** Keyboard cursor (j/k). */
	isFocused?: boolean;
	selfAddress?: string;
	highlight?: (text: string) => React.ReactNode;
	/** Finger moves left (reveals the right side). */
	swipeLeft?: SwipeAction;
	/** Finger moves right (reveals the left side). */
	swipeRight?: SwipeAction;
}

const SWIPE_COMMIT_RATIO = 0.35;
const LONG_PRESS_MS = 450;

/** Horizontal swipe and long press. Vertical scrolling is left to the browser (touch-action: pan-y). */
function useTouch(
	email: Email,
	swipeLeft: SwipeAction | undefined,
	swipeRight: SwipeAction | undefined,
	onLongPress: () => void,
) {
	const [offset, setOffset] = useState(0);
	const [animating, setAnimating] = useState(false);
	const start = useRef<{ x: number; y: number } | null>(null);
	const axis = useRef<"x" | "y" | null>(null);
	const width = useRef(0);
	const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	/** Set after a swipe or long press so the trailing click does nothing. */
	const suppressClick = useRef(false);

	const suppress = () => {
		suppressClick.current = true;
		setTimeout(() => (suppressClick.current = false), 400);
	};

	const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
		const t = e.touches[0];
		start.current = { x: t.clientX, y: t.clientY };
		axis.current = null;
		width.current = e.currentTarget.offsetWidth || 1;
		setAnimating(false);
		clearTimeout(pressTimer.current);
		pressTimer.current = setTimeout(() => {
			if (axis.current) return;
			start.current = null;
			suppress();
			if (navigator.vibrate) navigator.vibrate(15);
			onLongPress();
		}, LONG_PRESS_MS);
	};

	const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
		if (!start.current) return;
		const t = e.touches[0];
		const dx = t.clientX - start.current.x;
		const dy = t.clientY - start.current.y;
		if (axis.current === null) {
			if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) axis.current = "x";
			else if (Math.abs(dy) > 10) axis.current = "y";
			if (axis.current) clearTimeout(pressTimer.current);
		}
		if (axis.current !== "x") return;
		if ((dx < 0 && !swipeLeft) || (dx > 0 && !swipeRight)) return setOffset(0);
		setOffset(dx);
	};

	const onTouchEnd = () => {
		clearTimeout(pressTimer.current);
		if (!start.current) return;
		start.current = null;
		if (axis.current !== "x") return;
		suppress();
		const action = offset < 0 ? swipeLeft : swipeRight;
		const committed = action && Math.abs(offset) > width.current * SWIPE_COMMIT_RATIO;
		setAnimating(true);
		if (committed && action) {
			if (navigator.vibrate) navigator.vibrate(10);
			if (action.removesRow) {
				setOffset(Math.sign(offset) * width.current);
				setTimeout(() => action.run(email), 180);
			} else {
				setOffset(0);
				action.run(email);
			}
		} else {
			setOffset(0);
		}
	};

	const active = offset < 0 ? swipeLeft : offset > 0 ? swipeRight : undefined;
	const past = Math.abs(offset) > width.current * SWIPE_COMMIT_RATIO;
	return {
		offset,
		animating,
		active,
		past,
		suppressClick,
		handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
	};
}

function HoverAction({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			className="icon-btn !w-7 !h-7"
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
		>
			{icon}
		</button>
	);
}

function EmailListRow({
	email,
	isSelected,
	isChecked,
	selectionMode,
	compact,
	mailboxId,
	isFocused,
	selfAddress,
	highlight = (t) => t,
	onOpen,
	onToggleCheck,
	onToggleStar,
	onToggleRead,
	onArchive,
	onUnarchive,
	onDelete,
	swipeLeft,
	swipeRight,
}: EmailListRowProps) {
	const showSnippets = usePreferences((s) => s.showSnippets);
	const showAwaitingReply = usePreferences((s) => s.showAwaitingReply);
	const hour12 = hour12For(usePreferences((s) => s.clock));
	const snippet = showSnippets ? getSnippetText(email.snippet, 140) : "";
	const unread = emailHasUnread(email);
	const { offset, animating, active, past, suppressClick, handlers } = useTouch(email, swipeLeft, swipeRight, () =>
		onToggleCheck(email),
	);
	const count = email.thread_count ?? 1;
	const isDraftRow = email.folder_id === "draft";
	const isSentRow = email.folder_id === "sent" && (email.thread_count ?? 1) <= 1;
	const recipientNames = email.recipient
		? email.recipient.split(",").map((r) => displayName(r.trim())).filter(Boolean).join(", ")
		: "";
	const people = isDraftRow
		? recipientNames || "(no recipients)"
		: isSentRow
			? `To: ${recipientNames}`
			: formatParticipants(email, selfAddress);
	const subject = email.subject || "(no subject)";

	const activate = () => {
		if (suppressClick.current) return;
		if (selectionMode) onToggleCheck(email);
		else onOpen(email);
	};

	const star = (
		<button
			type="button"
			className="shrink-0 flex items-center justify-center h-7 w-7 -m-0.5 rounded-md bg-transparent border-0 cursor-pointer hover:bg-kumo-fill"
			aria-label={email.starred ? "Starred" : "Not starred"}
			aria-pressed={email.starred}
			title={email.starred ? "Starred" : "Not starred"}
			onClick={(e) => {
				e.stopPropagation();
				onToggleStar(email);
			}}
		>
			<StarIcon
				size={16}
				weight={email.starred ? "fill" : "regular"}
				className={email.starred ? "text-[var(--ops-star)]" : "text-kumo-subtle opacity-60 group-hover:opacity-100"}
			/>
		</button>
	);

	const senderLabel = (
		<>
			{isDraftRow && <span className="chip chip-bad shrink-0">Draft</span>}
			<span className="truncate">{highlight(people)}</span>
			{count > 1 && <span className="shrink-0 ops-mono text-[0.6875rem] font-normal text-kumo-subtle">{count}</span>}
			{email.has_draft && !isDraftRow && <span className="chip chip-bad shrink-0">Draft</span>}
		</>
	);

	const awaitingReply = showAwaitingReply && !!email.needs_reply && !unread && !isDraftRow && email.folder_id !== "sent";
	const status = awaitingReply ? (
		<span className="chip chip-warn shrink-0" title="You read this conversation and it has no reply yet">
			Awaiting reply
		</span>
	) : null;
	const unreadMark = (
		<span aria-hidden className={`dot shrink-0 ${unread ? "bg-kumo-brand" : "bg-transparent"}`} />
	);

	const hoverActions = (
		<div className="hidden md:group-hover:flex items-center gap-0.5 shrink-0 -my-1">
			{onUnarchive ? (
				<HoverAction label="Move to Inbox" icon={<TrayIcon size={16} />} onClick={() => onUnarchive(email)} />
			) : (
				onArchive && <HoverAction label="Archive" icon={<ArchiveIcon size={16} />} onClick={() => onArchive(email)} />
			)}
			<HoverAction label="Delete" icon={<TrashIcon size={16} />} onClick={() => onDelete(email)} />
			<HoverAction
				label={unread ? "Mark as read" : "Mark as unread"}
				icon={unread ? <EnvelopeOpenIcon size={16} /> : <EnvelopeSimpleIcon size={16} />}
				onClick={() => onToggleRead(email)}
			/>
		</div>
	);

	const checkbox = (
		<label
			className="shrink-0 flex items-center justify-center h-7 w-7 -m-0.5 rounded-md cursor-pointer hover:bg-kumo-fill"
			onClick={(e) => e.stopPropagation()}
		>
			<input
				type="checkbox"
				checked={isChecked}
				onChange={() => onToggleCheck(email)}
				aria-label={`Select conversation: ${subject}`}
				className="h-[18px] w-[18px] cursor-pointer accent-[var(--color-kumo-brand)]"
			/>
		</label>
	);

	return (
		<div className="relative overflow-hidden">
			{/* Swipe background (touch only) */}
			{active && (
				<div
					className={`absolute inset-0 flex items-center px-6 text-white text-sm font-semibold ${active.className} ${
						offset < 0 ? "justify-end" : "justify-start"
					}`}
				>
					<span className={`flex items-center gap-2 transition-transform ${past ? "scale-110" : "scale-90 opacity-80"}`}>
						{offset > 0 && active.icon}
						{active.label}
						{offset < 0 && active.icon}
					</span>
				</div>
			)}

			<div
				role="button"
				tabIndex={-1}
				data-row-id={email.id}
				data-unread={unread}
				data-checked={isChecked}
				data-selected={isSelected}
				aria-current={isSelected ? "true" : undefined}
				onClick={activate}
				{...handlers}
				style={{
					transform: offset ? `translateX(${offset}px)` : undefined,
					transition: animating ? "transform 180ms ease-out" : undefined,
					touchAction: "pan-y",
				}}
				className={`mail-row group relative w-full text-left cursor-pointer select-none md:select-auto ${
					isFocused ? "md:outline md:outline-2 md:-outline-offset-2 md:outline-[var(--color-kumo-ring)]" : ""
				}`}
			>
				{/* ── Phone layout: avatar + three lines (Gmail app) ── */}
				<div className="flex md:hidden items-start gap-3 pl-4 pr-3 py-2.5 active:bg-black/5">
					<button
						type="button"
						aria-label={isChecked ? "Deselect" : "Select"}
						className="shrink-0 rounded-full border-0 p-0 bg-transparent cursor-pointer mt-0.5"
						onClick={(e) => {
							e.stopPropagation();
							onToggleCheck(email);
						}}
					>
						<Avatar sender={email.sender} checked={isChecked} />
					</button>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<span className={`flex items-center gap-1.5 min-w-0 text-[0.9375rem] ${unread ? "font-semibold text-kumo-default" : "text-kumo-strong"}`}>
								{senderLabel}
							</span>
							<span className={`ml-auto shrink-0 ops-mono tabular text-[0.6875rem] ${unread ? "font-semibold text-kumo-brand" : "text-kumo-subtle"}`}>
								{formatListDate(email.date, hour12)}
							</span>
						</div>
						<div className="flex items-center gap-1.5 mt-px">
							<span className={`truncate text-sm flex-1 min-w-0 ${unread ? "font-semibold text-kumo-default" : "text-kumo-strong"}`}>
								{highlight(subject)}
							</span>
							{email.has_attachment && <PaperclipIcon size={15} className="shrink-0 text-kumo-subtle" />}
						</div>
						<div className="flex items-center gap-2 mt-px">
							{mailboxId && <MailboxLabel mailboxId={mailboxId} />}
							<span className="truncate text-sm text-kumo-subtle flex-1 min-w-0">{highlight(snippet)}</span>
							{star}
						</div>
					</div>
				</div>

				{/* ── Desktop, narrow list next to the reading pane: two lines ── */}
				{compact && (
					<div className="hidden md:flex items-start gap-2.5 pl-2 pr-3 py-[var(--row2-py)] border-b border-kumo-line">
						<div className="flex flex-col items-center gap-1 pt-px">
							{checkbox}
							{star}
						</div>
						<div className="min-w-0 flex-1">
							<div className={`flex items-center gap-2 text-[0.8125rem] ${unread ? "font-semibold text-kumo-default" : "text-kumo-strong"}`}>
								{unreadMark}
								<span className="flex items-center gap-1.5 min-w-0">{senderLabel}</span>
								<span className={`ml-auto shrink-0 ops-mono tabular text-[0.6875rem] group-hover:hidden ${unread ? "text-kumo-default" : "text-kumo-subtle"}`}>{formatListDate(email.date, hour12)}</span>
								{hoverActions}
							</div>
							<div className={`truncate text-[0.8125rem] mt-0.5 pl-4 ${unread ? "font-semibold text-kumo-default" : "text-kumo-default"}`}>
								{highlight(subject)}
							</div>
							<div className="flex items-center gap-2 mt-0.5 pl-4">
								{mailboxId && <MailboxLabel mailboxId={mailboxId} />}
								<span className="truncate text-xs text-kumo-subtle flex-1 min-w-0">{highlight(snippet)}</span>
								{status}
								{email.has_attachment && <PaperclipIcon size={13} className="shrink-0 text-kumo-subtle" />}
							</div>
						</div>
					</div>
				)}

				{/* ── Desktop, full-width list: one grid row per conversation ── */}
				{!compact && (
					<div className="hidden md:flex items-center gap-3 h-[var(--row-h)] pl-2 pr-3 text-[0.8125rem] border-b border-kumo-line">
						<div className="flex items-center gap-1 shrink-0">
							{checkbox}
							{star}
						</div>
						{unreadMark}
						<span
							className={`flex items-center gap-1.5 w-[190px] lg:w-[220px] shrink-0 min-w-0 ${
								unread ? "font-semibold text-kumo-default" : "text-kumo-strong"
							}`}
						>
							{senderLabel}
						</span>
						{mailboxId && <span className="w-[120px] shrink-0 min-w-0 flex"><MailboxLabel mailboxId={mailboxId} /></span>}
						<span className="flex-1 min-w-0 truncate">
							<span className={unread ? "font-semibold text-kumo-default" : "text-kumo-default"}>{highlight(subject)}</span>
							{snippet && <span className="text-kumo-subtle"> — {highlight(snippet)}</span>}
						</span>
						{status}
						{email.has_attachment && <PaperclipIcon size={14} className="shrink-0 text-kumo-subtle group-hover:hidden" />}
						<span
							className={`w-[76px] shrink-0 text-right ops-mono tabular text-[0.6875rem] group-hover:hidden ${
								unread ? "font-semibold text-kumo-default" : "text-kumo-subtle"
							}`}
						>
							{formatListDate(email.date, hour12)}
						</span>
						{hoverActions}
					</div>
				)}
			</div>
		</div>
	);
}

export default memo(EmailListRow);
