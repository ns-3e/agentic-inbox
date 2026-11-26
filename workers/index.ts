// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import PostalMime from "postal-mime";
import { z } from "zod";
import { trySendEmail } from "./email-sender";
import { storeAttachments, type StoredAttachment } from "./lib/attachments";
import {
	resolveSender,
	SenderValidationError,
	generateMessageId,
	buildThreadingHeaders,
	listMailboxes,
	availableDomains,
} from "./lib/email-helpers";
import { SendEmailRequestSchema } from "./lib/schemas";
import { handleReplyEmail, handleForwardEmail } from "./routes/reply-forward";
import { Folders } from "../shared/folders";
import type { Env } from "./types";
import { requireMailbox, type MailboxContext } from "./lib/mailbox";
import {
	BurnerError,
	createBurner,
	deleteBurner,
	getBurner,
	listBurners,
	putBurner,
	recordBurnerHit,
} from "./lib/burners";
import { listCatchAllStatus, setCatchAll, getCatchAllStatus } from "./lib/catchall";
import { applySetup, cloudflareEnabled, CloudflareApiError, getDomainSetup, listZones, routeBurner, workerName } from "./lib/cloudflare";
import { LOCAL_PART_HINT, LOCAL_PART_RE } from "../shared/burners";

type AppContext = Context<MailboxContext>;

// -- Request body schemas (kept for validation) ---------------------

const SetupOptions = z.object({
	/** Also send unknown addresses on the domain to this app. */
	catchAll: z.boolean().optional(),
});

const CreateMailboxBody = z.object({
	email: z.string().email(),
	name: z.string().min(1),
	settings: z.record(z.any()).optional(), // unvalidated — agentSystemPrompt goes straight to AI
	/** Set up Email Routing and Email Sending for the address (needs CF_API_TOKEN). */
	setup: SetupOptions.optional(),
});

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const DraftBody = z.object({
	to: z.string().optional(),
	cc: z.string().optional(),
	bcc: z.string().optional(),
	subject: z.string().optional(),
	body: z.string(),
	in_reply_to: z.string().optional(),
	thread_id: z.string().optional(),
	draft_id: z.string().optional(),
	/** The mailbox address or one of its burners; anything else is ignored. */
	from: z.string().optional(),
});

// -- Helpers --------------------------------------------------------

