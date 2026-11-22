// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface SignatureSettings {
	enabled: boolean;
	text: string;
	html?: string;
}

export interface MailboxSettings {
	fromName?: string;
	forwarding?: { enabled: boolean; email: string };
	signature?: SignatureSettings;
	autoReply?: { enabled: boolean; subject: string; message: string };
	agentSystemPrompt?: string;
}

export interface Mailbox {
	id: string;
	email: string;
	name: string;
	settings?: MailboxSettings;
}

export interface Email {
	id: string;
	thread_id?: string | null;
	folder_id?: string | null;
	subject: string;
	sender: string;
	recipient: string;
	cc?: string;
	bcc?: string;
	date: string;
	read: boolean;
	starred: boolean;
	body?: string | null;
	in_reply_to?: string | null;
	email_references?: string | null;
	message_id?: string | null;
	raw_headers?: string | null;
	/** Delivery tracking for sent mail: sent | delivered | deferred | bounced | failed | rejected | complained */
	delivery_status?: string | null;
	delivery_detail?: string | null;
	attachments?: Attachment[];
	snippet?: string | null;
	// Thread aggregate fields (only present in threaded list view)
	thread_count?: number;
	thread_unread_count?: number;
	participants?: string;
	needs_reply?: boolean;
	has_draft?: boolean;
	has_attachment?: boolean;
	// Present only in the unified (all mailboxes) list
	mailbox_id?: string;
}

export interface Attachment {
	id: string;
	filename: string;
	mimetype: string;
	size: number;
	content_id?: string;
	disposition?: string;
}

export interface Folder {
	id: string;
	name: string;
	unreadCount: number;
}

export interface Burner {
	address: string;
	mailboxId: string;
	label: string;
	enabled: boolean;
	createdAt: string;
	receivedCount: number;
	blockedCount: number;
	lastReceivedAt: string | null;
}

export interface CatchAllStatus {
	domain: string;
	/** The mailbox that collects unknown-address mail; null = rejected. */
	mailboxId: string | null;
	configured: boolean;
	mailboxes: string[];
}

export interface MailboxSummary {
	id: string;
	email: string;
	folders: Folder[];
}

export interface Contact {
	address: string;
	name: string;
	date: string;
	count: number;
}
