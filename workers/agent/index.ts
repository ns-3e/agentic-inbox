// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { AIChatAgent } from "@cloudflare/ai-chat";
import {
	streamText,
	generateText,
	convertToModelMessages,
	stepCountIs,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import type { EmailFull, EmailMetadata } from "../lib/schemas";
import { verifyDraft, isPromptInjection } from "../lib/ai";
import {
	getMailboxStub,
	listMailboxes,
	stripHtmlToText,
	textToHtml,
} from "../lib/email-helpers";
import { UNIFIED_AGENT_NAME } from "../../shared/agents";
import {
	toolListEmails,
	toolGetEmail,
	toolGetThread,
	toolSearchEmails,
	toolDraftReply,
	toolDraftEmail,
	toolMarkEmailRead,
	toolMoveEmail,
	toolDiscardDraft,
	toolListBurners,
	toolCreateBurner,
	toolSetBurnerEnabled,
} from "../lib/tools";
import { Folders, FOLDER_TOOL_DESCRIPTION, MOVE_FOLDER_TOOL_DESCRIPTION } from "../../shared/folders";
import type { Env } from "../types";

// AI SDK v6 changed tool() overloads significantly. We define tools as plain
// objects matching the Tool type to avoid overload resolution issues.
function defineTool(def: {
	description: string;
	parameters: z.ZodType<any>;
	execute: (...args: any[]) => Promise<any>;
}) {
	return {
		description: def.description,
		inputSchema: def.parameters,
		execute: def.execute,
	};
}

/**
 * Default system prompt used when no custom prompt is configured for a mailbox.
 * Users can override this on a per-mailbox basis via the Settings UI.
 */
const DEFAULT_SYSTEM_PROMPT = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.

## Writing Style
Write like a real person. Short, direct, flowing prose. Get to the point. Plain text only - no HTML tags in your replies.

**Formatting rules:**
- Write in natural paragraphs. NO bullet points, NO numbered lists, NO dashes, NO markdown formatting in email drafts.
- NO bold (**), NO italic (*), NO headers (#), NO horizontal rules (---), NO code blocks. Plain text only.
- Links go inline in the text, not on separate lines.
- Don't structure replies like a template or form letter. Just talk normally.

**Agent Behavior Rules (CRITICAL):**
- NEVER output meta-commentary about what you are doing (e.g. do not say "I am drafting a reply to Alex", "I checked the thread", etc).
- When a new email arrives, your ONLY job is to call the \`draft_reply\` tool.
- DO NOT summarize the email. DO NOT explain your actions.
- Output NOTHING except the tool call. If you must output text, it should ONLY be the literal draft text itself if tools fail.
- Before drafting ANY reply, carefully read the full thread history.
- NEVER repeat information that was already shared in a prior message in the thread.
- Your reply should only contain NEW information or directly respond to what the person just said. Move the conversation forward, don't rehash it.

## Who Are You Replying To?
Use the name the person gives in their email body / signature. That's their name - use it. The "from" address is where you send the reply, but the name in the email is how you greet them.

## CRITICAL: Draft Only - Never Send
You can ONLY draft emails. You do NOT have the ability to send emails directly.

- Use draft_reply to draft replies to existing emails
- Use draft_email to draft new outbound emails
- The operator will review and send drafts from the UI - you cannot send them

**CRITICAL: The draft body must contain ONLY the email text.** Never include agent commentary, status messages, meta-notes, markdown formatting, or anything that isn't part of the actual email in the draft body. No "Draft created.", no "---", no "**bold**", no "Here's the draft:", no separators. The body field is the literal email the recipient will read. Everything else goes in your chat message, not in the draft body.

**Don't paste draft contents into the chat.** The drafts are saved via tools - the operator can see them in the Drafts folder. In your chat message, just briefly say what you drafted (e.g. "Drafted a reply to Tim"). Don't duplicate the full email body in the chat.

## Draft Management
Use discard_draft to delete drafts that the operator rejects or that are no longer needed.`;

/**
 * Fetch the custom system prompt for a mailbox from its R2 settings.
 * Falls back to DEFAULT_SYSTEM_PROMPT if none is configured.
 */
async function getSystemPrompt(env: Env, mailboxId: string): Promise<string> {
	try {
		const key = `mailboxes/${mailboxId}.json`;
		const obj = await env.BUCKET.get(key);
		if (obj) {
			const settings = await obj.json<Record<string, unknown>>();
			if (typeof settings.agentSystemPrompt === "string" && settings.agentSystemPrompt.trim()) {
				return settings.agentSystemPrompt;
			}
		}
	} catch {
		// Fall through to default
	}
	return DEFAULT_SYSTEM_PROMPT;
}

function createEmailTools(env: Env, mailboxId: string) {
	return {
		list_emails: defineTool({
			description:
				"List emails in a folder. Returns email metadata (id, subject, sender, recipient, date, read/starred status, thread_id). Use folder='inbox' for received emails, 'sent' for sent emails.",
			parameters: z.object({
				folder: z
					.string()
					.default(Folders.INBOX)
					.describe(FOLDER_TOOL_DESCRIPTION),
				limit: z
					.number()
					.default(20)
					.describe("Maximum number of emails to return"),
				page: z
					.number()
					.default(1)
					.describe("Page number for pagination"),
			}),
			execute: async ({ folder, limit, page }): Promise<unknown> => {
				return toolListEmails(env, mailboxId, { folder, limit, page });
			},
		}),

		get_email: defineTool({
			description:
				"Get a single email with its full body content and attachments. Use this to read the actual content of an email.",
			parameters: z.object({
				emailId: z.string().describe("The email ID to retrieve"),
			}),
			execute: async ({ emailId }): Promise<unknown> => {
				return toolGetEmail(env, mailboxId, emailId);
			},
		}),

		get_thread: defineTool({
			description:
				"Get all emails in a conversation thread. This is essential for understanding the full context of a conversation before drafting a response. Returns all messages sorted chronologically.",
			parameters: z.object({
				threadId: z
					.string()
					.describe(
						"The thread_id to retrieve all messages for. Get this from an email's thread_id field.",
					),
			}),
			execute: async ({ threadId }): Promise<unknown> => {
				return toolGetThread(env, mailboxId, threadId);
			},
		}),

		search_emails: defineTool({
			description:
				"Search for emails matching a query across subject and body fields.",
			parameters: z.object({
				query: z
					.string()
					.describe(
						"Search query to match against subject and body",
					),
				folder: z
					.string()
					.optional()
					.describe("Optional folder to restrict search to"),
			}),
			execute: async ({ query, folder }): Promise<unknown> => {
				return toolSearchEmails(env, mailboxId, { query, folder });
			},
		}),

		draft_email: defineTool({
			description:
				"Draft a new email (not a reply) and save it to the Drafts folder. This does NOT send — it saves a draft for the operator to review. Use this for composing new outbound emails. Write the body as plain text — no HTML tags.",
			parameters: z.object({
				to: z.string().email().describe("Recipient email address"),
				subject: z
					.string()
					.describe("Subject line"),
				body: z
					.string()
					.describe(
						"The plain text body of the email. No HTML — just write normally.",
					),
			}),
			execute: async ({ to, subject, body }): Promise<unknown> => {
				return toolDraftEmail(env, mailboxId, {
					to,
					subject,
					body,
					isPlainText: true,
				});
			},
		}),

		draft_reply: defineTool({
			description:
				"Draft a reply to an existing email and save it to the Drafts folder. This does NOT send — it saves a draft for the operator to review and send from the UI. Write the body as plain text — no HTML tags.",
			parameters: z.object({
				originalEmailId: z
					.string()
					.describe("The ID of the email being replied to"),
				to: z.string().email().describe("Recipient email address"),
				subject: z
					.string()
					.describe("Subject line (usually 'Re: ...')"),
				body: z
					.string()
					.describe(
						"The plain text body of the reply. No HTML — just write normally.",
					),
			}),
			execute: async ({ originalEmailId, to, subject, body }): Promise<unknown> => {
				return toolDraftReply(env, mailboxId, {
					originalEmailId,
					to,
					subject,
					body,
					isPlainText: true,
					runVerifyDraft: true,
				});
			},
		}),

		mark_email_read: defineTool({
			description: "Mark an email as read or unread.",
			parameters: z.object({
				emailId: z.string().describe("The email ID"),
				read: z
					.boolean()
					.describe("true to mark as read, false for unread"),
			}),
			execute: async ({ emailId, read }): Promise<unknown> => {
				return toolMarkEmailRead(env, mailboxId, emailId, read);
			},
		}),

		move_email: defineTool({
			description:
				"Move an email to a different folder (inbox, sent, draft, archive, trash).",
			parameters: z.object({
				emailId: z.string().describe("The email ID"),
				folderId: z
					.string()
					.describe(MOVE_FOLDER_TOOL_DESCRIPTION),
			}),
			execute: async ({ emailId, folderId }): Promise<unknown> => {
				return toolMoveEmail(env, mailboxId, emailId, folderId);
			},
		}),

		discard_draft: defineTool({
			description:
				"Delete a draft email. Use this to discard drafts that are no longer needed or were rejected by the operator.",
			parameters: z.object({
				draftId: z.string().describe("The ID of the draft to delete"),
			}),
			execute: async ({ draftId }): Promise<unknown> => {
				return toolDiscardDraft(env, mailboxId, draftId);
			},
		}),
	};
}

// ── Unified (all mailboxes) agent ──────────────────────────────────

const UNIFIED_LIST_CAP = 50;

const mailboxParam = z
	.string()
	.describe(
		"The mailbox address this email belongs to, e.g. 'info@example.com'. Use the `mailbox` field from list_emails or search_emails results.",
	);

const optionalMailboxParam = z
	.string()
	.optional()
	.describe(
		"Optional mailbox address to restrict to. Omit to cover every mailbox.",
	);

function sortNewestFirst<T extends { date?: string }>(rows: T[]): T[] {
	return rows.sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : (a.date ?? "") > (b.date ?? "") ? -1 : 0));
}

