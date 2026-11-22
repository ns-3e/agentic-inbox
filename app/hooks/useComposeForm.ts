// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { suggestEmailFix } from "shared/email-typos";
import { snackbar } from "~/hooks/useSnackbar";
import { type ComposeAttachment, type ComposeOptions, type ComposeSnapshot, useUIStore } from "~/hooks/useUIStore";
import { isValidEmail, parseAddress, splitAddresses } from "~/lib/address";
import {
	buildQuotedReplyBlock,
	escapeHtml,
	formatComposeDate,
	getSignatureBlock,
	htmlToPlainText,
	splitEmailList,
	stripHtml,
	toEmailListValue,
} from "~/lib/utils";
import { queryKeys } from "~/queries/keys";
import { useMailbox } from "~/queries/mailboxes";
import api from "~/services/api";
import type { Email, Mailbox } from "~/types";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const AUTOSAVE_MS = 2000;
const UNDO_SEND_MS = 5000;

function getPrefixedSubject(subject: string, prefix: "Re" | "Fwd") {
	const s = subject || "";
	return new RegExp(`^${prefix}:\\s`, "i").test(s) ? s : `${prefix}: ${s}`;
}

function uniqueAdd(list: string[], seen: Set<string>, raw: string, exclude?: string) {
	const t = raw.trim();
	if (!t) return;
	const addr = parseAddress(t).address.toLowerCase();
	if (!addr || addr === exclude || seen.has(addr)) return;
	seen.add(addr);
	list.push(t);
}

/** Reply-all recipients: sender + other To in To, original Cc in Cc, never myself. */
export function buildReplyAllRecipients(original: Pick<Email, "sender" | "recipient" | "cc">, self?: string) {
	const me = self?.toLowerCase();
	const seen = new Set<string>();
	const to: string[] = [];
	uniqueAdd(to, seen, original.sender, me);
	for (const r of splitEmailList(original.recipient)) uniqueAdd(to, seen, r, me);
	const cc: string[] = [];
	for (const r of splitEmailList(original.cc)) uniqueAdd(cc, seen, r, me);
	// Replying to my own message: answer the people I wrote to.
	if (to.length === 0 && original.recipient) for (const r of splitEmailList(original.recipient)) uniqueAdd(to, new Set(), r);
	return { to, cc };
}

function buildForwardBlock(original: Email) {
	const safeBody = escapeHtml(stripHtml(original.body || "")).replace(/\n/g, "<br>");
	return `<br><div>---------- Forwarded message ---------<br>From: ${escapeHtml(original.sender)}<br>Date: ${formatComposeDate(original.date)}<br>Subject: ${escapeHtml(original.subject)}<br>To: ${escapeHtml(original.recipient)}<br><br>${safeBody}</div>`;
}

function initialFields(options: ComposeOptions, mailbox: Mailbox | undefined): ComposeSnapshot {
	if (options.snapshot) return options.snapshot;
	const sig = getSignatureBlock(mailbox?.settings);
	const empty: ComposeSnapshot = { to: [], cc: [], bcc: [], showCcBcc: false, subject: "", body: "", quoteHtml: "", attachments: [] };
	const { draftEmail: draft, originalEmail: original, mode } = options;

	if (draft) {
		const cc = splitEmailList(draft.cc);
		const bcc = splitEmailList(draft.bcc);
		return { ...empty, to: splitEmailList(draft.recipient), cc, bcc, showCcBcc: cc.length + bcc.length > 0, subject: draft.subject || "", body: draft.body || "", draftId: draft.id };
	}
	const sigBlock = sig ? `<p></p>${sig}` : "";
	if (!original) return { ...empty, body: `<p></p>${sigBlock}` };

	if (mode === "forward") {
		return { ...empty, subject: getPrefixedSubject(original.subject, "Fwd"), body: `<p></p>${sigBlock}${buildForwardBlock(original)}` };
	}
	const quoteHtml = buildQuotedReplyBlock(original.date, original.sender, original.body || "");
	if (mode === "reply-all") {
		const { to, cc } = buildReplyAllRecipients(original, mailbox?.email);
		return { ...empty, to, cc, showCcBcc: cc.length > 0, subject: getPrefixedSubject(original.subject, "Re"), body: `<p></p>${sigBlock}`, quoteHtml };
	}
	// reply: answer the sender (or, for my own message, the people I wrote to)
	const self = mailbox?.email?.toLowerCase();
	const fromMe = parseAddress(original.sender).address.toLowerCase() === self;
	const to = fromMe ? splitEmailList(original.recipient) : [original.sender];
	return { ...empty, to, subject: getPrefixedSubject(original.subject, "Re"), body: `<p></p>${sigBlock}`, quoteHtml };
}

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
		r.onerror = () => reject(r.error);
		r.readAsDataURL(file);
	});
}