function slugify(text: string) { // can return "" for non-alphanumeric input
	return text.toString().toLowerCase()
		.replace(/\s+/g, "-").replace(/[^\w-]+/g, "")
		.replace(/--+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
}

function intQuery(c: AppContext, key: string): number | undefined {
	const v = c.req.query(key);
	if (!v) return undefined;
	const n = Number(v);
	return Number.isNaN(n) ? undefined : n;
}

function boolQuery(c: AppContext, key: string): boolean | undefined {
	const v = c.req.query(key);
	if (v === undefined || v === "") return undefined;
	return v === "true" || v === "1";
}

// -- App & middleware -----------------------------------------------

const app = new Hono<MailboxContext>();
app.use("/api/*", cors({
	origin: (origin) => {
		// Same-origin requests have no Origin header — allow them.
		if (!origin) return origin;
		// In development, allow localhost for Vite dev server.
		try {
			const url = new URL(origin);
			if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return origin;
		} catch { /* invalid origin */ }
		// Block all other cross-origin requests. The app is served from the
		// same origin as the API, so legitimate browser requests never send
		// an Origin header. Returning undefined omits Access-Control-Allow-Origin.
		return undefined;
	},
}));
app.use("/api/v1/mailboxes/:mailboxId/*", requireMailbox);

// -- Config ---------------------------------------------------------

app.get("/api/v1/config", async (c) => {
	const domains = await availableDomains(c.env);
	const emailAddresses = c.env.EMAIL_ADDRESSES ?? [];
	return c.json({ domains, emailAddresses, cloudflare: cloudflareEnabled(c.env) });
});

// -- Cloudflare setup (Email Routing + Email Sending) ---------------

function cloudflareError(c: Context, e: unknown) {
	if (e instanceof CloudflareApiError) {
		const status = e.status === 404 ? 404 : e.status === 501 ? 501 : 502;
		return c.json({ error: e.message }, status);
	}
	throw e;
}

/** Zones in the Cloudflare account, for the domain picker. */
app.get("/api/v1/cloudflare/zones", async (c) => {
	if (!cloudflareEnabled(c.env)) return c.json({ enabled: false, worker: workerName(c.env), zones: [] });
	try {
		const zones = await listZones(c.env);
		return c.json({ enabled: true, worker: workerName(c.env), zones: zones.map((z) => z.name) });
	} catch (e) {
		return cloudflareError(c, e);
	}
});

app.get("/api/v1/domains/:domain/setup", async (c) => {
	const domain = c.req.param("domain")!.toLowerCase();
	if (!DOMAIN_RE.test(domain)) return c.json({ error: "Invalid domain" }, 400);
	try {
		return c.json(await getDomainSetup(c.env, domain));
	} catch (e) {
		return cloudflareError(c, e);
	}
});

/** Apply the missing setup steps for a domain, and for one address on it. */
app.post("/api/v1/domains/:domain/setup", async (c) => {
	const domain = c.req.param("domain")!.toLowerCase();
	if (!DOMAIN_RE.test(domain)) return c.json({ error: "Invalid domain" }, 400);
	const body = SetupOptions.extend({ address: z.string().email().optional() }).parse(await c.req.json().catch(() => ({})));
	const address = body.address?.toLowerCase();
	if (address && address.split("@")[1] !== domain) return c.json({ error: `${address} is not on ${domain}` }, 400);
	try {
		return c.json(await applySetup(c.env, domain, { address, catchAll: body.catchAll }));
	} catch (e) {
		return cloudflareError(c, e);
	}
});

// -- Mailboxes ------------------------------------------------------

app.get("/api/v1/mailboxes", async (c) => {
	const allMailboxes = await listMailboxes(c.env.BUCKET);
	return c.json(allMailboxes.map((m) => ({ ...m, name: m.id })));
});

app.post("/api/v1/mailboxes", async (c) => {
	const { name, settings, email: rawEmail, setup } = CreateMailboxBody.parse(await c.req.json());
	const email = rawEmail.toLowerCase();
	const [local, domain = ""] = email.split("@");
	if (!LOCAL_PART_RE.test(local)) return c.json({ error: LOCAL_PART_HINT }, 400);
	const allowedAddresses = (c.env.EMAIL_ADDRESSES ?? []) as string[];
	if (allowedAddresses.length > 0 && !allowedAddresses.map((a) => a.toLowerCase()).includes(email)) {
		return c.json({ error: "Mailbox creation is restricted to configured EMAIL_ADDRESSES" }, 403);
	}
	const key = `mailboxes/${email}.json`;
	if (await c.env.BUCKET.head(key)) return c.json({ error: "Mailbox already exists" }, 409);
	if (await getBurner(c.env.BUCKET, email)) return c.json({ error: "That address is a burner" }, 409);
	const defaultSettings = { fromName: name, forwarding: { enabled: false, email: "" }, signature: { enabled: false, text: "" }, autoReply: { enabled: false, subject: "", message: "" } };
	const finalSettings = { ...defaultSettings, ...settings };
	await c.env.BUCKET.put(key, JSON.stringify(finalSettings));
	const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(email));
	await stub.getFolders();
	const mailbox = { id: email, email, name, settings: finalSettings };
	// The mailbox exists before routing points at it, so no early mail is
	// dropped. A failed step is reported; it can be retried from settings.
	if (setup && cloudflareEnabled(c.env)) {
		try {
			const result = await applySetup(c.env, domain, { address: email, catchAll: setup.catchAll });
			return c.json({ ...mailbox, setup: result }, 201);
		} catch (e) {
			return c.json({ ...mailbox, setupError: (e as Error).message }, 201);
		}
	}
	return c.json(mailbox, 201);
});

app.get("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const obj = await c.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	if (!obj) return c.json({ error: "Not found" }, 404);
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings: await obj.json() });
});

app.put("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const { settings } = (await c.req.json()) as { settings: Record<string, unknown> };
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	await c.env.BUCKET.put(key, JSON.stringify(settings));
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings });
});

app.delete("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	await c.env.BUCKET.delete(key); // TODO: also delete DO data and R2 attachment blobs
	return c.body(null, 204);
});

// -- Unified (all mailboxes) ----------------------------------------

const UNIFIED_CHUNK = 100; // getThreadedEmails caps limit at 100