/**
 * Tools for the "All inboxes" agent. Mailbox-specific actions take a
 * `mailbox` argument and delegate to the per-mailbox tools (so all the same
 * safeguards apply); list/search fan out across every mailbox when no
 * mailbox is given, and tag each result with the mailbox it came from.
 */
function createUnifiedEmailTools(env: Env, mailboxIds: string[]) {
	const known = new Set(mailboxIds.map((m) => m.toLowerCase()));
	const resolve = (mailbox: string): string => {
		const id = mailbox.trim().toLowerCase();
		if (!known.has(id)) {
			throw new Error(`Unknown mailbox "${mailbox}". Valid mailboxes: ${mailboxIds.join(", ")}`);
		}
		return id;
	};
	const perMailbox = (mailbox: string) => createEmailTools(env, resolve(mailbox));
	const tagged = async (mailbox: string, run: () => Promise<unknown>) => {
		const result = await run();
		return result && typeof result === "object" && !Array.isArray(result)
			? { ...(result as object), mailbox }
			: { result, mailbox };
	};
	const fanOut = async (
		mailbox: string | undefined,
		fetchOne: (id: string) => Promise<unknown>,
		cap: number,
	) => {
		const ids = mailbox ? [resolve(mailbox)] : mailboxIds;
		const settled = await Promise.allSettled(ids.map(fetchOne));
		const rows: any[] = [];
		const failed: string[] = [];
		settled.forEach((r, i) => {
			if (r.status === "fulfilled" && Array.isArray(r.value)) {
				rows.push(...r.value.map((e: any) => ({ ...e, mailbox: ids[i] })));
			} else if (r.status === "rejected") {
				failed.push(ids[i]);
			}
		});
		const emails = sortNewestFirst(rows).slice(0, cap);
		return failed.length ? { emails, failed_mailboxes: failed } : emails;
	};

	return {
		list_mailboxes: defineTool({
			description: "List every mailbox (email address) the operator has, with unread counts per folder.",
			parameters: z.object({}),
			execute: async (): Promise<unknown> => {
				const settled = await Promise.allSettled(
					mailboxIds.map(async (id) => {
						const folders = await getMailboxStub(env, id).getFolders();
						const unread = Object.fromEntries(
							folders.filter((f: any) => f.unreadCount > 0).map((f: any) => [f.id, f.unreadCount]),
						);
						return { mailbox: id, unread };
					}),
				);
				return settled.map((r, i) =>
					r.status === "fulfilled" ? r.value : { mailbox: mailboxIds[i], error: "unavailable" },
				);
			},
		}),

		list_emails: defineTool({
			description:
				"List emails in a folder across ALL mailboxes (newest first), or in one mailbox if `mailbox` is given. Each result includes a `mailbox` field naming the mailbox it belongs to.",
			parameters: z.object({
				mailbox: optionalMailboxParam,
				folder: z.string().default(Folders.INBOX).describe(FOLDER_TOOL_DESCRIPTION),
				limit: z.number().default(20).describe("Maximum number of emails to return in total"),
			}),
			execute: async ({ mailbox, folder, limit }): Promise<unknown> => {
				const cap = Math.min(Math.max(limit ?? 20, 1), UNIFIED_LIST_CAP);
				return fanOut(mailbox, (id) => toolListEmails(env, id, { folder, limit: cap, page: 1 }), cap);
			},
		}),

		search_emails: defineTool({
			description:
				"Search emails by subject, body, sender and recipients across ALL mailboxes, or in one mailbox if `mailbox` is given. Each result includes a `mailbox` field.",
			parameters: z.object({
				query: z.string().describe("Search query"),
				mailbox: optionalMailboxParam,
				folder: z.string().optional().describe("Optional folder to restrict search to"),
			}),
			execute: async ({ query, mailbox, folder }): Promise<unknown> => {
				return fanOut(mailbox, (id) => toolSearchEmails(env, id, { query, folder }), UNIFIED_LIST_CAP);
			},
		}),

		get_email: defineTool({
			description: "Get a single email with its full body content and attachments.",
			parameters: z.object({ mailbox: mailboxParam, emailId: z.string().describe("The email ID") }),
			execute: async ({ mailbox, emailId }): Promise<unknown> =>
				tagged(resolve(mailbox), () => perMailbox(mailbox).get_email.execute({ emailId })),
		}),

		get_thread: defineTool({
			description:
				"Get all emails in a conversation thread. Read this before drafting a reply.",
			parameters: z.object({
				mailbox: mailboxParam,
				threadId: z.string().describe("The thread_id from an email"),
			}),
			execute: async ({ mailbox, threadId }): Promise<unknown> =>
				tagged(resolve(mailbox), () => perMailbox(mailbox).get_thread.execute({ threadId })),
		}),

		draft_email: defineTool({
			description:
				"Draft a new email (not a reply) from the given mailbox and save it to that mailbox's Drafts folder. Does NOT send. Plain text body only.",
			parameters: z.object({
				mailbox: mailboxParam.describe("The mailbox to send from"),
				to: z.string().email().describe("Recipient email address"),
				subject: z.string().describe("Subject line"),
				body: z.string().describe("The plain text body of the email"),
			}),
			execute: async ({ mailbox, ...args }): Promise<unknown> =>
				tagged(resolve(mailbox), () => perMailbox(mailbox).draft_email.execute(args)),
		}),

		draft_reply: defineTool({
			description:
				"Draft a reply to an existing email and save it to the Drafts folder of the mailbox that received the email. Does NOT send. Plain text body only.",
			parameters: z.object({
				mailbox: mailboxParam,
				originalEmailId: z.string().describe("The ID of the email being replied to"),
				to: z.string().email().describe("Recipient email address"),
				subject: z.string().describe("Subject line (usually 'Re: ...')"),
				body: z.string().describe("The plain text body of the reply"),
			}),
			execute: async ({ mailbox, ...args }): Promise<unknown> =>
				tagged(resolve(mailbox), () => perMailbox(mailbox).draft_reply.execute(args)),
		}),

		mark_email_read: defineTool({
			description: "Mark an email as read or unread.",
			parameters: z.object({
				mailbox: mailboxParam,
				emailId: z.string().describe("The email ID"),
				read: z.boolean().describe("true to mark as read, false for unread"),
			}),
			execute: async ({ mailbox, ...args }): Promise<unknown> =>
				tagged(resolve(mailbox), () => perMailbox(mailbox).mark_email_read.execute(args)),
		}),

		move_email: defineTool({
			description: "Move an email to a different folder (inbox, sent, draft, archive, trash).",
			parameters: z.object({
				mailbox: mailboxParam,
				emailId: z.string().describe("The email ID"),
				folderId: z.string().describe(MOVE_FOLDER_TOOL_DESCRIPTION),
			}),
			execute: async ({ mailbox, ...args }): Promise<unknown> =>
				tagged(resolve(mailbox), () => perMailbox(mailbox).move_email.execute(args)),
		}),

		discard_draft: defineTool({
			description: "Delete a draft email that is no longer needed.",
			parameters: z.object({
				mailbox: mailboxParam,
				draftId: z.string().describe("The ID of the draft to delete"),
			}),
			execute: async ({ mailbox, ...args }): Promise<unknown> =>
				tagged(resolve(mailbox), () => perMailbox(mailbox).discard_draft.execute(args)),
		}),
	};
}