function invalidateMail(qc: QueryClient, mailboxId: string) {
	qc.invalidateQueries({ queryKey: ["emails", mailboxId] });
	qc.invalidateQueries({ queryKey: queryKeys.folders.list(mailboxId) });
	qc.invalidateQueries({ queryKey: ["search", mailboxId] });
	qc.invalidateQueries({ queryKey: queryKeys.unified.all });
}

const hasContent = (s: ComposeSnapshot, sig: string) =>
	s.to.length + s.cc.length + s.bcc.length > 0 ||
	!!s.subject.trim() ||
	stripHtml(s.body.replace(sig, "")).trim().length > 0;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * State and actions for one open composer. Drafts save automatically
 * (2 s after typing stops, and when the composer closes); Send waits 5 s
 * with an Undo before it goes out.
 */
export function useComposeForm(mailboxId: string | undefined, options: ComposeOptions) {
	const qc = useQueryClient();
	const { data: mailbox } = useMailbox(mailboxId);
	const closeCompose = useUIStore((s) => s.closeCompose);
	const startCompose = useUIStore((s) => s.startCompose);

	const [fields, setFields] = useState<ComposeSnapshot>(() => initialFields(options, mailbox));
	const [pending, setPending] = useState({ to: "", cc: "", bcc: "" });
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<SaveStatus>(options.draftEmail || options.snapshot?.draftId ? "saved" : "idle");
	const [isSending, setIsSending] = useState(false);
	const [initialised, setInitialised] = useState(!!mailbox || !mailboxId);

	// The signature loads with the mailbox; fill the form once it arrives.
	useEffect(() => {
		if (!initialised && mailbox) {
			setFields(initialFields(options, mailbox));
			setInitialised(true);
		}
	}, [initialised, mailbox, options]);

	const sig = useMemo(() => getSignatureBlock(mailbox?.settings), [mailbox]);

	// Refs for save-on-close / unmount, which run outside React's render cycle.
	const latest = useRef({ fields, pending, mailboxId, options });
	latest.current = { fields, pending, mailboxId, options };
	const dirty = useRef(false);
	const done = useRef(false); // sent or discarded: never save again
	const saving = useRef<Promise<void> | null>(null);
	const confirmedTypos = useRef<string | null>(null);

	const update = useCallback((patch: Partial<ComposeSnapshot>) => {
		dirty.current = true;
		setFields((f) => ({ ...f, ...patch }));
	}, []);
	const updatePending = useCallback((key: "to" | "cc" | "bcc", text: string) => {
		dirty.current = true;
		setPending((p) => ({ ...p, [key]: text }));
	}, []);

	/** All recipients including text typed but not yet a chip. */
	const recipients = useCallback((f: ComposeSnapshot, p: typeof pending) => ({
		to: [...f.to, ...splitAddresses(p.to)],
		cc: [...f.cc, ...splitAddresses(p.cc)],
		bcc: [...f.bcc, ...splitAddresses(p.bcc)],
	}), []);

	const saveDraft = useCallback(async (): Promise<boolean> => {
		const { fields: f, pending: p, mailboxId: mbx, options: o } = latest.current;
		if (!mbx || done.current) return false;
		const r = recipients(f, p);
		if (!hasContent({ ...f, ...r }, sig)) return false;
		if (saving.current) await saving.current;
		dirty.current = false;
		const run = (async () => {
			setStatus("saving");
			try {
				const res = await api.saveDraft(mbx, {
					to: r.to.join(", "),
					cc: r.cc.join(", ") || undefined,
					bcc: r.bcc.join(", ") || undefined,
					subject: f.subject,
					body: f.body + (f.quoteHtml || ""),
					in_reply_to: o.originalEmail?.id || o.draftEmail?.in_reply_to || undefined,
					thread_id: o.originalEmail?.thread_id || o.draftEmail?.thread_id || undefined,
					draft_id: latest.current.fields.draftId,
				});
				const newId = res?.id ?? res?.draft_id;
				if (newId && newId !== latest.current.fields.draftId) {
					if (!done.current) useUIStore.getState().setComposeDraftId(newId);
					latest.current.fields = { ...latest.current.fields, draftId: newId };
					setFields((cur) => ({ ...cur, draftId: newId }));
				}
				setStatus("saved");
				invalidateMail(qc, mbx);
			} catch {
				setStatus("error");
				dirty.current = true;
			}
		})();
		saving.current = run;
		await run;
		saving.current = null;
		return true;
	}, [qc, recipients, sig]);

	// Autosave after typing stops.
	useEffect(() => {
		if (!dirty.current || done.current) return;
		const t = setTimeout(() => void saveDraft(), AUTOSAVE_MS);
		return () => clearTimeout(t);
	}, [fields.to, fields.cc, fields.bcc, fields.subject, fields.body, fields.quoteHtml, pending, saveDraft]);

	// Closing any way (✕, Back button, navigating away) saves the draft.
	useEffect(
		() => () => {
			if (!done.current && dirty.current)
				void saveDraft().then((saved) => saved && snackbar.show({ message: "Draft saved" }));
		},
		[saveDraft],
	);

	const close = useCallback(async () => {
		const f = latest.current.fields;
		const wasDirty = dirty.current;
		if (wasDirty) await saveDraft();
		done.current = true;
		closeCompose();
		if (f.attachments.length) snackbar.show({ message: "Draft saved. Attachments are not kept in drafts." });
		else if (wasDirty || f.draftId) snackbar.show({ message: "Draft saved" });
	}, [saveDraft, closeCompose]);

	const discard = useCallback(async () => {
		done.current = true;
		const { mailboxId: mbx } = latest.current;
		if (saving.current) await saving.current;
		const id = latest.current.fields.draftId;
		closeCompose();
		if (mbx && id) {
			await api.deleteEmail(mbx, id).catch(() => {});
			invalidateMail(qc, mbx);
		}
		snackbar.show({ message: "Draft discarded" });
	}, [closeCompose, qc]);

	const addFiles = useCallback(
		(files: File[]) => {
			const cur = latest.current.fields.attachments;
			let total = cur.reduce((n, a) => n + a.file.size, 0);
			const added: ComposeAttachment[] = [];
			for (const file of files) {
				if (total + file.size > MAX_ATTACHMENT_BYTES) {
					snackbar.error(`"${file.name}" is too large. Attachments are limited to 25 MB in total.`);
					continue;
				}
				total += file.size;
				added.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file });
			}
			if (added.length) update({ attachments: [...cur, ...added] });
		},
		[update],
	);
	const removeAttachment = useCallback(
		(id: string) => update({ attachments: latest.current.fields.attachments.filter((a) => a.id !== id) }),
		[update],
	);

	/** Put the quoted text into the editor (Gmail's "•••" in a reply). */
	const expandQuote = useCallback(() => {
		const f = latest.current.fields;
		if (!f.quoteHtml) return "";
		const q = f.quoteHtml;
		// The caller inserts it into the editor, which updates `body`.
		update({ quoteHtml: "" });
		return q;
	}, [update]);

	const send = useCallback(async () => {
		if (isSending) return;
		setError(null);
		const { fields: f, pending: p, mailboxId: mbx, options: o } = latest.current;
		if (!mbx || !mailbox) {
			setError("Choose a mailbox to send from.");
			return;
		}
		const r = recipients(f, p);
		if (r.to.length + r.cc.length + r.bcc.length === 0) {
			setError("Please specify at least one recipient.");
			return;
		}
		const invalid = [...r.to, ...r.cc, ...r.bcc].filter((a) => !isValidEmail(a));
		if (invalid.length) {
			setError(`The address "${invalid[0]}" in the "To" field was not recognized. Please make sure that all addresses are properly formed.`);
			return;
		}
		const all = [...r.to, ...r.cc, ...r.bcc].map((a) => parseAddress(a).address);
		const typos = all.map((a) => ({ a, fix: suggestEmailFix(a) })).filter((t): t is { a: string; fix: string } => !!t.fix);
		const key = all.map((a) => a.toLowerCase()).join(",");
		if (typos.length && confirmedTypos.current !== key) {
			confirmedTypos.current = key;
			setError(`Check the address: ${typos.map((t) => `${t.a} → did you mean ${t.fix}?`).join(" ")} Fix it, or press Send again to send anyway.`);
			return;
		}
		if (!f.subject.trim() && !window.confirm("Send this message without a subject?")) return;

		setIsSending(true);
		let attachments: { content: string; filename: string; type: string; disposition: "attachment" }[] | undefined;
		try {
			attachments = f.attachments.length
				? await Promise.all(
						f.attachments.map(async (a) => ({
							content: await fileToBase64(a.file),
							filename: a.file.name,
							type: a.file.type || "application/octet-stream",
							disposition: "attachment" as const,
						})),
					)
				: undefined;
		} catch {
			setIsSending(false);
			setError("Could not read an attachment.");
			return;
		}

		const fromName = mailbox.settings?.fromName || mailbox.name;
		const from = fromName && fromName !== mailbox.email ? { email: mailbox.email, name: fromName } : mailbox.email;
		const html = f.body + (f.quoteHtml || "");
		const payload = {
			to: toEmailListValue(r.to.map((a) => parseAddress(a).address)),
			cc: toEmailListValue(r.cc.map((a) => parseAddress(a).address)),
			bcc: toEmailListValue(r.bcc.map((a) => parseAddress(a).address)),
			from,
			subject: f.subject,
			html,
			text: htmlToPlainText(html),
			...(attachments ? { attachments } : {}),
		};
		const mode = o.mode;
		const originalId = o.originalEmail?.id || o.draftEmail?.in_reply_to || undefined;
		if (saving.current) await saving.current;
		const snapshot: ComposeSnapshot = { ...latest.current.fields, to: r.to, cc: r.cc, bcc: r.bcc, showCcBcc: f.showCcBcc || r.cc.length + r.bcc.length > 0 };
		done.current = true;
		closeCompose();

		const deliver = async () => {
			try {
				if ((mode === "reply" || mode === "reply-all") && originalId) await api.replyToEmail(mbx, originalId, payload);
				else if (mode === "forward" && originalId) await api.forwardEmail(mbx, originalId, payload);
				else await api.sendEmail(mbx, payload);
				if (snapshot.draftId) await api.deleteEmail(mbx, snapshot.draftId).catch(() => {});
				invalidateMail(qc, mbx);
				snackbar.show({ message: "Message sent" });
			} catch (err) {
				snackbar.error((err as Error).message || "Message not sent.");
				// Bring the message back so nothing is lost.
				startCompose({ ...o, snapshot, inline: false });
			}
		};

		snackbar.show({
			message: "Sending…",
			actionLabel: "Undo",
			duration: UNDO_SEND_MS,
			onAction: () => {
				startCompose({ ...o, snapshot });
				snackbar.show({ message: "Sending undone" });
			},
			onTimeout: () => void deliver(),
		});
	}, [isSending, mailbox, recipients, closeCompose, startCompose, qc]);

	return {
		fields,
		update,
		pending,
		updatePending,
		error,
		setError,
		status,
		isSending,
		initialised,
		mailbox,
		addFiles,
		removeAttachment,
		expandQuote,
		send,
		close,
		discard,
		saveDraft,
		/** Current values (for pop out of an inline reply). */
		snapshot: () => ({ ...latest.current.fields, ...recipients(latest.current.fields, latest.current.pending) }),
	};
}

export type ComposeForm = ReturnType<typeof useComposeForm>;