/**
 * One merged, threaded list across every mailbox. Each mailbox is its own
 * Durable Object, so we fetch the top `page * limit` conversations from each,
 * merge by date, and slice the requested page. Every email is tagged with
 * `mailbox_id` so the client knows which mailbox to act on.
 */
app.get("/api/v1/unified/emails", async (c) => {
	const folder = c.req.query("folder") || Folders.INBOX;
	const page = Math.max(1, Number(c.req.query("page")) || 1);
	const limit = Math.min(Math.max(1, Number(c.req.query("limit")) || 25), 100);
	const need = page * limit;
	const mailboxes = await listMailboxes(c.env.BUCKET);

	const perMailbox = await Promise.allSettled(
		mailboxes.map(async ({ id }) => {
			const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(id)) as any;
			const emails: any[] = [];
			for (let p = 1; emails.length < need; p++) {
				const chunk = await stub.getThreadedEmails({ folder, page: p, limit: UNIFIED_CHUNK });
				emails.push(...chunk);
				if (chunk.length < UNIFIED_CHUNK) break;
			}
			const count: number = await stub.countThreadedEmails(folder);
			return { emails: emails.slice(0, need).map((e) => ({ ...e, mailbox_id: id })), count };
		}),
	);

	let totalCount = 0;
	const merged: any[] = [];
	const failed: string[] = [];
	perMailbox.forEach((r, i) => {
		if (r.status === "fulfilled") {
			totalCount += r.value.count;
			merged.push(...r.value.emails);
		} else {
			failed.push(mailboxes[i].id);
			console.error(`Unified list failed for ${mailboxes[i].id}:`, (r.reason as Error)?.message);
		}
	});
	merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

	return c.json({
		emails: merged.slice((page - 1) * limit, need),
		totalCount,
		mailboxes: mailboxes.map((m) => m.id),
		failed,
	});
});

/**
 * Search every mailbox at once. Accepts the same filters as the per-mailbox
 * search endpoint, merges results newest-first, and tags each with `mailbox_id`.
 */
app.get("/api/v1/unified/search", async (c) => {
	const page = Math.max(1, Number(c.req.query("page")) || 1);
	const limit = Math.min(Math.max(1, Number(c.req.query("limit")) || 25), 100);
	const need = page * limit;
	const bool = (key: string) => {
		const v = c.req.query(key);
		return v === undefined || v === "" ? undefined : v === "true" || v === "1";
	};
	const searchOpts: Record<string, unknown> = {
		query: c.req.query("query") || "", folder: c.req.query("folder"), from: c.req.query("from"),
		to: c.req.query("to"), subject: c.req.query("subject"), date_start: c.req.query("date_start"),
		date_end: c.req.query("date_end"), is_read: bool("is_read"),
		is_starred: bool("is_starred"), has_attachment: bool("has_attachment"),
	};
	const mailboxes = await listMailboxes(c.env.BUCKET);

	const perMailbox = await Promise.allSettled(
		mailboxes.map(async ({ id }) => {
			const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(id)) as any;
			const emails: any[] = [];
			for (let p = 1; emails.length < need; p++) {
				const chunk = await stub.searchEmails({ ...searchOpts, page: p, limit: UNIFIED_CHUNK });
				emails.push(...chunk);
				if (chunk.length < UNIFIED_CHUNK) break;
			}
			const count: number = await stub.countSearchResults(searchOpts);
			return { emails: emails.slice(0, need).map((e) => ({ ...e, mailbox_id: id })), count };
		}),
	);

	let totalCount = 0;
	const merged: any[] = [];
	const failed: string[] = [];
	perMailbox.forEach((r, i) => {
		if (r.status === "fulfilled") {
			totalCount += r.value.count;
			merged.push(...r.value.emails);
		} else {
			failed.push(mailboxes[i].id);
			console.error(`Unified search failed for ${mailboxes[i].id}:`, (r.reason as Error)?.message);
		}
	});
	merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

	return c.json({
		emails: merged.slice((page - 1) * limit, need),
		totalCount,
		mailboxes: mailboxes.map((m) => m.id),
		failed,
	});
});

