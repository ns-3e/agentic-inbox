// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Tooltip } from "@cloudflare/kumo";
import {
	ArrowBendUpLeftIcon,
	EnvelopeOpenIcon,
	EnvelopeSimpleIcon,
	StarIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { formatListDate } from "shared/dates";
import { getSnippetText } from "~/lib/utils";
import type { Email } from "~/types";

export function emailHasUnread(email: Email): boolean {
	if (email.thread_unread_count !== undefined) {
		return email.thread_unread_count > 0;
	}
	return !email.read;
}

export function formatParticipants(email: Email): string {
	if (email.participants) {
		const names = email.participants
			.split(",")
			.map((p) => p.trim().split("@")[0])
			.filter((name, idx, arr) => arr.indexOf(name) === idx);
		if (names.length <= 3) return names.join(", ");
		return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
	}
	return email.sender.split("@")[0];
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
			className="shrink-0 max-w-[11rem] truncate rounded px-1.5 py-0.5 text-xs font-medium"
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

interface EmailListRowProps {
	email: Email;
	isSelected: boolean;
	isPanelOpen: boolean;
	/** Shown in the unified view so each row says which mailbox it came from. */
	mailboxId?: string;
	onOpen: (email: Email) => void;
	onToggleStar: (email: Email) => void;
	onToggleRead: (email: Email) => void;
	onDelete: (email: Email) => void;
	/** Finger moves left (reveals the right side). */
	swipeLeft?: SwipeAction;
	/** Finger moves right (reveals the left side). */
	swipeRight?: SwipeAction;
}

const SWIPE_COMMIT_RATIO = 0.35;
const AVATAR_HUES = [210, 340, 150, 28, 270, 190, 0, 95, 245, 315, 50, 170];

function avatarHue(seed: string): number {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
	return AVATAR_HUES[Math.abs(h) % AVATAR_HUES.length];
}

function SenderAvatar({ email }: { email: Email }) {
	const name = formatParticipants(email);
	const seed = (email.sender || name).toLowerCase();
	const hue = avatarHue(seed);
	return (
		<div
			aria-hidden
			className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-[17px] font-semibold text-white select-none"
			style={{ backgroundColor: `hsl(${hue} 55% 48%)` }}
		>
			{(name.trim()[0] || "?").toUpperCase()}
		</div>
	);
}

/** Horizontal swipe handling. Vertical scrolling is left to the browser (touch-action: pan-y). */
function useSwipe(
	email: Email,
	swipeLeft: SwipeAction | undefined,
	swipeRight: SwipeAction | undefined,
) {
	const [offset, setOffset] = useState(0);
	const [animating, setAnimating] = useState(false);
	const start = useRef<{ x: number; y: number } | null>(null);
	const axis = useRef<"x" | "y" | null>(null);
	const width = useRef(0);
	/** Set after a swipe so the trailing click does not open the email. */
	const suppressClick = useRef(false);

	const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
		if (!swipeLeft && !swipeRight) return;
		const t = e.touches[0];
		start.current = { x: t.clientX, y: t.clientY };
		axis.current = null;
		width.current = e.currentTarget.offsetWidth || 1;
		setAnimating(false);
	};

	const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
		if (!start.current) return;
		const t = e.touches[0];
		const dx = t.clientX - start.current.x;
		const dy = t.clientY - start.current.y;
		if (axis.current === null) {
			if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) axis.current = "x";
			else if (Math.abs(dy) > 10) axis.current = "y";
		}
		if (axis.current !== "x") return;
		if ((dx < 0 && !swipeLeft) || (dx > 0 && !swipeRight)) return setOffset(0);
		setOffset(dx);
	};

	const onTouchEnd = () => {
		if (!start.current) return;
		start.current = null;
		if (axis.current !== "x") return;
		suppressClick.current = true;
		setTimeout(() => (suppressClick.current = false), 350);
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
	return { offset, animating, active, past, suppressClick, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } };
}

