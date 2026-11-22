// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { RobotIcon, ArrowCounterClockwiseIcon, FunnelSimpleIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
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
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: "Settings saved!" });
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

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

			<div className="space-y-6">
				{/* Account */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						Account
					</div>
					<div className="space-y-3">
						<Input
							label="Display Name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input label="Email" type="email" value={mailbox.email} disabled />
					</div>
				</div>

				<CatchAllSection mailboxId={mailbox.email} />

				{/* Agent System Prompt */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">
								AI Agent Prompt
							</span>
							{isCustomPrompt ? (
								<Badge variant="primary">Custom</Badge>
							) : (
								<Badge variant="secondary">Default</Badge>
							)}
						</div>
						{isCustomPrompt && (
							<Button
								variant="ghost"
								size="xs"
								icon={<ArrowCounterClockwiseIcon size={14} />}
								onClick={handleResetPrompt}
							>
								Reset to default
							</Button>
						)}
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Customize how the AI agent behaves for this mailbox.
						Leave empty to use the built-in default prompt.
					</p>
					<textarea
						value={agentPrompt}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={PROMPT_PLACEHOLDER}
						rows={12}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
					/>
					<p className="text-xs text-kumo-subtle mt-2">
						The prompt is sent as the system message to the AI model.
						It controls the agent's personality, writing style, and behavior rules.
					</p>
				</div>

				{/* Save */}
				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving}>
						Save Changes
					</Button>
				</div>
			</div>
		</div>
	);
}

/**
 * Where mail to unknown addresses on this mailbox's domain goes: into one
 * mailbox's "Other addresses" folder, or rejected. Saved as soon as it changes.
 */
function CatchAllSection({ mailboxId }: { mailboxId: string }) {
	const toastManager = useKumoToastManager();
	const { data } = useCatchAll();
	const setCatchAll = useSetCatchAll();
	const domain = mailboxId.split("@")[1]?.toLowerCase() ?? "";
	const status = data?.find((d) => d.domain === domain);
	if (!status) return null;

	const OFF = "__off__";
	const onChange = async (value: string) => {
		try {
			await setCatchAll.mutateAsync({ domain, mailboxId: value === OFF ? null : value });
			toastManager.add({ title: value === OFF ? "Catch-all turned off" : `Catch-all mail now goes to ${value}` });
		} catch (e) {
			toastManager.add({ title: (e as Error).message || "Could not save", variant: "error" });
		}
	};

	return (
		<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
			<div className="flex items-center gap-2 mb-2">
				<FunnelSimpleIcon size={16} className="text-kumo-subtle" />
				<span className="text-sm font-medium text-kumo-default">Catch-all for @{domain}</span>
			</div>
			<p className="text-xs text-kumo-subtle mb-3">
				Mail sent to an address on @{domain} that is not a mailbox or a burner. It goes to the
				"Other addresses" folder, never the Inbox. Turn it off to bounce that mail instead.
			</p>
			<select
				aria-label={`Catch-all for ${domain}`}
				value={status.mailboxId ?? OFF}
				disabled={setCatchAll.isPending}
				onChange={(e) => void onChange(e.target.value)}
				className="w-full h-10 rounded-lg border border-kumo-line bg-kumo-recessed px-3 text-sm text-kumo-default"
			>
				{status.mailboxes.map((m) => (
					<option key={m} value={m}>
						Collect in {m === mailboxId ? "this mailbox" : m}
					</option>
				))}
				<option value={OFF}>Off: reject unknown addresses</option>
			</select>
			{!status.configured && status.mailboxId && (
				<p className="text-xs text-kumo-subtle mt-2">Default: the first mailbox on the domain collects it.</p>
			)}
		</div>
	);
}