/** Recipient autocomplete across every mailbox. */
app.get("/api/v1/unified/contacts", async (c) => {
	const q = c.req.query("q") || "";
	const mailboxes = await listMailboxes(c.env.BUCKET);
	const results = await Promise.allSettled(
		mailboxes.map(({ id }) => (c.env.MAILBOX.get(c.env.MAILBOX.idFromName(id)) as any).getContacts(q, 8)),
	);
	const merged = new Map<string, { address: string; name: string; date: string; count: number }>();
	for (const r of results) {
		if (r.status !== "fulfilled") continue;
		for (const contact of r.value as { address: string; name: string; date: string; count: number }[]) {
			const prev = merged.get(contact.address);
			if (!prev || prev.date < contact.date) merged.set(contact.address, contact);
		}
	}
	const own = new Set(mailboxes.map((m) => m.id.toLowerCase()));
	return c.json(
		[...merged.values()]
			.filter((x) => !own.has(x.address))
			.sort((a, b) => (a.date < b.date ? 1 : -1))
			.slice(0, 8),
	);
});

/** Per-mailbox folder unread counts, for the unified sidebar. */
app.get("/api/v1/unified/summary", async (c) => {
	const mailboxes = await listMailboxes(c.env.BUCKET);
	const results = await Promise.allSettled(
		mailboxes.map(async ({ id }) => {
			const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(id));
			const folders = await stub.getFolders();
			return { id, email: id, folders };
		}),
	);
	return c.json(
		results.map((r, i) =>
			r.status === "fulfilled" ? r.value : { id: mailboxes[i].id, email: mailboxes[i].id, folders: [] },
		),
	);
});

// -- Emails ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const folder = c.req.query("folder");
	const thread_id = c.req.query("thread_id");
	const threaded = boolQuery(c, "threaded");
	const page = intQuery(c, "page");
	const limit = intQuery(c, "limit");
	const sortColumn = c.req.query("sortColumn") as any;
	const sortDirection = c.req.query("sortDirection") as "ASC" | "DESC" | undefined;
	const stub = c.var.mailboxStub;

	if (threaded && folder) {
		const emails = await (stub as any).getThreadedEmails({ folder, page, limit });
		const totalCount = await (stub as any).countThreadedEmails(folder);
		return c.json({ emails, totalCount });
	}
	const emails = await stub.getEmails({ folder, thread_id, page, limit, sortColumn, sortDirection });
	if (folder) {
		const totalCount = await stub.countEmails({ folder, thread_id });
		return c.json({ emails, totalCount });
	}
	return c.json(emails);
});

app.post("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const body = SendEmailRequestSchema.parse(await c.req.json());
	const { to, cc, bcc, subject, html, text, attachments, in_reply_to, references, thread_id } = body;

	let toStr: string, fromEmail: string, fromDomain: string, from: typeof body.from;
	try {
		({ toStr, fromEmail, fromDomain, from } = await resolveSender(c.env.BUCKET, to, body.from, mailboxId));
	} catch (e) {
		if (e instanceof SenderValidationError) return c.json({ error: e.message }, 400);
		throw e;
	}

	const { messageId, outgoingMessageId } = generateMessageId(fromDomain);
	const stub = c.var.mailboxStub;
	const rateLimitError = await (stub as any).checkSendRateLimit();
	if (rateLimitError) return c.json({ error: rateLimitError }, 429);
	const delivery = await trySendEmail(c.env.EMAIL, {
		to, cc, bcc, from, subject, html, text,
		attachments: attachments?.map((att) => ({ content: att.content, filename: att.filename, type: att.type, disposition: att.disposition || "attachment", contentId: att.contentId })),
		...(in_reply_to ? { headers: buildThreadingHeaders(in_reply_to, references || []) } : {}),
	});
	if (delivery.error !== undefined) return c.json({ error: delivery.error }, 502);

	const attachmentData = await storeAttachments(c.env.BUCKET, messageId, attachments);

	await stub.createEmail(Folders.SENT, {
		id: messageId, subject, sender: fromEmail, recipient: toStr,
		cc: cc ? (Array.isArray(cc) ? cc.join(", ") : cc).toLowerCase() : null,
		bcc: bcc ? (Array.isArray(bcc) ? bcc.join(", ") : bcc).toLowerCase() : null,
		date: new Date().toISOString(), body: html || text || "",
		in_reply_to: in_reply_to || null, email_references: references ? JSON.stringify(references) : null,
		thread_id: thread_id || in_reply_to || messageId, message_id: outgoingMessageId, delivery_id: delivery.deliveryId,
		raw_headers: JSON.stringify([
			{ key: "from", value: typeof from === "string" ? from : `${from.name} <${from.email}>` },
			{ key: "to", value: Array.isArray(to) ? to.join(", ") : to },
			...(cc ? [{ key: "cc", value: Array.isArray(cc) ? cc.join(", ") : cc }] : []),
			...(bcc ? [{ key: "bcc", value: Array.isArray(bcc) ? bcc.join(", ") : bcc }] : []),
			{ key: "subject", value: subject }, { key: "date", value: new Date().toISOString() },
			{ key: "message-id", value: `<${outgoingMessageId}>` },
		]),
	}, attachmentData);

	return c.json({ id: messageId, status: "sent" }, 201);
});