/**
 * Burner address tools. Given to the chat agent only, never to the
 * auto-draft run in handleNewEmail: that run reads untrusted inbound mail,
 * and an email must not be able to make the agent create or switch burners,
 * or pick which address a new email goes out from. The draft_email here
 * replaces the base one and adds an optional burner `from`.
 * `resolve` maps the optional `mailbox` argument to a mailbox ID.
 */
function createBurnerTools(env: Env, resolve: (mailbox?: string) => string, unified: boolean) {
	const mailboxArg: z.ZodRawShape = unified
		? { mailbox: z.string().describe("The mailbox that owns the burner (exact address)") }
		: {};
	return {
		list_burners: defineTool({
			description:
				"List burner (throwaway) addresses, with label, on/off state, and received/blocked counts.",
			parameters: z.object({ ...mailboxArg }),
			execute: async ({ mailbox }: { mailbox?: string }): Promise<unknown> =>
				toolListBurners(env, resolve(mailbox)),
		}),
		create_burner: defineTool({
			description:
				"Create a burner (throwaway) address for sign-ups, trials, or other one-off sites. Mail to it arrives in the Inbox. Omit localPart for a random name. Tell the operator the new address.",
			parameters: z.object({
				...mailboxArg,
				label: z.string().max(100).optional().describe("What the burner is for, e.g. 'Shoe store sign-up'"),
				localPart: z
					.string()
					.max(64)
					.optional()
					.describe("Optional custom name before the @ (letters, numbers, dots, dashes, underscores)"),
				domain: z
					.string()
					.optional()
					.describe("Optional domain after the @. Must be the mailbox's domain or a configured domain. Omit for the mailbox's domain."),
			}),
			execute: async ({ mailbox, label, localPart, domain }: { mailbox?: string; label?: string; localPart?: string; domain?: string }): Promise<unknown> =>
				toolCreateBurner(env, resolve(mailbox), { label, localPart, domain }),
		}),
		draft_email: defineTool({
			description:
				"Draft a new email (not a reply) and save it to the Drafts folder. Does NOT send; the operator reviews it. Plain text body only. To send from a burner address (sign-ups, one-off sites, or when the operator asks), pass `from`; create_burner first if needed.",
			parameters: z.object({
				...mailboxArg,
				to: z.string().email().describe("Recipient email address"),
				subject: z.string().describe("Subject line"),
				body: z.string().describe("The plain text body of the email. No HTML."),
				from: z
					.string()
					.optional()
					.describe("Optional: one of the mailbox's active burner addresses. Omit to use the mailbox's own address."),
			}),
			execute: async ({ mailbox, to, subject, body, from }: { mailbox?: string; to: string; subject: string; body: string; from?: string }): Promise<unknown> => {
				const id = resolve(mailbox);
				const result = await toolDraftEmail(env, id, { to, subject, body, from, isPlainText: true });
				return unified ? { ...result, mailbox: id } : result;
			},
		}),
		set_burner_enabled: defineTool({
			description: "Turn a burner address on or off. While off, mail to it bounces. Reversible.",
			parameters: z.object({
				...mailboxArg,
				address: z.string().describe("The full burner address"),
				enabled: z.boolean().describe("true to turn on, false to turn off"),
			}),
			execute: async ({ mailbox, address, enabled }: { mailbox?: string; address: string; enabled: boolean }): Promise<unknown> =>
				toolSetBurnerEnabled(env, resolve(mailbox), address, enabled),
		}),
	};
}

