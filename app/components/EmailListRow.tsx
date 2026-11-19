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
}: EmailListRowProps) {
	const snippet = getSnippetText(email.snippet);
	const unread = emailHasUnread(email);

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onOpen(email)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen(email);
				}
			}}
			className={`group flex items-center gap-3 w-full text-left cursor-pointer transition-colors border-b border-kumo-line px-4 py-2.5 md:px-6 md:py-3 ${
				isPanelOpen ? "md:px-4 md:py-2.5" : ""
			} ${isSelected ? "bg-kumo-tint" : "hover:bg-kumo-tint"}`}
		>
			{/* Unread dot */}
			<div className="w-2.5 shrink-0 flex justify-center">
				{unread && <div className="h-2 w-2 rounded-full bg-kumo-brand" />}
			</div>

			{/* Star */}
			<button
				type="button"
				className="shrink-0 p-0.5 bg-transparent border-0 cursor-pointer"
				aria-label={email.starred ? "Unstar" : "Star"}
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onToggleStar(email);
				}}
			>
				<StarIcon
					size={16}
					weight={email.starred ? "fill" : "regular"}
					className={
						email.starred
							? "text-kumo-warning"
							: "text-kumo-subtle hover:text-kumo-warning"
					}
				/>
			</button>

			{/* Content */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span
						className={`truncate text-sm ${unread ? "font-semibold text-kumo-default" : "text-kumo-strong"}`}
					>
						{formatParticipants(email)}
					</span>
					{(email.thread_count ?? 1) > 1 && (
						<span className="shrink-0 text-xs text-kumo-subtle bg-kumo-fill rounded-full px-1.5 py-0.5 font-medium">
							{email.thread_count}
						</span>
					)}
					{email.has_draft && (
						<span className="shrink-0 text-xs text-kumo-destructive font-medium">
							Draft
						</span>
					)}
					{email.needs_reply && !email.has_draft && (
						<Tooltip content="Needs reply" asChild>
							<span className="shrink-0 text-kumo-warning">
								<ArrowBendUpLeftIcon size={14} weight="bold" />
							</span>
						</Tooltip>
					)}
					<span className="ml-auto flex items-center gap-2 shrink-0">
						{mailboxId && !isPanelOpen && (
							<span className="hidden sm:inline-flex">
								<MailboxLabel mailboxId={mailboxId} />
							</span>
						)}
						<span className="text-sm text-kumo-subtle">
							{formatListDate(email.date)}
						</span>
					</span>
				</div>
				<div className="flex items-center gap-2 mt-0.5 min-w-0">
					{mailboxId && (
						<span className={isPanelOpen ? "inline-flex" : "inline-flex sm:hidden"}>
							<MailboxLabel mailboxId={mailboxId} />
						</span>
					)}
					<div className="truncate text-sm min-w-0">
						<span
							className={unread ? "font-medium text-kumo-default" : "text-kumo-subtle"}
						>
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

			{/* Hover actions */}
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
	);
}