app.post("/api/v1/mailboxes/:mailboxId/drafts", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const { to, cc, bcc, subject, body, in_reply_to, thread_id, draft_id, from } = DraftBody.parse(await c.req.json());
	const stub = c.var.mailboxStub;
	let sender = mailboxId.toLowerCase();
	const wanted = from?.trim().toLowerCase();
	if (wanted && wanted !== sender) {
		const burner = await getBurner(c.env.BUCKET, wanted);
		if (burner && burner.mailboxId === mailboxId) sender = burner.address;
	}
	if (draft_id) await stub.deleteEmail(draft_id); // not atomic — create-then-delete would be safer
	const messageId = crypto.randomUUID();
	const now = new Date().toISOString();
	await stub.createEmail(Folders.DRAFT, {
		id: messageId, subject: subject || "", sender,
		recipient: (to || "").toLowerCase(), cc: cc?.toLowerCase() || null, bcc: bcc?.toLowerCase() || null,
		date: now, body, in_reply_to: in_reply_to || null, email_references: null,
		thread_id: thread_id || in_reply_to || messageId,
	}, []);
	return c.json({ id: messageId, status: "draft", subject: subject || "", recipient: to || "", date: now }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const email = await c.var.mailboxStub.getEmail(c.req.param("id")!);
	if (!email) return c.json({ error: "Email not found" }, 404);
	return new Response(JSON.stringify(email), {
		headers: { "Content-Type": "application/json" },
	});
});

app.put("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const { read, starred } = (await c.req.json()) as { read?: boolean; starred?: boolean };
	const email = await c.var.mailboxStub.updateEmail(c.req.param("id")!, { read, starred });
	return email ? c.json(email) : c.json({ error: "Email not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const id = c.req.param("id")!;
	const attachments = await c.var.mailboxStub.deleteEmail(id);
	if (attachments === null) return c.json({ error: "Not found" }, 404);
	if (attachments.length > 0) await c.env.BUCKET.delete(attachments.map((att: any) => `attachments/${id}/${att.id}/${att.filename}`));
	return c.body(null, 204);
});

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/move", async (c: AppContext) => {
	const { folderId } = (await c.req.json()) as { folderId: string };
	const success = await c.var.mailboxStub.moveEmail(c.req.param("id")!, folderId);
	return success ? c.json({ status: "moved" }) : c.json({ error: "Folder not found" }, 400);
});

// -- Threads --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/threads/:threadId", async (c: AppContext) => {
	return c.json(await (c.var.mailboxStub as any).getThreadEmails(c.req.param("threadId")!));
});

app.post("/api/v1/mailboxes/:mailboxId/threads/:threadId/read", async (c: AppContext) => {
	await c.var.mailboxStub.markThreadRead(c.req.param("threadId")!);
	return c.json({ status: "marked_read" });
});

// -- Reply / Forward ------------------------------------------------

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/reply", handleReplyEmail);
app.post("/api/v1/mailboxes/:mailboxId/emails/:id/forward", handleForwardEmail);

// -- Folders --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => c.json(await c.var.mailboxStub.getFolders()));

app.post("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => {
	const { name } = (await c.req.json()) as { name: string };
	const slug = slugify(name);
	if (!slug) return c.json({ error: "Folder name must contain alphanumeric characters" }, 400);
	const f = await c.var.mailboxStub.createFolder(slug, name);
	return f ? c.json(f, 201) : c.json({ error: "Folder with this name already exists" }, 409);
});

