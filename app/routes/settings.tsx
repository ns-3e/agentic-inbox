// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Loader, Switch, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowCounterClockwiseIcon, ArrowRightIcon, GearSixIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router";
import { DomainSetupPanel } from "~/components/CloudflareSetup";
import { useCatchAll, useSetCatchAll } from "~/queries/catchall";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";

// Placeholder shown in the textarea when no custom prompt is set.
// The authoritative default prompt lives in workers/agent/index.ts (DEFAULT_SYSTEM_PROMPT).
const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const [displayName, setDisplayName] = useState("");
	const [agentPrompt, setAgentPrompt] = useState("");
	const [sigEnabled, setSigEnabled] = useState(false);
	const [sigText, setSigText] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
			setSigEnabled(!!mailbox.settings?.signature?.enabled);
			setSigText(mailbox.settings?.signature?.text || "");
		}
	}, [mailbox]);

	// Links such as #cfg-cloudflare scroll to their section once it renders.
	const { hash } = useLocation();
	const loaded = !!mailbox;
	useEffect(() => {
		if (loaded && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
	}, [loaded, hash]);

	const savedSigEnabled = !!mailbox?.settings?.signature?.enabled;
	const savedSigText = mailbox?.settings?.signature?.text || "";

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
			signature: {
				enabled: sigEnabled,
				text: sigText,
				// An HTML signature (set through the API) is kept until the text is edited here.
				...(sigText === savedSigText && mailbox.settings?.signature?.html ? { html: mailbox.settings.signature.html } : {}),
			},
		};
		try {
			// The save bar reports success; only failures need a toast.
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
		} catch {
			toastManager.add({
				title: "Failed to save settings",
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleResetPrompt = () => {
		setAgentPrompt("");
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;
	const savedName = mailbox.settings?.fromName || mailbox.name || "";
	const savedPrompt = mailbox.settings?.agentSystemPrompt || "";
	const dirty =
		displayName !== savedName ||
		agentPrompt.trim() !== savedPrompt.trim() ||
		sigEnabled !== savedSigEnabled ||
		sigText !== savedSigText;
	const domain = mailbox.email.split("@")[1] ?? "";

	return (
		<div className="h-full flex flex-col min-h-0 overflow-hidden">
			<header className="page-head">
				<GearSixIcon size={18} className="text-kumo-subtle shrink-0" />
				<div className="min-w-0">
					<h1 className="page-title">Routing &amp; settings</h1>
					<div className="page-meta">
						Configuration for <span className="ops-mono text-kumo-strong">{mailbox.email}</span>
					</div>
				</div>
			</header>

			<div className="flex-1 min-h-0 overflow-y-auto">
				<div>
					<section className="config-section" aria-labelledby="cfg-identity">
						<div>
							<h2 id="cfg-identity" className="config-title">Sender identity</h2>
							<p className="config-desc">How this mailbox appears to recipients when you or a reviewed agent draft sends mail.</p>
						</div>
						<div className="space-y-4 max-w-lg">
							<label className="block">
								<span className="field-label">Display name</span>
								<input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Alice from Example" />
							</label>
							<label className="block">
								<span className="field-label">Address</span>
								<input className="field ops-mono" value={mailbox.email} disabled />
								<span className="field-hint block">The address is fixed. To send from another address, use a burner address.</span>
							</label>
							<div className="rounded-md border border-kumo-line bg-kumo-tint px-3 py-2 text-xs text-kumo-subtle">
								Recipients see: <span className="text-kumo-default font-semibold">{displayName || mailbox.email}</span>{" "}
								<span className="ops-mono">&lt;{mailbox.email}&gt;</span>
							</div>
						</div>
					</section>

					<section className="config-section" aria-labelledby="cfg-signature">
						<div>
							<h2 id="cfg-signature" className="config-title flex items-center gap-2">
								Signature
								<span className={sigEnabled ? "chip chip-ok" : "chip"}>{sigEnabled ? "On" : "Off"}</span>
							</h2>
							<p className="config-desc">Added below new messages, replies and forwards from this mailbox. Replies sent from a burner address leave it out, so the burner does not show your name.</p>
						</div>
						<div className="space-y-3 max-w-lg">
							<div className="flex items-center justify-between gap-4">
								<span className="text-[0.8125rem] font-semibold text-kumo-default">Add signature to outgoing mail</span>
								<Switch checked={sigEnabled} onCheckedChange={setSigEnabled} aria-label="Add signature to outgoing mail" />
							</div>
							<label className="block">
								<span className="field-label">Signature text</span>
								<textarea
									className="field resize-y"
									rows={4}
									value={sigText}
									onChange={(e) => setSigText(e.target.value)}
									placeholder={"Alice Example\nOperations, Example Inc."}
									aria-label="Signature text"
								/>
								<span className="field-hint block">Plain text. Line breaks are kept.</span>
							</label>
							{sigEnabled && sigText.trim() && (
								<div className="rounded-md border border-kumo-line bg-kumo-tint px-3 py-2 text-xs text-kumo-subtle">
									<div className="mb-1">Preview</div>
									<div className="border-t border-kumo-line pt-2 text-[0.8125rem] text-kumo-default whitespace-pre-wrap">{sigText}</div>
								</div>
							)}
						</div>
					</section>

					<section id="cfg-cloudflare" className="config-section scroll-mt-2" aria-labelledby="cfg-cloudflare-title">
						<div>
							<h2 id="cfg-cloudflare-title" className="config-title">Cloudflare delivery</h2>
							<p className="config-desc">
								What Cloudflare needs so this address can receive and send: Email Routing, a route to this app, Email Sending and
								delivery tracking. The app shows each change before it applies it.
							</p>
						</div>
						<DomainSetupPanel domain={domain} address={mailbox.email} />
					</section>

					<CatchAllSection mailboxId={mailbox.email} domain={domain} />

					<section className="config-section" aria-labelledby="cfg-agent">
						<div>
							<h2 id="cfg-agent" className="config-title flex items-center gap-2">
								Agent instructions
								<span className={isCustomPrompt ? "chip chip-agent" : "chip"}>{isCustomPrompt ? "Custom" : "Default"}</span>
							</h2>
							<p className="config-desc">The system prompt for this mailbox's agent: its voice, writing style and rules. Leave it empty to use the built-in prompt.</p>
							<div className="mt-3 flex items-start gap-2 rounded-md border border-kumo-line px-2.5 py-2 text-xs text-kumo-subtle">
								<ShieldCheckIcon size={14} className="text-[var(--ops-agent)] shrink-0 mt-px" />
								<span>The prompt cannot give the agent a send tool. It drafts only; you send.</span>
							</div>
						</div>
						<div className="min-w-0">
							<div className="flex items-center justify-between mb-1.5">
								<span className="field-label !mb-0">System prompt</span>
								<div className="flex items-center gap-2">
									<span className="ops-mono tabular text-[0.6875rem] text-kumo-subtle">{agentPrompt.length.toLocaleString()} chars</span>
									{isCustomPrompt && (
										<button type="button" className="btn btn-ghost !h-7 !px-2 !text-xs !font-medium" onClick={handleResetPrompt}>
											<ArrowCounterClockwiseIcon size={13} />
											Use default
										</button>
									)}
								</div>
							</div>
							<textarea
								value={agentPrompt}
								onChange={(e) => setAgentPrompt(e.target.value)}
								placeholder={PROMPT_PLACEHOLDER}
								rows={14}
								aria-label="Agent system prompt"
								className="field ops-mono !text-xs resize-y"
							/>
						</div>
					</section>
				</div>
			</div>

			{/* Save bar */}
			<div className="shrink-0 flex items-center gap-3 px-5 h-14 border-t border-kumo-line bg-[var(--ops-header)] pb-[env(safe-area-inset-bottom)]">
				<span className="text-xs text-kumo-subtle flex items-center gap-2">
					{dirty ? (
						<>
							<span className="dot bg-[var(--ops-warn)]" />
							Unsaved changes
						</>
					) : (
						<>
							<span className="dot bg-[var(--ops-ok)]" />
							All changes saved
						</>
					)}
				</span>
				<div className="ml-auto flex items-center gap-2">
					{dirty && (
						<button
							type="button"
							className="btn btn-ghost"
							onClick={() => {
								setDisplayName(savedName);
								setAgentPrompt(savedPrompt);
								setSigEnabled(savedSigEnabled);
								setSigText(savedSigText);
							}}
						>
							Discard
						</button>
					)}
					<button type="button" className="btn btn-primary" onClick={handleSave} disabled={!dirty || isSaving}>
						{isSaving ? "Saving…" : "Save changes"}
					</button>
				</div>
			</div>
		</div>
	);
}

/**
 * Where mail to unknown addresses on this mailbox's domain goes: into one
 * mailbox's "Other addresses" folder, or rejected. Saved as soon as it changes.
 */
function CatchAllSection({ mailboxId, domain }: { mailboxId: string; domain: string }) {
	const toastManager = useKumoToastManager();
	const { data } = useCatchAll();
	const setCatchAll = useSetCatchAll();
	const status = data?.find((d) => d.domain === domain.toLowerCase());

	const OFF = "__off__";
	const onChange = async (value: string) => {
		try {
			await setCatchAll.mutateAsync({ domain: domain.toLowerCase(), mailboxId: value === OFF ? null : value });
			toastManager.add({ title: value === OFF ? `Catch-all for @${domain} turned off` : `Catch-all mail for @${domain} now goes to ${value}` });
		} catch (e) {
			toastManager.add({ title: (e as Error).message || "Could not save the catch-all route", variant: "error" });
		}
	};

	const target = status?.mailboxId ?? null;
	const routedHere = target === mailboxId;

	return (
		<section className="config-section" aria-labelledby="cfg-routing">
			<div>
				<h2 id="cfg-routing" className="config-title">Catch-all routing</h2>
				<p className="config-desc">
					Mail to an address on <span className="ops-mono">@{domain}</span> that is not a mailbox or a burner. It goes to one mailbox's
					Other addresses queue, never an Inbox. Saved when you change it.
				</p>
			</div>
			{!data ? (
				<div className="text-xs text-kumo-subtle">Loading route…</div>
			) : !status ? (
				<div className="text-xs text-kumo-subtle">No catch-all route is available for @{domain}.</div>
			) : (
				<div className="space-y-3 max-w-lg">
					{/* Route diagram */}
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-kumo-line bg-kumo-tint px-3 py-2.5 text-xs">
						<span className="ops-mono text-kumo-default break-all">*@{domain}</span>
						<ArrowRightIcon size={12} className="text-kumo-subtle shrink-0" />
						{target ? (
							<>
								<span className="ops-mono text-kumo-default break-all">{target}</span>
								<span className="text-kumo-subtle whitespace-nowrap">/ Other addresses</span>
								<span className={`chip ml-auto ${routedHere ? "chip-accent" : ""}`}>{routedHere ? "This mailbox" : "Other mailbox"}</span>
							</>
						) : (
							<>
								<span className="text-[var(--ops-bad)] font-semibold whitespace-nowrap">Rejected (bounce)</span>
								<span className="chip chip-bad ml-auto">Off</span>
							</>
						)}
					</div>
					<label className="block">
						<span className="field-label">Route unknown addresses to</span>
						<select
							aria-label={`Catch-all for ${domain}`}
							value={target ?? OFF}
							disabled={setCatchAll.isPending}
							onChange={(e) => void onChange(e.target.value)}
							className="field"
						>
							{status.mailboxes.map((m) => (
								<option key={m} value={m}>
									{m}
									{m === mailboxId ? " (this mailbox)" : ""}
								</option>
							))}
							<option value={OFF}>Off: reject unknown addresses</option>
						</select>
					</label>
					{!status.configured && target && (
						<p className="field-hint">Not set yet. By default the first mailbox on the domain collects it.</p>
					)}
				</div>
			)}
		</section>
	);
}
