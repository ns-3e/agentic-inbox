// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge } from "@cloudflare/kumo";
import { MailboxLabel } from "~/components/EmailListRow";
import { formatListDate, getSnippetText } from "~/lib/utils";
import type { Email } from "~/types";

export function highlightTerms(text: string, query: string): React.ReactNode {
	if (!query || !text) return text;
	const freeText = query.replace(/\b(?:from|to|subject|in|is|has|before|after):"[^"]*"/gi, "").replace(/\b(?:from|to|subject|in|is|has|before|after):\S+/gi, "").trim();
	if (!freeText) return text;
	try {
		const escaped = freeText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const regex = new RegExp(`(${escaped})`, "gi");
		const parts = text.split(regex);
		if (parts.length === 1) return text;
		// Use case-insensitive string comparison instead of regex.test() with g flag,
		// which has stateful lastIndex causing alternating true/false results.
		const lowerEscaped = escaped.toLowerCase();
		return parts.map((part, i) => part.toLowerCase() === lowerEscaped ? <mark key={i} className="bg-kumo-warning-muted text-kumo-default rounded-sm px-0.5">{part}</mark> : part);
	} catch { return text; }
}

const FOLDER_NAMES: Record<string, string> = { inbox: "Inbox", sent: "Sent", draft: "Drafts", archive: "Archive", trash: "Trash" };
function folderDisplayName(name: string | null | undefined): string {
	if (!name) return "";
	return FOLDER_NAMES[name.toLowerCase()] || name;
}

interface SearchResultRowProps {
	email: Email;
	query: string;
	isSelected: boolean;
	isPanelOpen: boolean;
	/** Shown in the unified view so each result says which mailbox it is in. */
	mailboxId?: string;
	onOpen: (email: Email) => void;
}

export default function SearchResultRow({ email, query, isSelected, isPanelOpen, mailboxId, onOpen }: SearchResultRowProps) {
	const snippet = getSnippetText(email.snippet, 120);
	const folderName = (email as Email & { folder_name?: string }).folder_name;
	return (
		<div role="button" tabIndex={0} onClick={() => onOpen(email)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(email); } }} className={`group flex items-center gap-3 w-full text-left cursor-pointer transition-colors border-b border-kumo-line px-4 py-2.5 md:px-5 md:py-3 ${isPanelOpen ? "md:px-4 md:py-2.5" : ""} ${isSelected ? "bg-kumo-tint" : "hover:bg-kumo-tint"}`}>
			<div className="w-2.5 shrink-0 flex justify-center">{!email.read && <div className="h-2 w-2 rounded-full bg-kumo-brand" />}</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2 min-w-0">
					<span className={`truncate text-sm ${!email.read ? "font-semibold text-kumo-default" : "text-kumo-strong"}`}>{highlightTerms(email.sender.split("@")[0], query)}</span>
					{mailboxId && <MailboxLabel mailboxId={mailboxId} />}
					{folderName && <Badge variant="outline">{folderDisplayName(folderName)}</Badge>}
					<span className="text-sm text-kumo-subtle shrink-0 ml-auto">{formatListDate(email.date)}</span>
				</div>
				<div className={`truncate text-sm mt-0.5 ${!email.read ? "font-medium text-kumo-default" : "text-kumo-subtle"}`}>{highlightTerms(email.subject, query)}</div>
				{snippet && <div className="truncate text-xs text-kumo-subtle mt-0.5">{highlightTerms(snippet, query)}</div>}
			</div>
		</div>
	);
}