app.put("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const { name } = (await c.req.json()) as { name: string };
	const f = await c.var.mailboxStub.updateFolder(c.req.param("id")!, name);
	return f ? c.json(f) : c.json({ error: "Folder not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const ok = await c.var.mailboxStub.deleteFolder(c.req.param("id")!);
	return ok ? c.body(null, 204) : c.json({ error: "Folder not found or cannot be deleted" }, 400);
});

// -- Catch-all ------------------------------------------------------

app.get("/api/v1/catchall", async (c) => c.json(await listCatchAllStatus(c.env.BUCKET)));

app.put("/api/v1/catchall/:domain", async (c) => {
	const { mailboxId } = z.object({ mailboxId: z.string().email().nullable() }).parse(await c.req.json());
	try {
		return c.json(await setCatchAll(c.env.BUCKET, c.req.param("domain")!, mailboxId));
	} catch (e) {
		return c.json({ error: (e as Error).message }, 400);
	}
});

// -- Burner addresses -----------------------------------------------

const CreateBurnerBody = z.object({
	label: z.string().max(100).optional(),
	localPart: z.string().max(64).optional(),
	domain: z.string().max(253).optional(),
});

const UpdateBurnerBody = z.object({
	enabled: z.boolean().optional(),
	label: z.string().max(100).optional(),
});

app.get("/api/v1/mailboxes/:mailboxId/burners", async (c: AppContext) => {
	const mailboxId = decodeURIComponent(c.req.param("mailboxId")!);
	return c.json(await listBurners(c.env.BUCKET, mailboxId));
});

app.post("/api/v1/mailboxes/:mailboxId/burners", async (c: AppContext) => {
	const mailboxId = decodeURIComponent(c.req.param("mailboxId")!);
	const body = CreateBurnerBody.parse(await c.req.json().catch(() => ({})));
	try {
		const burner = await createBurner(c.env.BUCKET, mailboxId, body, await availableDomains(c.env));
		const routeWarning = await routeBurner(c.env, burner.address);
		return c.json(routeWarning ? { ...burner, routeWarning } : burner, 201);
	} catch (e) {
		if (e instanceof BurnerError) return c.json({ error: e.message }, e.status);
		throw e;
	}
});

app.patch("/api/v1/mailboxes/:mailboxId/burners/:address", async (c: AppContext) => {
	const mailboxId = decodeURIComponent(c.req.param("mailboxId")!);
	const burner = await getBurner(c.env.BUCKET, decodeURIComponent(c.req.param("address")!));
	if (!burner || burner.mailboxId !== mailboxId) return c.json({ error: "Burner not found" }, 404);
	const { enabled, label } = UpdateBurnerBody.parse(await c.req.json());
	if (enabled !== undefined) burner.enabled = enabled;
	if (label !== undefined) burner.label = label.trim();
	await putBurner(c.env.BUCKET, burner);
	return c.json(burner);
});

app.delete("/api/v1/mailboxes/:mailboxId/burners/:address", async (c: AppContext) => {
	const mailboxId = decodeURIComponent(c.req.param("mailboxId")!);
	const address = decodeURIComponent(c.req.param("address")!);
	const burner = await getBurner(c.env.BUCKET, address);
	if (!burner || burner.mailboxId !== mailboxId) return c.json({ error: "Burner not found" }, 404);
	await deleteBurner(c.env.BUCKET, address);
	return c.body(null, 204);
});

// -- Search ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/contacts", async (c: AppContext) => {
	const contacts = await (c.var.mailboxStub as any).getContacts(c.req.query("q") || "", 8);
	const self = c.req.param("mailboxId")!.toLowerCase();
	return c.json((contacts as { address: string }[]).filter((x) => x.address !== self));
});

app.get("/api/v1/mailboxes/:mailboxId/search", async (c: AppContext) => {
	const searchOpts: Record<string, unknown> = {
		query: c.req.query("query") || "", folder: c.req.query("folder"), from: c.req.query("from"),
		to: c.req.query("to"), subject: c.req.query("subject"), date_start: c.req.query("date_start"),
		date_end: c.req.query("date_end"), is_read: boolQuery(c, "is_read"),
		is_starred: boolQuery(c, "is_starred"), has_attachment: boolQuery(c, "has_attachment"),
	};
	const stub = c.var.mailboxStub as any;
	const emails = await stub.searchEmails({ ...searchOpts, page: intQuery(c, "page"), limit: intQuery(c, "limit") });
	const totalCount = await stub.countSearchResults(searchOpts);
	return c.json({ emails, totalCount });
});