function getUnifiedSystemPrompt(mailboxIds: string[]): string {
	return `${DEFAULT_SYSTEM_PROMPT}

## Multiple Mailboxes
You are working in the operator's "All inboxes" view. You manage these ${mailboxIds.length} mailboxes for the same operator:
${mailboxIds.map((m) => `- ${m}`).join("\n")}

- list_emails and search_emails cover every mailbox when you omit \`mailbox\`. Each result has a \`mailbox\` field.
- Every other tool needs the \`mailbox\` argument. Always pass the exact \`mailbox\` value from the result you are acting on. Email IDs are only valid inside their own mailbox.
- Reply from the mailbox that received the email. For a new email, ask which mailbox to send from if the operator did not say.
- When you mention an email in chat, say which mailbox it is in.
- Use list_mailboxes to see unread counts per mailbox.`;
}

// Use `any` for the Env generic to avoid type conflicts between the custom
// SEND_EMAIL binding shape and the AIChatAgent constraint.  The actual env
// is fully typed inside the tools via the closure.
export class EmailAgent extends AIChatAgent<any> {
	async onChatMessage(onFinish: any) {
		const env = this.env as Env;
		const mailboxId = this.name;
		const workersai = createWorkersAI({ binding: env.AI });
		let tools: Record<string, ReturnType<typeof defineTool>>;
		let systemPrompt: string;
		if (mailboxId === UNIFIED_AGENT_NAME) {
			const mailboxIds = (await listMailboxes(env.BUCKET)).map((m) => m.id);
			const known = new Set(mailboxIds.map((m) => m.toLowerCase()));
			const resolve = (mailbox?: string) => {
				const id = (mailbox ?? "").trim().toLowerCase();
				if (!known.has(id)) throw new Error(`Unknown mailbox "${mailbox}". Valid mailboxes: ${mailboxIds.join(", ")}`);
				return id;
			};
			tools = { ...createUnifiedEmailTools(env, mailboxIds), ...createBurnerTools(env, resolve, true) };
			systemPrompt = getUnifiedSystemPrompt(mailboxIds);
		} else {
			tools = { ...createEmailTools(env, mailboxId), ...createBurnerTools(env, () => mailboxId, false) };
			systemPrompt = await getSystemPrompt(env, mailboxId);
		}

		const result = streamText({
			model: workersai("@cf/moonshotai/kimi-k2.5"),
			system: systemPrompt,
			messages: await convertToModelMessages(this.messages),
			tools,
			stopWhen: stepCountIs(5),
			onFinish,
		});

		return result.toUIMessageStreamResponse();
	}