export default function EmailListRow({
	email,
	isSelected,
	isPanelOpen,
	mailboxId,
	onOpen,
	onToggleStar,
	onToggleRead,
	onDelete,
	swipeLeft,
	swipeRight,
}: EmailListRowProps) {
	const snippet = getSnippetText(email.snippet);
	const unread = emailHasUnread(email);
	const { offset, animating, active, past, suppressClick, handlers } = useSwipe(email, swipeLeft, swipeRight);

	const open = () => {
		if (suppressClick.current) return;
		onOpen(email);
	};

	const star = (
		<button
			type="button"
			className="shrink-0 p-1.5 -m-1.5 md:p-0.5 md:m-0 bg-transparent border-0 cursor-pointer"
			aria-label={email.starred ? "Unstar" : "Star"}
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onToggleStar(email);
			}}
		>
			<StarIcon
				size={18}
				weight={email.starred ? "fill" : "regular"}
				className={
					email.starred
						? "text-kumo-warning"
						: "text-kumo-subtle hover:text-kumo-warning"
				}
			/>
		</button>
	);

	const badges = (
		<>
			{(email.thread_count ?? 1) > 1 && (
				<span className="shrink-0 text-xs text-kumo-subtle bg-kumo-fill rounded-full px-1.5 py-0.5 font-medium">
					{email.thread_count}
				</span>
			)}
			{email.has_draft && (
				<span className="shrink-0 text-xs text-kumo-destructive font-medium">Draft</span>
			)}
			{email.needs_reply && !email.has_draft && (
				<Tooltip content="Needs reply" asChild>
					<span className="shrink-0 text-kumo-warning">
						<ArrowBendUpLeftIcon size={14} weight="bold" />
					</span>
				</Tooltip>
			)}
		</>
	);

	return (
		<div className="relative overflow-hidden border-b border-kumo-line">
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
				tabIndex={0}
				onClick={open}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onOpen(email);
					}
				}}
				{...handlers}
				style={{
					transform: offset ? `translateX(${offset}px)` : undefined,
					transition: animating ? "transform 180ms ease-out" : undefined,
					touchAction: "pan-y",
				}}
				className={`group relative w-full text-left cursor-pointer transition-colors select-none md:select-auto ${
					isSelected ? "bg-kumo-tint" : "bg-kumo-base hover:bg-kumo-tint active:bg-kumo-tint md:active:bg-transparent"
				}`}
			>
				{/* ── Phone layout: avatar + three lines (Gmail-style) ── */}
				<div className="flex md:hidden items-start gap-3 px-4 py-3">
					<SenderAvatar email={email} />
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<span className={`truncate text-[15px] ${unread ? "font-bold text-kumo-default" : "text-kumo-strong"}`}>
								{formatParticipants(email)}
							</span>
							{badges}
							<span className={`ml-auto shrink-0 text-xs ${unread ? "font-bold text-kumo-default" : "text-kumo-subtle"}`}>
								{formatListDate(email.date)}
							</span>
						</div>
						<div className={`truncate text-sm mt-0.5 ${unread ? "font-semibold text-kumo-default" : "text-kumo-strong"}`}>
							{email.subject || "(no subject)"}
						</div>
						<div className="flex items-center gap-2 mt-0.5">
							{mailboxId && <MailboxLabel mailboxId={mailboxId} />}
							<span className="truncate text-sm text-kumo-subtle flex-1 min-w-0">{snippet}</span>
							{star}
						</div>
					</div>
				</div>

				{/* ── Desktop layout ── */}
				<div
					className={`hidden md:flex items-center gap-3 px-6 py-3 ${isPanelOpen ? "md:px-4 md:py-2.5" : ""}`}
				>
					{/* Unread dot */}
					<div className="w-2.5 shrink-0 flex justify-center">
						{unread && <div className="h-2 w-2 rounded-full bg-kumo-brand" />}
					</div>

					{star}

					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className={`truncate text-sm ${unread ? "font-semibold text-kumo-default" : "text-kumo-strong"}`}>
								{formatParticipants(email)}
							</span>
							{badges}
							<span className="ml-auto flex items-center gap-2 shrink-0">
								{mailboxId && !isPanelOpen && <MailboxLabel mailboxId={mailboxId} />}
								<span className="text-sm text-kumo-subtle">{formatListDate(email.date)}</span>
							</span>
						</div>
						<div className="flex items-center gap-2 mt-0.5 min-w-0">
							{mailboxId && isPanelOpen && <MailboxLabel mailboxId={mailboxId} />}
							<div className="truncate text-sm min-w-0">
								<span className={unread ? "font-medium text-kumo-default" : "text-kumo-subtle"}>
									{email.subject}
								</span>
								{snippet && (
									<span className="text-kumo-subtle font-normal">
										{" "}&mdash; {snippet}
									</span>
								)}
							</div>
						</div>
					</div>

					{/* Hover actions (mouse only) */}
					<div className="hidden group-hover:flex items-center shrink-0">
						<Tooltip content={email.read ? "Mark unread" : "Mark read"} asChild>
							<Button
								variant="ghost"
								shape="square"
								size="sm"
								icon={email.read ? <EnvelopeSimpleIcon size={14} /> : <EnvelopeOpenIcon size={14} />}
								onClick={(e) => {
									e.stopPropagation();
									onToggleRead(email);
								}}
								aria-label={email.read ? "Mark unread" : "Mark read"}
							/>
						</Tooltip>
						<Tooltip content="Delete" asChild>
							<Button
								variant="ghost"
								shape="square"
								size="sm"
								icon={<TrashIcon size={14} />}
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									onDelete(email);
								}}
								aria-label="Delete"
							/>
						</Tooltip>
					</div>
				</div>
			</div>
		</div>
	);
}