// -- Attachments ----------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId", async (c: AppContext) => {
	const emailId = c.req.param("emailId")!;
	const attachmentId = c.req.param("attachmentId")!;
	const attachment = await c.var.mailboxStub.getAttachment(attachmentId);
	if (!attachment) return c.json({ error: "Attachment not found" }, 404);
	const obj = await c.env.BUCKET.get(`attachments/${emailId}/${attachmentId}/${attachment.filename}`);
	if (!obj) return c.json({ error: "Attachment file not found" }, 404);
	const headers = new Headers();
	headers.set("Content-Type", attachment.mimetype);
	const sanitized = attachment.filename.replace(/[\x00-\x1f"\\]/g, "_");
	headers.set("Content-Disposition", `attachment; filename="${sanitized}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`);
	return new Response(obj.body, { headers });
});

// -- Receive inbound email ------------------------------------------

const MAX_EMAIL_SIZE = 25 * 1024 * 1024;

async function streamToArrayBuffer(stream: ReadableStream, streamSize: number) {
	if (streamSize > MAX_EMAIL_SIZE) throw new Error(`Email too large: ${streamSize} bytes exceeds ${MAX_EMAIL_SIZE} byte limit`);
	if (streamSize <= 0) throw new Error(`Invalid stream size: ${streamSize}`);
	const result = new Uint8Array(streamSize);
	let bytesRead = 0;
	const reader = stream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (bytesRead + value.length > streamSize) { reader.cancel(); throw new Error(`Stream exceeds declared size`); }
		result.set(value, bytesRead);
		bytesRead += value.length;
	}
	return result;
}

type InboundEmail = { raw: ReadableStream; rawSize: number; to?: string; setReject?: (reason: string) => void };

