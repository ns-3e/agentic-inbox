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
import { displayName } from "~/lib/address";
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
		<span
			title={mailboxId}
			className="shrink-0 max-w-[11rem] truncate rounded px-1.5 py-px text-xs font-medium"
			style={{
				color: `light-dark(hsl(${hue} 60% 32%), hsl(${hue} 70% 78%))`,
				backgroundColor: `light-dark(hsl(${hue} 70% 93%), hsl(${hue} 40% 22%))`,
			}}
		>
			{full ? mailboxId : mailboxId.split("@")[0]}
		</span>
	);
}

/** A swipe gesture on touch screens (Gmail-style). */
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
			className="icon-btn !w-9 !h-9"
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
	const snippet = getSnippetText(email.snippet, 140);
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
			className="shrink-0 flex items-center justify-center h-8 w-8 -m-1 rounded-full bg-transparent border-0 cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
			aria-label={email.starred ? "Starred" : "Not starred"}
			aria-pressed={email.starred}
			title={email.starred ? "Starred" : "Not starred"}
			onClick={(e) => {
				e.stopPropagation();
				onToggleStar(email);
			}}
		>
			<StarIcon
				size={19}
				weight={email.starred ? "fill" : "regular"}
				className={email.starred ? "text-[#f4b400]" : "text-kumo-subtle"}
			/>
		</button>
	);

	const senderLabel = (
		<>
			{isDraftRow && <span className="shrink-0 text-[#c5221f] dark:text-[#f28b82] font-normal">Draft</span>}
			<span className="truncate">{highlight(people)}</span>
			{count > 1 && <span className="shrink-0 text-xs font-normal text-kumo-subtle">{count}</span>}
			{email.has_draft && !isDraftRow && <span className="shrink-0 text-[#c5221f] dark:text-[#f28b82] font-normal">Draft</span>}
		</>
	);

	const hoverActions = (
		<div className="hidden md:group-hover:flex items-center gap-0.5 shrink-0 -my-1">
			{onUnarchive ? (
				<HoverAction label="Move to Inbox" icon={<TrayIcon size={18} />} onClick={() => onUnarchive(email)} />
			) : (
				onArchive && <HoverAction label="Archive" icon={<ArchiveIcon size={18} />} onClick={() => onArchive(email)} />
			)}
			<HoverAction label="Delete" icon={<TrashIcon size={18} />} onClick={() => onDelete(email)} />
			<HoverAction
				label={unread ? "Mark as read" : "Mark as unread"}
				icon={unread ? <EnvelopeOpenIcon size={18} /> : <EnvelopeSimpleIcon size={18} />}
				onClick={() => onToggleRead(email)}
			/>
		</div>
	);

	const checkbox = (
		<label
			className="shrink-0 flex items-center justify-center h-8 w-8 -m-1 rounded-full cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
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
				className={`mail-row group relative w-full text-left cursor-pointer select-none md:select-auto md:border-b md:border-kumo-line ${
					isFocused ? "md:before:absolute md:before:left-0 md:before:inset-y-0 md:before:w-[3px] md:before:bg-kumo-brand md:before:content-['']" : ""
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
							<span className={`flex items-center gap-1.5 min-w-0 text-base ${unread ? "font-bold text-kumo-default" : "text-kumo-strong"}`}>
								{senderLabel}
							</span>
							<span className={`ml-auto shrink-0 text-xs ${unread ? "font-bold text-kumo-default" : "text-kumo-subtle"}`}>
								{formatListDate(email.date)}
							</span>
						</div>
						<div className="flex items-center gap-1.5 mt-px">
							<span className={`truncate text-sm flex-1 min-w-0 ${unread ? "font-bold text-kumo-default" : "text-kumo-strong"}`}>
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
					<div className="hidden md:flex items-start gap-3 pl-3 pr-4 py-2.5">
						<div className="flex flex-col items-center gap-2 pt-0.5">
							{checkbox}
							{star}
						</div>
						<div className="min-w-0 flex-1">
							<div className={`flex items-center gap-2 text-sm ${unread ? "font-bold text-kumo-default" : "text-kumo-strong"}`}>
								<span className="flex items-center gap-1.5 min-w-0">{senderLabel}</span>
								<span className="ml-auto shrink-0 text-xs group-hover:hidden">{formatListDate(email.date)}</span>
								{hoverActions}
							</div>
							<div className={`truncate text-sm mt-0.5 ${unread ? "font-bold text-kumo-default" : "text-kumo-strong"}`}>
								{highlight(subject)}
							</div>
							<div className="flex items-center gap-2 mt-0.5">
								{mailboxId && <MailboxLabel mailboxId={mailboxId} />}
								<span className="truncate text-sm text-kumo-subtle">{highlight(snippet)}</span>
								{email.has_attachment && <PaperclipIcon size={14} className="shrink-0 text-kumo-subtle" />}
							</div>
						</div>
					</div>
				)}

				{/* ── Desktop, full-width list: one line (Gmail web) ── */}
				{!compact && (
					<div className="hidden md:flex items-center gap-3 h-10 pl-3 pr-4 text-sm">
						{checkbox}
						{star}
						<span
							className={`flex items-center gap-1.5 w-[200px] lg:w-[220px] shrink-0 min-w-0 ${
								unread ? "font-bold text-kumo-default" : "text-kumo-strong"
							}`}
						>
							{senderLabel}
						</span>
						{mailboxId && <MailboxLabel mailboxId={mailboxId} />}
						<span className="flex-1 min-w-0 truncate">
							<span className={unread ? "font-bold text-kumo-default" : "text-kumo-default"}>{highlight(subject)}</span>
							{snippet && <span className="text-kumo-subtle"> - {highlight(snippet)}</span>}
						</span>
						{email.has_attachment && <PaperclipIcon size={15} className="shrink-0 text-kumo-subtle group-hover:hidden" />}
						<span
							className={`w-[72px] shrink-0 text-right text-xs group-hover:hidden ${
								unread ? "font-bold text-kumo-default" : "text-kumo-subtle"
							}`}
						>
							{formatListDate(email.date)}
						</span>
						{hoverActions}
					</div>
				)}
			</div>
		</div>
	);
}

export default memo(EmailListRow);
