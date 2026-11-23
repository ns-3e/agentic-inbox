// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { CheckIcon, CopyIcon, ShieldCheckIcon, WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			className="btn btn-ghost !h-7 !px-2 !text-xs !font-medium"
			aria-label={`${label} to clipboard`}
			onClick={async () => {
				try {
					await navigator.clipboard.writeText(text);
					setCopied(true);
					setTimeout(() => setCopied(false), 1600);
				} catch {
					// Clipboard unavailable: the text stays selectable.
				}
			}}
		>
			{copied ? <CheckIcon size={13} weight="bold" className="text-[var(--ops-ok)]" /> : <CopyIcon size={13} />}
			{copied ? "Copied" : label}
		</button>
	);
}

type Access = "read" | "draft" | "modify" | "send" | "delete";

/** The tools workers/mcp/index.ts registers, grouped by what they can change. */
const TOOLS: { name: string; desc: string; access: Access }[] = [
	{ name: "list_mailboxes", desc: "List all mailboxes", access: "read" },
	{ name: "list_emails", desc: "List emails in a folder", access: "read" },
	{ name: "get_email", desc: "Read one email with its body", access: "read" },
	{ name: "get_thread", desc: "Load a conversation", access: "read" },
	{ name: "search_emails", desc: "Search subject and body", access: "read" },
	{ name: "list_burners", desc: "List burner addresses", access: "read" },
	{ name: "draft_reply", desc: "Save a reply to Drafts", access: "draft" },
	{ name: "create_draft", desc: "Save a new draft", access: "draft" },
	{ name: "update_draft", desc: "Change a draft", access: "draft" },
	{ name: "mark_email_read", desc: "Set read or unread", access: "modify" },
	{ name: "move_email", desc: "Move to a folder", access: "modify" },
	{ name: "create_burner", desc: "Create a burner address", access: "modify" },
	{ name: "set_burner_enabled", desc: "Turn a burner on or off", access: "modify" },
	{ name: "send_reply", desc: "Send a reply", access: "send" },
	{ name: "send_email", desc: "Send a new email", access: "send" },
	{ name: "delete_email", desc: "Delete an email permanently", access: "delete" },
];

const ACCESS: Record<Access, { label: string; chip: string }> = {
	read: { label: "Read", chip: "chip" },
	draft: { label: "Draft", chip: "chip chip-agent" },
	modify: { label: "Modify", chip: "chip chip-accent" },
	send: { label: "Send", chip: "chip chip-warn" },
	delete: { label: "Delete", chip: "chip chip-bad" },
};

