// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Loader } from "@cloudflare/kumo";
import {
	ArrowBendUpLeftIcon,
	ArrowRightIcon,
	CaretRightIcon,
	CheckCircleIcon,
	EnvelopeSimpleIcon,
	EyeIcon,
	FireIcon,
	FolderSimpleIcon,
	LightningIcon,
	MagnifyingGlassIcon,
	PencilSimpleIcon,
	ShieldCheckIcon,
	StopIcon,
	TrashIcon,
	WarningCircleIcon,
	WrenchIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { UNIFIED_AGENT_NAME } from "shared/agents";
import { useActiveMailbox } from "~/hooks/useActiveMailbox";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useUIStore } from "~/hooks/useUIStore";
import type { UIMessage } from "ai";

/** Model the agent runs on. Source of truth: workers/agent/index.ts. */
const AGENT_MODEL = "kimi-k2.5";

/** Run-log labels for each agent tool. The agent has no send tool: it drafts only. */
const TOOL_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
	list_mailboxes: { label: "List mailboxes", icon: <EnvelopeSimpleIcon size={13} weight="bold" /> },
	list_emails: { label: "List emails", icon: <EnvelopeSimpleIcon size={13} weight="bold" /> },
	get_email: { label: "Read email", icon: <EyeIcon size={13} weight="bold" /> },
	get_thread: { label: "Load thread", icon: <ArrowBendUpLeftIcon size={13} weight="bold" /> },
	search_emails: { label: "Search", icon: <MagnifyingGlassIcon size={13} weight="bold" /> },
	draft_email: { label: "Draft new email", icon: <PencilSimpleIcon size={13} weight="bold" /> },
	draft_reply: { label: "Draft reply", icon: <PencilSimpleIcon size={13} weight="bold" /> },
	discard_draft: { label: "Discard draft", icon: <TrashIcon size={13} weight="bold" /> },
	mark_email_read: { label: "Set read state", icon: <CheckCircleIcon size={13} weight="bold" /> },
	move_email: { label: "Move email", icon: <FolderSimpleIcon size={13} weight="bold" /> },
	list_burners: { label: "List burners", icon: <FireIcon size={13} weight="bold" /> },
	create_burner: { label: "Create burner", icon: <FireIcon size={13} weight="bold" /> },
	set_burner_enabled: { label: "Toggle burner", icon: <FireIcon size={13} weight="bold" /> },
};

/** Short one-line summary of a tool call's arguments: `query="invoice" folder=inbox`. */
function summarizeArgs(input: unknown): string {
	if (!input || typeof input !== "object") return "";
	return Object.entries(input as Record<string, unknown>)
		.filter(([, v]) => v !== undefined && v !== null && v !== "")
		.map(([k, v]) => {
			const text = typeof v === "string" ? `"${v.length > 28 ? `${v.slice(0, 28)}…` : v}"` : JSON.stringify(v);
			return `${k}=${text && text.length > 32 ? `${text.slice(0, 32)}…` : text}`;
		})
		.join(" ");
}

function RunStep({ toolName, part }: { toolName: string; part: any }) {
	const info = TOOL_LABELS[toolName] || { label: toolName, icon: <WrenchIcon size={13} weight="bold" /> };
	const state: string = part.state ?? "running";
	const failed = state === "output-error";
	const done = state === "output-available" || state === "result" || failed;
	const input = part.input ?? part.args;
	const output = part.output ?? part.result ?? part.errorText;
	const args = summarizeArgs(input);
	const isDraft = toolName.startsWith("draft_");

	return (
		<details className="group/step animate-step rounded-md border border-kumo-line bg-kumo-base open:bg-kumo-tint">
			<summary className="flex items-center gap-2 h-8 px-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-xs">
				<CaretRightIcon size={10} weight="bold" className="text-kumo-subtle shrink-0 transition-transform group-open/step:rotate-90" />
				<span className={`shrink-0 flex ${isDraft ? "text-[var(--ops-agent)]" : "text-kumo-strong"}`}>{info.icon}</span>
				<span className="ops-mono text-kumo-default shrink-0">{toolName}</span>
				<span className="ops-mono text-kumo-subtle truncate min-w-0 flex-1">{args}</span>
				{failed ? (
					<span className="chip chip-bad shrink-0"><WarningCircleIcon size={11} weight="bold" />Error</span>
				) : done ? (
					<CheckCircleIcon size={14} weight="fill" className="text-[var(--ops-ok)] shrink-0" aria-label="Done" />
				) : (
					<Loader size="sm" className="shrink-0" />
				)}
			</summary>
			<div className="px-2 pb-2 space-y-1.5">
				<div className="text-[11px] text-kumo-subtle">{info.label}</div>
				{input !== undefined && (
					<pre className="ops-mono text-[11px] leading-snug whitespace-pre-wrap break-all max-h-40 overflow-auto rounded border border-kumo-line bg-kumo-base p-2 m-0 text-kumo-strong">
						{JSON.stringify(input, null, 2)}
					</pre>
				)}
				{done && output !== undefined && (
					<pre className="ops-mono text-[11px] leading-snug whitespace-pre-wrap break-all max-h-48 overflow-auto rounded border border-kumo-line bg-kumo-base p-2 m-0 text-kumo-strong">
						{typeof output === "string" ? output : JSON.stringify(output, null, 2)}
					</pre>
				)}
			</div>
		</details>
	);
}

