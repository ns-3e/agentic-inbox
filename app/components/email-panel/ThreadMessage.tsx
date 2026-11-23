// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Tooltip } from "@cloudflare/kumo";
import {
	ArrowBendDoubleUpLeftIcon,
	ArrowBendUpLeftIcon,
	ArrowBendUpRightIcon,
	CaretDownIcon,
	CodeIcon,
	DotsThreeVerticalIcon,
	EnvelopeSimpleIcon,
	PaperclipIcon,
	PencilSimpleIcon,
	StarIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { formatMessageDate, formatListDate } from "shared/dates";
import Avatar from "~/components/Avatar";
import EmailAttachmentList from "~/components/EmailAttachmentList";
import EmailIframe from "~/components/EmailIframe";
import { useHour12 } from "~/hooks/usePreferences";
import Menu from "~/components/Menu";
import { displayName, nameOrMe, parseAddress } from "~/lib/address";
import { formatDetailDate, getNonInlineAttachments, getSnippetText, rewriteInlineImages, splitEmailList } from "~/lib/utils";
import type { Email } from "~/types";

const DELIVERY_LABELS: Record<string, { label: string; variant: "success" | "destructive" | "secondary" | "outline"; hint: string }> = {
	sent: { label: "Sending", variant: "outline", hint: "Accepted by Cloudflare, waiting for the recipient's server." },
	delivered: { label: "Delivered", variant: "success", hint: "The recipient's mail server accepted the message." },
	deferred: { label: "Delayed", variant: "secondary", hint: "Temporary failure. Cloudflare will retry." },
	bounced: { label: "Bounced", variant: "destructive", hint: "The recipient's server rejected the message." },
	failed: { label: "Failed", variant: "destructive", hint: "The message could not be sent." },
	rejected: { label: "Not sent", variant: "destructive", hint: "The recipient is on the suppression list." },
	complained: { label: "Marked as spam", variant: "destructive", hint: "The recipient reported this message as spam." },
};

function DeliveryBadge({ status, detail }: { status?: string | null; detail?: string | null }) {
	const info = status ? DELIVERY_LABELS[status] : undefined;
	if (!info) return null;
	return (
		<Tooltip content={detail ? `${info.hint} ${detail}` : info.hint} side="bottom" asChild>
			<span
				className={`chip ${
					info.variant === "success" ? "chip-ok" : info.variant === "destructive" ? "chip-bad" : info.variant === "secondary" ? "chip-warn" : ""
				}`}
			>
				<span className="h-1.5 w-1.5 rounded-full bg-current" />
				{info.label}
			</span>
		</Tooltip>
	);
}

interface ThreadMessageProps {
	email: Email;
	mailboxId?: string;
	mailboxEmail?: string;
	isDraft?: boolean;
	isSending?: boolean;
	isExpanded: boolean;
	onToggleExpand: () => void;
	onReply: () => void;
	onReplyAll: () => void;
	onForward: () => void;
	onToggleStar: () => void;
	onMarkUnread: () => void;
	onDelete?: () => void;
	onSendDraft?: () => void;
	onEditDraft?: () => void;
	onDeleteDraft?: () => void;
	onViewSource?: () => void;
	onPreviewImage?: (url: string, filename: string) => void;
}

function recipientsSummary(email: Email, self?: string) {
	const all = [...splitEmailList(email.recipient), ...splitEmailList(email.cc)];
	if (!all.length) return "to (no recipients)";
	const names = all.map((r) => nameOrMe(r, self));
	return `to ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}`;
}

function Details({ email }: { email: Email }) {
	const hour12 = useHour12();
	const rows: [string, string][] = [
		["from:", email.sender],
		["to:", email.recipient],
		...(email.cc ? ([["cc:", email.cc]] as [string, string][]) : []),
		...(email.bcc ? ([["bcc:", email.bcc]] as [string, string][]) : []),
		["date:", formatDetailDate(email.date, hour12)],
		["subject:", email.subject || "(no subject)"],
	];
	return (
		<div className="mt-2 mb-1 inline-block max-w-full rounded-md border border-kumo-line bg-kumo-elevated shadow-sm px-3 py-2 text-xs">
			<table className="border-collapse">
				<tbody>
					{rows.map(([k, v]) => (
						<tr key={k}>
							<td className="pr-3 py-0.5 text-right text-kumo-subtle align-top whitespace-nowrap">{k}</td>
							<td className="py-0.5 text-kumo-default break-all">{v}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/**
 * One message in a conversation: collapsed to a one-line
 * summary, or expanded with sender, "to me ▾" details, body and attachments.
 */
export default function ThreadMessage({
	email,
	mailboxId,
	mailboxEmail,
	isDraft,
	isSending,
	isExpanded,
	onToggleExpand,
	onReply,
	onReplyAll,
	onForward,
	onToggleStar,
	onMarkUnread,
	onDelete,
	onSendDraft,
	onEditDraft,
	onDeleteDraft,
	onViewSource,
	onPreviewImage,
}: ThreadMessageProps) {
	const hour12 = useHour12();
	const [showDetails, setShowDetails] = useState(false);
	const sender = parseAddress(email.sender);
	const isSelf = !!mailboxEmail && sender.address.toLowerCase() === mailboxEmail.toLowerCase();
	const name = isDraft ? "Draft" : displayName(email.sender);
	const hasFiles = getNonInlineAttachments(email.attachments).length > 0;

	if (!isExpanded) {
		return (
			<button
				type="button"
				onClick={onToggleExpand}
				className="w-full flex items-center gap-3 px-4 md:px-6 py-3 text-left bg-transparent border-0 border-b border-kumo-line cursor-pointer hover:bg-kumo-tint"
			>
				<Avatar sender={email.sender} size={40} />
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className={`truncate text-sm font-bold ${isDraft ? "text-[var(--ops-bad)]" : "text-kumo-default"}`}>{name}</span>
						<span className="ml-auto flex items-center gap-2 shrink-0 text-xs text-kumo-subtle">
							{hasFiles && <PaperclipIcon size={14} />}
							{formatListDate(email.date, hour12)}
						</span>
					</div>
					<p className="truncate text-sm text-kumo-subtle mt-0.5">{getSnippetText(email.snippet || email.body, 160)}</p>
				</div>
			</button>
		);
	}

	return (
		<div className="border-b border-kumo-line px-4 md:px-6 pt-4 pb-5">
			<div className="flex items-start gap-3">
				<button type="button" onClick={onToggleExpand} className="shrink-0 p-0 border-0 bg-transparent cursor-pointer rounded-full" aria-label="Collapse message">
					<Avatar sender={email.sender} size={40} />
				</button>
				<div className="min-w-0 flex-1">
					<div className="flex items-start gap-2">
						<div className="min-w-0 flex-1 cursor-pointer" onClick={onToggleExpand}>
							<div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0.5">
								<span className={`text-sm font-bold ${isDraft ? "text-[var(--ops-bad)]" : "text-kumo-default"}`}>{name}</span>
								{!isDraft && sender.name && <span className="text-xs text-kumo-subtle truncate">&lt;{sender.address}&gt;</span>}
								{isSelf && !isDraft && <DeliveryBadge status={email.delivery_status} detail={email.delivery_detail} />}
							</div>
						</div>
						<div className="flex items-center shrink-0 -mr-2 -mt-1.5">
							<span className="hidden sm:inline text-xs text-kumo-subtle mr-1 whitespace-nowrap">{formatMessageDate(email.date, undefined, hour12)}</span>
							<span className="sm:hidden text-xs text-kumo-subtle mr-1">{formatListDate(email.date, hour12)}</span>
							{!isDraft && (
								<>
									<button type="button" className="icon-btn hidden md:inline-flex" aria-label={email.starred ? "Starred" : "Not starred"} title={email.starred ? "Starred" : "Not starred"} onClick={onToggleStar}>
										<StarIcon size={18} weight={email.starred ? "fill" : "regular"} className={email.starred ? "text-[var(--ops-star)]" : ""} />
									</button>
									<button type="button" className="icon-btn" aria-label="Reply" title="Reply" onClick={onReply}>
										<ArrowBendUpLeftIcon size={18} />
									</button>
								</>
							)}
							<Menu
								label="More"
								items={
									isDraft
										? [
												...(onEditDraft ? [{ label: "Edit draft", icon: <PencilSimpleIcon size={18} />, onSelect: onEditDraft }] : []),
												...(onDeleteDraft ? [{ label: "Discard draft", icon: <TrashIcon size={18} />, onSelect: onDeleteDraft }] : []),
											]
										: [
												{ label: "Reply", icon: <ArrowBendUpLeftIcon size={18} />, onSelect: onReply },
												{ label: "Reply all", icon: <ArrowBendDoubleUpLeftIcon size={18} />, onSelect: onReplyAll },
												{ label: "Forward", icon: <ArrowBendUpRightIcon size={18} />, onSelect: onForward },
												null,
												{ label: email.starred ? "Remove star" : "Add star", icon: <StarIcon size={18} />, onSelect: onToggleStar },
												{ label: "Mark unread from here", icon: <EnvelopeSimpleIcon size={18} />, onSelect: onMarkUnread },
												...(onDelete ? [{ label: "Delete this message", icon: <TrashIcon size={18} />, onSelect: onDelete }] : []),
												...(onViewSource ? [null, { label: "Show original", icon: <CodeIcon size={18} />, onSelect: onViewSource }] : []),
											]
								}
								trigger={(p) => (
									<button type="button" {...p} className="icon-btn" aria-label="More" title="More">
										<DotsThreeVerticalIcon size={18} weight="bold" />
									</button>
								)}
							/>
						</div>
					</div>
					<button
						type="button"
						onClick={() => setShowDetails((v) => !v)}
						className="flex items-center gap-0.5 p-0 border-0 bg-transparent cursor-pointer text-xs text-kumo-subtle hover:text-kumo-default -mt-1"
						aria-expanded={showDetails}
						aria-label="Show details"
					>
						<span className="truncate max-w-[60vw] md:max-w-md">{recipientsSummary(email, mailboxEmail)}</span>
						<CaretDownIcon size={12} />
					</button>
					{showDetails && <Details email={email} />}
				</div>
			</div>

			<div className="mt-4 md:pl-[52px]">
				<EmailIframe body={rewriteInlineImages(email.body || "", mailboxId || "", email.id, email.attachments)} autoSize />

				{isDraft && (onSendDraft || onEditDraft || onDeleteDraft) && (
					<div className="flex flex-wrap gap-2 mt-4">
						{onEditDraft && (
							<button type="button" onClick={onEditDraft} disabled={isSending} className="btn btn-primary">
								Edit
							</button>
						)}
						{onSendDraft && (
							<button type="button" onClick={onSendDraft} disabled={isSending} className="btn">
								{isSending ? "Sending…" : "Send now"}
							</button>
						)}
						{onDeleteDraft && (
							<button type="button" onClick={onDeleteDraft} disabled={isSending} className="btn btn-ghost">
								Discard
							</button>
						)}
					</div>
				)}

				<EmailAttachmentList
					mailboxId={mailboxId}
					emailId={email.id}
					attachments={email.attachments}
					onPreviewImage={onPreviewImage}
					className="mt-4"
				/>
			</div>
		</div>
	);
}