	/**
	 * Handle HTTP requests to the agent DO. Intercepts /onNewEmail
	 * before passing to the default AIChatAgent handler.
	 */
	async onRequest(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/onNewEmail" && request.method === "POST") {
			try {
				const emailData = await request.json() as {
					mailboxId: string;
					emailId: string;
					sender: string;
					subject: string;
					threadId: string;
				};
				const result = await this.handleNewEmail(emailData);
				return new Response(JSON.stringify(result), {
					headers: { "Content-Type": "application/json" },
				});
			} catch (e) {
				console.error("onNewEmail handler failed:", (e as Error).message);
				return new Response(
					JSON.stringify({ error: (e as Error).message }),
					{ status: 500, headers: { "Content-Type": "application/json" } },
				);
			}
		}
		return super.onRequest(request);
	}

	/**
	 * Called when a new email arrives. Reads it, loads the thread,
	 * drafts a response, and saves it to the Drafts folder.
	 */
	async handleNewEmail(emailData: {
		mailboxId: string;
		emailId: string;
		sender: string;
		subject: string;
		threadId: string;
	}) {
		const env = this.env as Env;
		const workersai = createWorkersAI({ binding: env.AI });
		const tools = createEmailTools(env, emailData.mailboxId);
		const systemPrompt = await getSystemPrompt(env, emailData.mailboxId);

		// Pre-read the email and thread so the agent has full context
		// without needing to waste tool calls discovering it
		const stub = getMailboxStub(env, emailData.mailboxId);

		let emailBody = "";
		let threadContext = "";
		try {
			const email = (await stub.getEmail(emailData.emailId)) as EmailFull | null;
			if (email?.body) {
				const isInjection = await isPromptInjection(env.AI, email.body);
				if (isInjection) {
					console.warn("Skipping auto-draft due to detected prompt injection:", emailData.emailId);
					
					// Log to agent chat so the user knows why it skipped
					const newMessages = [
						{
							id: crypto.randomUUID(),
							role: "user" as const,
							content: `[Auto-triggered] New email from ${emailData.sender}: "${emailData.subject}"`,
							createdAt: new Date(),
							parts: [{ type: "text" as const, text: `[Auto-triggered] New email from ${emailData.sender}: "${emailData.subject}"` }],
						},
						{
							id: crypto.randomUUID(),
							role: "assistant" as const,
							content: "⚠️ Blocked auto-draft creation: the email appears to contain prompt injection or malicious instructions.",
							createdAt: new Date(),
							parts: [{ type: "text" as const, text: "⚠️ Blocked auto-draft creation: the email appears to contain prompt injection or malicious instructions." }],
						},
					];
					await this.persistMessages([...this.messages, ...newMessages]);
					
					return;
				}
				
				emailBody = stripHtmlToText(email.body);
			}

		// Load thread for conversation context
		const threadEmails = (await stub.getEmails({ thread_id: emailData.threadId })) as EmailMetadata[];
		if (threadEmails.length > 1) {
			const fullThread = await Promise.all(
				threadEmails.map(async (e) => {
					const full = (await stub.getEmail(e.id)) as EmailFull | null;
					const text = full?.body ? stripHtmlToText(full.body) : "";
					return { id: e.id, sender: e.sender, recipient: e.recipient, subject: e.subject, date: e.date, folder_id: e.folder_id, body_text: text };
				}),
			);
			fullThread.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
			threadContext = fullThread
				.map((e) => `[${e.date}] ${e.sender} → ${e.recipient} (${e.folder_id}): ${e.body_text.substring(0, 500)}`)
				.join("\n\n");

			// Scan thread context for prompt injection too -- an attacker
			// could plant an injection in an earlier email in the thread
			// that gets included in the agent's prompt.
			if (threadContext) {
				const threadInjection = await isPromptInjection(env.AI, threadContext);
				if (threadInjection) {
					console.warn("Skipping auto-draft due to prompt injection in thread context:", emailData.threadId);
					const newMessages = [
						{
							id: crypto.randomUUID(),
							role: "user" as const,
							content: `[Auto-triggered] New email from ${emailData.sender}: "${emailData.subject}"`,
							createdAt: new Date(),
							parts: [{ type: "text" as const, text: `[Auto-triggered] New email from ${emailData.sender}: "${emailData.subject}"` }],
						},
						{
							id: crypto.randomUUID(),
							role: "assistant" as const,
							content: "Blocked auto-draft creation: the thread context appears to contain prompt injection or malicious instructions.",
							createdAt: new Date(),
							parts: [{ type: "text" as const, text: "Blocked auto-draft creation: the thread context appears to contain prompt injection or malicious instructions." }],
						},
					];
					await this.persistMessages([...this.messages, ...newMessages]);
					return;
				}
			}
		}
		} catch (e) {
			console.warn("Pre-read failed, agent will use tools:", (e as Error).message);
		}

		let autoPrompt = `A new email just arrived. Draft an appropriate response using draft_reply.

Email details:
- Mailbox: ${emailData.mailboxId}
- Email ID: ${emailData.emailId}
- From: ${emailData.sender}
- Subject: ${emailData.subject}
- Thread ID: ${emailData.threadId}

Email body:
${emailBody || "(could not pre-read — use get_email to read it)"}`;

		if (threadContext) {
			autoPrompt += `

Full thread history (${emailData.threadId}):
${threadContext}`;
		} else {
			autoPrompt += `

This is the first message in the thread (no prior conversation).`;
		}

		autoPrompt += `

Based on the email content and thread context above, draft a reply using draft_reply. If you need more context, use get_thread with thread ID "${emailData.threadId}".`;

		// Fresh context for auto-draft -- don't include prior chat history
		// to avoid confusing the model with old messages and tool calls
		const messages = [
			{
				role: "user" as const,
				content: autoPrompt,
				parts: [{ type: "text" as const, text: autoPrompt }],
				createdAt: new Date(),
			},
		];

		try {
			const result = await generateText({
				model: workersai("@cf/moonshotai/kimi-k2.5"),
				system: systemPrompt,
				messages: await convertToModelMessages(messages),
				tools,
				stopWhen: stepCountIs(5),
			});

			// Check if draft_reply was called (saves to Drafts as side effect).
			// If NOT, save the agent's text response as a draft directly.
			const draftToolCalled = result.steps.some((step) =>
				step.toolCalls.some((tc) => tc.toolName === "draft_reply" || tc.toolName === "draft_email"),
			);

			if (!draftToolCalled && result.text.trim()) {
				// Model generated a draft inline as text -- verify with AI
				const sanitizedText = await verifyDraft(env.AI, result.text.trim());
				if (!sanitizedText) {
					// Inline text was entirely agent commentary, skip
				} else {
					const draftId = crypto.randomUUID();
					const draftStub = getMailboxStub(env, emailData.mailboxId);
					const reSubject = emailData.subject.startsWith("Re:")
						? emailData.subject
						: `Re: ${emailData.subject}`;
					await draftStub.createEmail(
						Folders.DRAFT,
						{
							id: draftId,
							subject: reSubject,
							sender: emailData.mailboxId.toLowerCase(),
							recipient: emailData.sender.toLowerCase(),
							date: new Date().toISOString(),
						// verifyDraft may return plain text or HTML depending on its
						// code path. Only wrap in textToHtml if it's plain text.
						body: /<[a-z][\s\S]*>/i.test(sanitizedText)
							? sanitizedText
							: textToHtml(sanitizedText),
						in_reply_to: emailData.emailId,
							email_references: null,
							thread_id: emailData.threadId,
						},
						[],
					);
					// Inline text saved as draft
				}
			}

			// Persist the conversation into the agent's chat history
			// If it called the tool, we just log a simple success message so the chat isn't cluttered
			// with conversational slop.
			const assistantText = draftToolCalled 
				? `Created draft reply to ${emailData.sender}.`
				: result.text;

			const newMessages = [
				{
					id: crypto.randomUUID(),
					role: "user" as const,
					content: `[Auto-triggered] New email from ${emailData.sender}: "${emailData.subject}"`,
					createdAt: new Date(),
					parts: [
						{
							type: "text" as const,
							text: `[Auto-triggered] New email from ${emailData.sender}: "${emailData.subject}"`,
						},
					],
				},
				{
					id: crypto.randomUUID(),
					role: "assistant" as const,
					content: assistantText,
					createdAt: new Date(),
					parts: [
						{
							type: "text" as const,
							text: assistantText,
						},
					],
				},
			];

			await this.persistMessages([...this.messages, ...newMessages]);

			return { status: "draft_generated", text: result.text };
		} catch (e) {
			console.error("Auto-draft failed:", (e as Error).message);
			return { status: "error", error: (e as Error).message };
		}
	}
}