async function receiveEmail(event: InboundEmail, env: Env, ctx: ExecutionContext) {
	// Burner addresses are resolved from the SMTP envelope recipient, so they
	// work even when the burner was only in Bcc. A disabled burner bounces
	// the message before it is read.
	const envelopeTo = event.to?.toLowerCase();
	const burner = envelopeTo ? await getBurner(env.BUCKET, envelopeTo) : null;
	if (burner && !burner.enabled) {
		console.log(`Rejecting email for disabled burner ${burner.address}`);
		ctx.waitUntil(recordBurnerHit(env.BUCKET, burner.address, false).catch(() => {}));
		event.setReject?.("Address does not exist");
		return;
	}

	const rawEmail = await streamToArrayBuffer(event.raw, event.rawSize);
	const parsedEmail = await new PostalMime().parse(rawEmail);

	if (!parsedEmail.to?.length || !parsedEmail.to[0].address) throw new Error("received email with empty to");

	const allowedAddresses = ((env.EMAIL_ADDRESSES ?? []) as string[]).map((a) => a.toLowerCase());
	const allRecipients = parsedEmail.to.map((t) => t.address?.toLowerCase()).filter(Boolean) as string[];
	const ccRecipients = (parsedEmail.cc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];
	const bccRecipients = (parsedEmail.bcc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];

	// Route by the SMTP envelope recipient: it is the address Email Routing
	// delivered to (headers can be forged, and Bcc is not in them). Only mail
	// to the mailbox's own address goes to the Inbox; burners and unknown
	// (catch-all) addresses go to "Other addresses".
	const mailboxExists = async (id: string) => !!(await env.BUCKET.head(`mailboxes/${id}.json`));
	let mailboxId: string | undefined;
	let folder: string = Folders.INBOX;
	if (burner) {
		mailboxId = burner.mailboxId;
		folder = Folders.OTHER;
	} else if (allowedAddresses.length > 0) {
		const candidates = envelopeTo ? [envelopeTo, ...allRecipients] : allRecipients;
		mailboxId = candidates.find((addr) => allowedAddresses.includes(addr));
		if (!mailboxId) { console.log(`Ignoring email: no recipient matches EMAIL_ADDRESSES.`); return; }
	} else if (envelopeTo) {
		if (await mailboxExists(envelopeTo)) {
			mailboxId = envelopeTo;
		} else {
			// One message to several of our addresses arrives once per address.
			// If a real mailbox is also a recipient, it gets its own copy.
			const ourRecipients = [...allRecipients, ...ccRecipients].filter((a) => a !== envelopeTo);
			for (const a of ourRecipients) {
				const receives = (await mailboxExists(a)) || !!(await getBurner(env.BUCKET, a))?.enabled;
				if (receives) { console.log(`Catch-all copy for ${envelopeTo} skipped: ${a} receives it`); return; }
			}
			const catchAll = await getCatchAllStatus(env.BUCKET, envelopeTo.split("@")[1] ?? "");
			if (!catchAll.mailboxId) {
				console.log(`Rejecting email for unknown address ${envelopeTo}: catch-all is off`);
				event.setReject?.("Address does not exist");
				return;
			}
			mailboxId = catchAll.mailboxId;
			folder = Folders.OTHER;
		}
	} else { mailboxId = allRecipients[0]; }
	if (!mailboxId) throw new Error("received email with no valid recipient address");

	const messageId = crypto.randomUUID();
	if (!(await mailboxExists(mailboxId))) { console.log(`Ignoring email for ${mailboxId}: mailbox does not exist`); return; }
	// Show which address the mail was really sent to, even if it was a Bcc.
	const recipientList = envelopeTo && !allRecipients.includes(envelopeTo) ? [...allRecipients, envelopeTo] : allRecipients;

	const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));

	const attachmentData: StoredAttachment[] = [];
	if (parsedEmail.attachments) {
		for (const att of parsedEmail.attachments) {
			const attId = crypto.randomUUID();
			const filename = (att.filename || "untitled").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_");
			await env.BUCKET.put(`attachments/${messageId}/${attId}/${filename}`, att.content);
			attachmentData.push({ id: attId, email_id: messageId, filename, mimetype: att.mimeType,
				size: typeof att.content === "string" ? att.content.length : att.content.byteLength,
				content_id: att.contentId || null, disposition: att.disposition || "attachment" });
		}
	}

	const extractMsgId = (s: string) => { const m = s.match(/<([^>]+)>/); return m ? m[1] : s.trim().split(/\s+/)[0]; };
	const inReplyTo = parsedEmail.inReplyTo ? extractMsgId(parsedEmail.inReplyTo) : null;
	const emailReferences = parsedEmail.references ? parsedEmail.references.split(/\s+/).filter(Boolean).map(extractMsgId) : [];
	let threadId = emailReferences[0] || inReplyTo || messageId;

	// Subject matching is skipped for "Other addresses" mail, so junk cannot
	// join a real Inbox conversation by copying its subject.
	if (!inReplyTo && emailReferences.length === 0 && folder !== Folders.OTHER) {
		const subjectThread = await (stub as any).findThreadBySubject(parsedEmail.subject || "", parsedEmail.from?.address || undefined);
		if (subjectThread) threadId = subjectThread;
	}

	const originalMessageId = parsedEmail.messageId ? extractMsgId(parsedEmail.messageId) : null;

	await stub.createEmail(folder, {
		id: messageId, subject: parsedEmail.subject || "",
		sender: (parsedEmail.from?.address || "").toLowerCase(), recipient: recipientList.join(", "),
		cc: ccRecipients.join(", ") || null, bcc: bccRecipients.join(", ") || null,
		date: new Date().toISOString(), // uses receive time, not the email's Date header
		body: parsedEmail.html || parsedEmail.text || "",
		in_reply_to: inReplyTo, email_references: emailReferences.length > 0 ? JSON.stringify(emailReferences) : null,
		thread_id: threadId, message_id: originalMessageId, raw_headers: JSON.stringify(parsedEmail.headers),
	}, attachmentData);

	// Burner mail is throwaway (sign-ups, receipts): count it. Nothing in
	// "Other addresses" (burner or catch-all) gets an agent draft.
	if (burner) ctx.waitUntil(recordBurnerHit(env.BUCKET, burner.address, true).catch(() => {}));
	if (folder === Folders.OTHER) return;

	const agentStub = env.EMAIL_AGENT.get(env.EMAIL_AGENT.idFromName(mailboxId));
	ctx.waitUntil(agentStub.fetch(new Request("https://agents/onNewEmail", {
		method: "POST", headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ mailboxId, emailId: messageId, sender: (parsedEmail.from?.address || "").toLowerCase(), subject: parsedEmail.subject || "", threadId }),
	})).catch((e) => console.error("Auto-draft trigger failed:", (e as Error).message)));
}

export { app, receiveEmail };