function getToolNameFromPart(part: UIMessage["parts"][number]): string | null {
	if (part.type === "dynamic-tool") return (part as any).toolName ?? null;
	if (part.type.startsWith("tool-")) return part.type.replace("tool-", "");
	return null;
}

function hasDraftReplyTool(message: UIMessage): boolean {
	return message.parts.some((part) => getToolNameFromPart(part) === "draft_reply");
}

const markdownComponents = {
	a: ({ href, children }: any) => (
		<a href={href} target="_blank" rel="noopener noreferrer" className="text-kumo-link underline">
			{children}
		</a>
	),
	p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
	strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
	ul: ({ children }: any) => <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
	ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
	li: ({ children }: any) => <li>{children}</li>,
	h1: ({ children }: any) => <h3 className="font-semibold text-sm mb-1">{children}</h3>,
	h2: ({ children }: any) => <h4 className="font-semibold text-[13px] mb-1">{children}</h4>,
	h3: ({ children }: any) => <h5 className="font-semibold text-[13px] mb-0.5">{children}</h5>,
	code: ({ children }: any) => <code className="ops-mono bg-kumo-fill px-1 py-0.5 rounded text-[12px]">{children}</code>,
	table: ({ children }: any) => (
		<div className="overflow-x-auto my-2 rounded-md border border-kumo-line">
			<table className="w-full text-xs border-collapse">{children}</table>
		</div>
	),
	thead: ({ children }: any) => <thead className="bg-[var(--ops-header)]">{children}</thead>,
	th: ({ children }: any) => <th className="text-left px-2 py-1.5 font-semibold text-kumo-strong border-b border-kumo-line">{children}</th>,
	td: ({ children }: any) => <td className="px-2 py-1.5 border-b border-kumo-line">{children}</td>,
};

/** One turn in the transcript: an operator prompt, or the agent's run log and answer. */
function Turn({
	message,
	onAction,
	isStreaming,
}: {
	message: UIMessage;
	onAction?: (action: string) => void;
	isStreaming: boolean;
}) {
	const isUser = message.role === "user";

	if (isUser) {
		const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
		// Runs started by inbound mail (workers/agent/index.ts), not by the operator.
		const trigger = text.match(/^\[Auto-triggered\]\s*(.*)$/s);
		if (trigger) {
			return (
				<div className="flex items-start gap-2 text-xs text-kumo-subtle border-t border-dashed border-kumo-line pt-2">
					<LightningIcon size={13} weight="fill" className="shrink-0 mt-px text-[var(--ops-warn)]" />
					<div className="min-w-0">
						<span className="font-semibold text-kumo-strong">Trigger · inbound mail</span>
						<div className="break-words">{trigger[1]}</div>
					</div>
				</div>
			);
		}
		return (
			<div className="rounded-md bg-kumo-tint border border-kumo-line px-3 py-2">
				<div className="text-[11px] font-semibold text-kumo-subtle mb-0.5">You</div>
				<div className="text-[13px] leading-relaxed text-kumo-default whitespace-pre-wrap break-words">{text}</div>
			</div>
		);
	}

	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ops-agent)]">
				<span className="h-1.5 w-1.5 rounded-full bg-[var(--ops-agent)]" />
				Agent
			</div>
			{message.parts.map((part, i) => {
				const key = `${message.id}-part-${i}`;
				if (part.type === "text" && part.text.trim()) {
					return (
						<div key={key} className="text-[13px] leading-relaxed text-kumo-default break-words [overflow-wrap:anywhere]">
							<Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
								{part.text}
							</Markdown>
						</div>
					);
				}
				const toolName = getToolNameFromPart(part);
				if (toolName) return <RunStep key={key} toolName={toolName} part={part} />;
				return null;
			})}
			{hasDraftReplyTool(message) && onAction && (
				<div className="flex items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--ops-agent)_35%,transparent)] bg-[var(--ops-agent-tint)] px-2.5 py-2">
					<ShieldCheckIcon size={15} className="text-[var(--ops-agent)] shrink-0" />
					<span className="text-xs text-kumo-strong flex-1">Draft saved. Nothing is sent until you send it.</span>
					<button type="button" className="btn btn-primary !h-7 !text-xs" onClick={() => onAction("edit")} disabled={isStreaming}>
						Review in composer
					</button>
				</div>
			)}
		</div>
	);
}

