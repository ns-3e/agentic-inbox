// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Dialog, useKumoToastManager } from "@cloudflare/kumo";
import { CloudIcon } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { LOCAL_PART_HINT, LOCAL_PART_RE } from "shared/burners";
import { planSetup, type StepResult } from "shared/provisioning";
import { CatchAllChoice, SetupStepList, StepResultList, TokenMissing, useCatchAllChoice } from "~/components/CloudflareSetup";
import { useDomainSetup, useZones } from "~/queries/cloudflare";
import { useCreateMailbox } from "~/queries/mailboxes";

/**
 * Create a long-lived mailbox on any domain. With CF_API_TOKEN set, the
 * domain picker lists every zone in the Cloudflare account, and the dialog
 * shows what is already in place in Cloudflare and what creating the
 * mailbox will change (Email Routing, the address rule, Email Sending,
 * delivery tracking) before anything changes.
 */
export default function NewMailboxDialog({
	open,
	onOpenChange,
	configuredDomains,
	existing,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Domains the app already works with (DOMAINS and mailbox domains). */
	configuredDomains: string[];
	/** Addresses of existing mailboxes. */
	existing: string[];
}) {
	const ids = useId();
	const toast = useKumoToastManager();
	const navigate = useNavigate();
	const createMailbox = useCreateMailbox();
	const zones = useZones();
	const cf = zones.data?.enabled === true;
	const worker = zones.data?.worker;

	// Domains with mailboxes first, then every other zone in the account.
	const inUse = useMemo(() => [...new Set(configuredDomains.map((d) => d.toLowerCase()))].sort(), [configuredDomains]);
	const others = useMemo(() => (cf ? (zones.data?.zones ?? []).filter((z) => !inUse.includes(z)) : []), [cf, zones.data, inUse]);

	const [local, setLocal] = useState("");
	const [domain, setDomain] = useState("");
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [outcome, setOutcome] = useState<{ email: string; results: StepResult[]; error?: string } | null>(null);

	useEffect(() => {
		if (!domain && (inUse[0] || others[0])) setDomain(inUse[0] || others[0]);
	}, [domain, inUse, others]);
	// A fresh form each time the dialog opens.
	useEffect(() => {
		if (open) {
			setLocal("");
			setName("");
			setError(null);
			setOutcome(null);
		}
	}, [open]);

	const { data: setup, error: setupError, isLoading: setupLoading } = useDomainSetup(domain, { enabled: cf && open });
	const [catchAll, setCatchAll] = useCatchAllChoice(setup, worker);

	const localPart = local.trim().toLowerCase();
	const email = localPart && domain ? `${localPart}@${domain}` : "";
	const localError = localPart && !LOCAL_PART_RE.test(localPart) ? LOCAL_PART_HINT : null;
	const taken = !!email && existing.map((e) => e.toLowerCase()).includes(email);
	const steps = useMemo(
		() => (setup ? planSetup(setup, { address: email && !localError ? email : undefined, catchAll, worker }) : []),
		[setup, email, localError, catchAll, worker],
	);
	const todo = steps.filter((s) => s.state === "todo").length;
	const canSubmit = !!email && !localError && !taken && !createMailbox.isPending && (!cf || !!setup);

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		if (!canSubmit) return;
		try {
			const res = await createMailbox.mutateAsync({ email, name: name.trim() || localPart, setup: cf ? { catchAll } : undefined });
			const results = res.setup?.results ?? [];
			const failed = results.filter((r) => !r.ok);
			if (res.setupError || failed.length) {
				// Keep the dialog open: the mailbox exists, but part of the setup needs attention.
				setOutcome({ email, results, error: res.setupError });
				return;
			}
			toast.add({ title: results.length ? `Created ${email} and applied ${results.length} Cloudflare change${results.length === 1 ? "" : "s"}` : `Created ${email}` });
			onOpenChange(false);
			navigate(`/mailbox/${encodeURIComponent(email)}/emails/inbox`);
		} catch (err) {
			setError((err as Error).message || "Could not create the mailbox");
		}
	};

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog size="lg" className="p-6 max-h-[90dvh] overflow-y-auto">
				<Dialog.Title className="text-base font-semibold mb-1">New mailbox</Dialog.Title>
				<p className="text-[0.8125rem] text-kumo-subtle mb-5">
					A permanent address with its own Inbox, agent, burners and settings.
					{cf ? " The app sets up Cloudflare for it." : ""}
				</p>

				{outcome ? (
					<div className="space-y-4">
						<p className="text-[0.8125rem] text-kumo-default">
							<span className="ops-mono">{outcome.email}</span> was created, but part of the Cloudflare setup did not complete.
						</p>
						{outcome.error && <p className="text-xs text-[var(--ops-bad)] break-words">{outcome.error}</p>}
						{outcome.results.length > 0 && <StepResultList results={outcome.results} />}
						<p className="text-xs text-kumo-subtle">Fix the cause, then apply the remaining changes from the mailbox's Routing &amp; settings page.</p>
						<div className="flex justify-end gap-2 pt-2">
							<button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>
								Close
							</button>
							<button
								type="button"
								className="btn btn-primary"
								onClick={() => {
									onOpenChange(false);
									navigate(`/mailbox/${encodeURIComponent(outcome.email)}/settings`);
								}}
							>
								Open settings
							</button>
						</div>
					</div>
				) : (
					<form onSubmit={submit} className="space-y-4">
						<div>
							<label htmlFor={`${ids}-local`} className="field-label">
								Address
							</label>
							<div className="flex items-center gap-2 max-sm:flex-wrap">
								<input
									id={`${ids}-local`}
									className="field ops-mono flex-1 min-w-[8rem]"
									placeholder="hello"
									value={local}
									onChange={(e) => setLocal(e.target.value)}
									autoFocus
									autoComplete="off"
									autoCapitalize="none"
									spellCheck={false}
									aria-invalid={!!localError || taken}
									aria-describedby={`${ids}-addr-hint`}
								/>
								<span className="text-sm text-kumo-subtle">@</span>
								<select
									aria-label="Domain"
									className="field ops-mono flex-1 min-w-[10rem]"
									value={domain}
									onChange={(e) => setDomain(e.target.value)}
								>
									{inUse.length > 0 && (
										<optgroup label="Domains with mailboxes">
											{inUse.map((d) => (
												<option key={d} value={d}>
													{d}
												</option>
											))}
										</optgroup>
									)}
									{others.length > 0 && (
										<optgroup label="Other domains in Cloudflare">
											{others.map((d) => (
												<option key={d} value={d}>
													{d}
												</option>
											))}
										</optgroup>
									)}
								</select>
							</div>
							<span id={`${ids}-addr-hint`} className={`field-hint block ${localError || taken ? "!text-[var(--ops-bad)]" : ""}`}>
								{localError || (taken ? `${email} is already a mailbox.` : email ? <span className="ops-mono">{email}</span> : "Letters, numbers, dots, dashes and underscores.")}
							</span>
						</div>

						<label className="block">
							<span className="field-label">Display name (optional)</span>
							<input className="field" placeholder={localPart || "Hello"} value={name} onChange={(e) => setName(e.target.value)} />
							<span className="field-hint block">Recipients see this name. You can change it later.</span>
						</label>

						<section aria-labelledby={`${ids}-cf`} className="rounded-md border border-kumo-line px-3 py-3">
							<h3 id={`${ids}-cf`} className="flex items-center gap-2 text-[0.8125rem] font-semibold text-kumo-default mb-3">
								<CloudIcon size={15} className="text-kumo-subtle" />
								Cloudflare setup for @{domain || "…"}
								{cf && setup && <span className={todo ? "chip chip-accent" : "chip chip-ok"}>{todo ? `${todo} change${todo === 1 ? "" : "s"}` : "Ready"}</span>}
							</h3>
							{zones.isLoading ? (
								<p className="text-xs text-kumo-subtle">Loading…</p>
							) : !cf ? (
								<TokenMissing />
							) : setupLoading ? (
								<p className="text-xs text-kumo-subtle">Reading the setup of @{domain} from Cloudflare…</p>
							) : setupError ? (
								<p className="text-xs text-[var(--ops-bad)] break-words">{(setupError as Error).message}</p>
							) : setup ? (
								<div className="space-y-3">
									<CatchAllChoice setup={setup} worker={worker} checked={catchAll} onChange={setCatchAll} />
									<SetupStepList steps={steps} />
								</div>
							) : null}
						</section>

						{error && <p className="text-xs text-[var(--ops-bad)] break-words">{error}</p>}

						<div className="flex justify-end gap-2 pt-1">
							<button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>
								Cancel
							</button>
							<button type="submit" className="btn btn-primary" disabled={!canSubmit}>
								{createMailbox.isPending
									? todo
										? "Creating and setting up…"
										: "Creating…"
									: cf && todo
										? "Create and set up Cloudflare"
										: "Create mailbox"}
							</button>
						</div>
					</form>
				)}
			</Dialog>
		</Dialog.Root>
	);
}