export default function MCPPanel() {
	const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-app.workers.dev";
	const mcpUrl = `${baseUrl}/mcp`;
	const [client, setClient] = useState<"claude" | "json">("claude");

	const snippets = {
		claude: `claude mcp add --transport http agentic-inbox ${mcpUrl} \\
  --header "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \\
  --header "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"`,
		json: JSON.stringify(
			{
				mcpServers: {
					"agentic-inbox": {
						command: "npx",
						args: [
							"mcp-remote",
							mcpUrl,
							"--header",
							"CF-Access-Client-Id:${CF_ACCESS_CLIENT_ID}",
							"--header",
							"CF-Access-Client-Secret:${CF_ACCESS_CLIENT_SECRET}",
						],
					},
				},
			},
			null,
			2,
		),
	};

	const counts = TOOLS.reduce<Record<Access, number>>(
		(n, t) => ({ ...n, [t.access]: n[t.access] + 1 }),
		{ read: 0, draft: 0, modify: 0, send: 0, delete: 0 },
	);
	const highRisk = counts.send + counts.delete;

	return (
		<div className="h-full overflow-y-auto">
			<section className="px-3 py-3 border-b border-kumo-line space-y-2">
				<div className="flex items-center gap-2">
					<span className="text-[13px] font-semibold text-kumo-default">MCP endpoint</span>
					<span className="chip">Streamable HTTP</span>
				</div>
				<p className="text-xs leading-relaxed text-kumo-subtle m-0">
					Outside AI clients (Claude Code, Cursor, other MCP clients) use the same mailbox tools as the agent through this server.
				</p>
				<div className="flex items-center gap-1 rounded-md border border-kumo-line bg-kumo-tint pl-2.5 pr-1 h-9">
					<span className="ops-mono text-xs text-kumo-default truncate flex-1 min-w-0" title={mcpUrl}>
						{mcpUrl}
					</span>
					<CopyButton text={mcpUrl} label="Copy URL" />
				</div>
			</section>

			<section className="px-3 py-3 border-b border-kumo-line space-y-2">
				<div className="flex items-start gap-2">
					<ShieldCheckIcon size={16} className="text-kumo-brand shrink-0 mt-px" />
					<div className="text-xs leading-relaxed text-kumo-subtle">
						<span className="font-semibold text-kumo-default">Protected by Cloudflare Access.</span> A client must send an Access
						service token that your Access policy allows, as the <span className="ops-mono">CF-Access-Client-Id</span> and{" "}
						<span className="ops-mono">CF-Access-Client-Secret</span> headers.
					</div>
				</div>
				<div className="rounded-md border border-kumo-line overflow-hidden">
					<div role="tablist" aria-label="Client" className="flex items-center gap-1 h-8 px-1 border-b border-kumo-line bg-[var(--ops-header)]">
						{(
							[
								["claude", "Claude Code"],
								["json", "JSON config"],
							] as const
						).map(([id, label]) => (
							<button
								key={id}
								type="button"
								role="tab"
								aria-selected={client === id}
								onClick={() => setClient(id)}
								className={`h-6 px-2 rounded text-xs border-0 cursor-pointer ${
									client === id ? "bg-kumo-base text-kumo-default font-semibold shadow-[0_0_0_1px_var(--color-kumo-line)]" : "bg-transparent text-kumo-subtle hover:text-kumo-default"
								}`}
							>
								{label}
							</button>
						))}
						<div className="ml-auto">
							<CopyButton text={snippets[client]} />
						</div>
					</div>
					<pre className="ops-mono m-0 p-2.5 text-[11px] leading-relaxed whitespace-pre-wrap break-all text-kumo-strong bg-kumo-base max-h-56 overflow-auto">
						{snippets[client]}
					</pre>
				</div>
			</section>

			<section className="py-3">
				<div className="flex items-center gap-2 px-3 mb-2">
					<span className="text-[13px] font-semibold text-kumo-default">Tool catalog</span>
					<span className="ops-mono tabular text-[11px] text-kumo-subtle">{TOOLS.length} tools</span>
				</div>
				{highRisk > 0 && (
					<div className="mx-3 mb-2 flex items-start gap-2 rounded-md bg-[var(--ops-warn-tint)] px-2.5 py-2 text-xs leading-relaxed text-[var(--ops-warn)]">
						<WarningIcon size={14} weight="bold" className="shrink-0 mt-px" />
						<span>
							Unlike the in-app agent, MCP clients can send and delete mail ({highRisk} tools). Give tokens only to clients you trust.
						</span>
					</div>
				)}
				<table className="ops-table">
					<thead>
						<tr>
							<th>Tool</th>
							<th className="!text-right">Access</th>
						</tr>
					</thead>
					<tbody>
						{TOOLS.map((tool) => (
							<tr key={tool.name}>
								<td className="!h-auto !py-1.5">
									<div className="ops-mono text-xs text-kumo-default">{tool.name}</div>
									<div className="text-[11px] text-kumo-subtle">{tool.desc}</div>
								</td>
								<td className="text-right !h-auto !py-1.5">
									<span className={ACCESS[tool.access].chip}>{ACCESS[tool.access].label}</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
		</div>
	);
}