function AgentChatConnected({
	mailboxId,
	useAgent,
	useAgentChat,
}: {
	mailboxId: string;
	useAgent: typeof import("agents/react").useAgent;
	useAgentChat: typeof import("@cloudflare/ai-chat/react").useAgentChat;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const [inputValue, setInputValue] = useState("");
	const { startCompose } = useUIStore();
	const { focusMailbox } = useActiveMailbox();
	const isUnified = mailboxId === UNIFIED_AGENT_NAME;

	const agent = useAgent({ agent: "EmailAgent", name: mailboxId });
	const { messages, sendMessage, status, setMessages, stop } =
		useAgentChat({ agent });
	const isStreaming = status === "streaming" || status === "submitted";

	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages]);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleSend = () => {
		const text = inputValue.trim();
		if (!text || isStreaming) return;
		setInputValue("");
		sendMessage({ text });
		if (inputRef.current) inputRef.current.style.height = "auto";
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const suggestedPrompts = isUnified
		? [
				"Which mailboxes have unread mail?",
				"Summarize the newest mail across all mailboxes",
				"What is awaiting a reply, in any mailbox?",
				"List the burner addresses that received mail this week",
			]
		: [
				"Summarize the unread mail in this inbox",
				"What is awaiting a reply?",
				"Draft a reply to the newest email",
				"Create a burner address for a newsletter sign-up",
			];

	const onEdit = (msg: UIMessage) => {
		// Extract draft data from the draft_reply tool result
		let draftData: { to?: string; subject?: string; body?: string; id?: string; mailbox?: string } | null = null;
		for (const part of msg.parts) {
			const p = part as any;
			const name = getToolNameFromPart(part);
			const result = p.result ?? p.output;
			if (name === "draft_reply" && result && typeof result === "object") {
				draftData = result;
				break;
			}
		}
		if (draftData) {
			// The unified agent tags drafts with the mailbox they were saved in.
			const draftMailbox = draftData.mailbox || mailboxId;
			if (draftData.mailbox) focusMailbox?.(draftData.mailbox);
			startCompose({
				mode: "reply",
				originalEmail: null,
				draftEmail: {
					id: draftData.id || "",
					subject: draftData.subject || "",
					sender: draftMailbox,
					recipient: draftData.to || "",
					date: new Date().toISOString(),
					read: true,
					starred: false,
					body: draftData.body || "",
				},
			});
		} else {
			sendMessage({ text: "Let me edit this draft first. Show me what you have so I can modify it." });
		}
	};

	return (
		<div className="flex flex-col h-full">
			{/* Header: scope, model, state */}
			<div className="px-3 py-2.5 border-b border-kumo-line shrink-0 space-y-1.5">
				<div className="flex items-center gap-2">
					<span className="text-[13px] font-semibold text-kumo-default">Agent console</span>
					<span className={`chip ${isStreaming ? "chip-agent" : ""}`}>
						<span className={`h-1.5 w-1.5 rounded-full ${isStreaming ? "bg-[var(--ops-agent)] animate-pulse" : "bg-[var(--ops-ok)]"}`} />
						{isStreaming ? "Running" : "Ready"}
					</span>
					<div className="ml-auto flex items-center">
						{messages.length > 0 && (
							<button
								type="button"
								className="btn btn-ghost !h-7 !px-2 !text-xs !font-medium"
								onClick={() => {
									if (window.confirm("Clear the agent transcript?")) setMessages([]);
								}}
							>
								<TrashIcon size={13} />
								Clear
							</button>
						)}
					</div>
				</div>
				<div className="flex items-center gap-1.5 text-[11px] text-kumo-subtle min-w-0">
					<span className="shrink-0">Scope</span>
					<span className="ops-mono text-kumo-strong truncate">{isUnified ? "all mailboxes" : mailboxId}</span>
					<span className="shrink-0">·</span>
					<span className="shrink-0">Model</span>
					<span className="ops-mono text-kumo-strong shrink-0">{AGENT_MODEL}</span>
				</div>
			</div>

			{/* Transcript */}
			<div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
				{messages.length === 0 ? (
					<div className="space-y-4">
						<div className="rounded-md border border-kumo-line p-3 space-y-2">
							<div className="flex items-center gap-2 text-[13px] font-semibold text-kumo-default">
								<ShieldCheckIcon size={16} className="text-[var(--ops-agent)]" />
								Draft-only agent
							</div>
							<p className="text-xs leading-relaxed text-kumo-subtle m-0">
								{isUnified
									? "Reads and searches every mailbox, drafts replies from the right one, and manages burner addresses."
									: "Reads and searches this mailbox, drafts replies, files mail, and manages burner addresses."}{" "}
								It has no send tool. Every draft waits in Drafts for you to send.
							</p>
							<div className="flex flex-wrap gap-1 pt-0.5">
								{["read", "search", "draft", "move", "burners"].map((c) => (
									<span key={c} className="chip ops-mono !font-normal">{c}</span>
								))}
							</div>
						</div>
						<div>
							<div className="text-[11px] font-semibold text-kumo-subtle mb-1.5">Start a run</div>
							<div className="rounded-md border border-kumo-line divide-y divide-kumo-line overflow-hidden">
								{suggestedPrompts.map((prompt) => (
									<button
										key={prompt}
										type="button"
										onClick={() => sendMessage({ text: prompt })}
										className="group w-full flex items-center gap-2 text-left px-3 h-9 text-xs text-kumo-strong hover:bg-kumo-tint hover:text-kumo-default cursor-pointer bg-transparent border-0"
									>
										<span className="flex-1 truncate">{prompt}</span>
										<ArrowRightIcon size={12} className="text-kumo-subtle opacity-0 group-hover:opacity-100" />
									</button>
								))}
							</div>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{messages.map((msg) => (
							<Turn key={msg.id} message={msg} isStreaming={isStreaming} onAction={(action) => action === "edit" && onEdit(msg)} />
						))}
						{isStreaming && (
							<div className="flex items-center gap-2 text-xs text-kumo-subtle">
								<Loader size="sm" />
								Working…
							</div>
						)}
					</div>
				)}
			</div>

			{/* Prompt */}
			<div className="shrink-0 border-t border-kumo-line p-2.5 bg-[var(--ops-header)]">
				<div className="rounded-md border border-[var(--ops-line-strong)] bg-kumo-control focus-within:border-kumo-brand focus-within:shadow-[0_0_0_3px_light-dark(rgb(11_110_120/0.15),rgb(54_170_180/0.25))]">
					<textarea
						ref={inputRef}
						id="agent-chat-input"
						name="agent-chat-input"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={isUnified ? "Instruct the agent across all mailboxes…" : "Instruct the agent…"}
						rows={2}
						aria-label="Agent instruction"
						disabled={isStreaming}
						className="block w-full resize-none bg-transparent border-0 px-2.5 pt-2 text-[13px] text-kumo-default placeholder:text-kumo-subtle outline-none min-h-[44px] max-h-[140px]"
						style={{ overflow: "hidden" }}
						onInput={(e) => {
							const t = e.target as HTMLTextAreaElement;
							t.style.height = "auto";
							t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
							t.style.overflow = t.scrollHeight > 140 ? "auto" : "hidden";
						}}
					/>
					<div className="flex items-center gap-2 px-2 pb-1.5">
						<span className="text-[11px] text-kumo-subtle">
							<kbd>Enter</kbd> run · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line
						</span>
						{isStreaming ? (
							<button type="button" className="btn ml-auto !h-7 !text-xs" onClick={() => stop()}>
								<StopIcon size={12} weight="fill" />
								Stop
							</button>
						) : (
							<button type="button" className="btn btn-primary ml-auto !h-7 !text-xs" disabled={!inputValue.trim()} onClick={handleSend}>
								Run
								<ArrowRightIcon size={12} weight="bold" />
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

export default function AgentPanel({ agentName }: { agentName?: string }) {
	const { mailboxId: routeMailboxId } = useParams<{ mailboxId: string }>();
	const mailboxId = agentName ?? routeMailboxId;
	const [hooks, setHooks] = useState<{
		useAgent: typeof import("agents/react").useAgent;
		useAgentChat: typeof import("@cloudflare/ai-chat/react").useAgentChat;
	} | null>(null);

	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		Promise.all([
			import("agents/react"),
			import("@cloudflare/ai-chat/react"),
		]).then(([a, c]) =>
			setHooks({
				useAgent: a.useAgent,
				useAgentChat: c.useAgentChat,
			}),
		).catch((err) => {
			console.error("Failed to load agent modules:", err);
			setLoadError("Could not connect to the agent. Reload the page to retry.");
		});
	}, []);

	if (loadError) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
				<span className="text-xs text-[var(--ops-bad)]">{loadError}</span>
			</div>
		);
	}

	if (!hooks) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-2">
				<Loader size="base" />
				<span className="text-xs text-kumo-subtle">Connecting to agent…</span>
			</div>
		);
	}

	return (
		<AgentChatConnected
			key={mailboxId ?? "default"}
			mailboxId={mailboxId ?? "default"}
			useAgent={hooks.useAgent}
			useAgentChat={hooks.useAgentChat}
		/>
	);
}
