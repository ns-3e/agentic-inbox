// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useKumoToastManager } from "@cloudflare/kumo";
import { CheckCircleIcon, InfoIcon, PlusCircleIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import {
	addressHealth,
	catchAllReachesApp,
	defaultCatchAllChoice,
	type DomainSetup,
	type Health,
	HEALTH_LABEL,
	planSetup,
	type SetupStep,
	type StepResult,
} from "shared/provisioning";
import { useApplyDomainSetup, useDomainSetup, useZones } from "~/queries/cloudflare";

const HEALTH_CHIP: Record<Health, string> = {
	ready: "chip chip-ok",
	"no-send": "chip chip-warn",
	"no-receive": "chip chip-bad",
	off: "chip chip-bad",
};

export function HealthChip({ setup, address, worker }: { setup: DomainSetup; address: string; worker?: string }) {
	const health = addressHealth(setup, address, worker);
	return <span className={HEALTH_CHIP[health]}>{HEALTH_LABEL[health]}</span>;
}

/** The plan: what is in place, and what the app will change. */
export function SetupStepList({ steps }: { steps: SetupStep[] }) {
	return (
		<ul className="list-none m-0 p-0 space-y-2">
			{steps.map((s) => (
				<li key={s.id} className="flex items-start gap-2 text-[0.8125rem] leading-snug">
					{s.state === "done" ? (
						<CheckCircleIcon size={16} weight="fill" className="text-[var(--ops-ok)] shrink-0 mt-px" aria-label="In place" />
					) : s.state === "todo" ? (
						<PlusCircleIcon size={16} weight="bold" className="text-kumo-brand shrink-0 mt-px" aria-label="Will change" />
					) : (
						<InfoIcon size={16} className="text-kumo-subtle shrink-0 mt-px" aria-label="Note" />
					)}
					<span className="min-w-0">
						<span className={`break-words ${s.state === "todo" ? "text-kumo-default font-semibold" : s.state === "done" ? "text-kumo-default" : "text-kumo-subtle"}`}>{s.label}</span>
						{s.detail && <span className="block text-xs text-kumo-subtle">{s.detail}</span>}
						{s.replaces && (
							<span className="flex items-start gap-1 text-xs text-[var(--ops-warn)]">
								<WarningIcon size={12} weight="bold" className="shrink-0 mt-0.5" />
								<span>
									Replaces your route. {s.replaces}
								</span>
							</span>
						)}
					</span>
				</li>
			))}
		</ul>
	);
}

/** What happened when the app applied the plan. */
export function StepResultList({ results }: { results: StepResult[] }) {
	return (
		<ul className="list-none m-0 p-0 space-y-2">
			{results.map((r) => (
				<li key={r.id} className="flex items-start gap-2 text-[0.8125rem] leading-snug">
					{r.ok ? (
						<CheckCircleIcon size={16} weight="fill" className="text-[var(--ops-ok)] shrink-0 mt-px" aria-label="Done" />
					) : (
						<XCircleIcon size={16} weight="fill" className="text-[var(--ops-bad)] shrink-0 mt-px" aria-label="Failed" />
					)}
					<span className="min-w-0">
						<span className="text-kumo-default">{r.ok ? r.label : `Failed: ${r.label.charAt(0).toLowerCase()}${r.label.slice(1)}`}</span>
						{r.detail && <span className={`block text-xs break-words ${r.ok ? "text-kumo-subtle" : "text-[var(--ops-bad)]"}`}>{r.detail}</span>}
					</span>
				</li>
			))}
		</ul>
	);
}

/** Checkbox for sending unknown addresses to the app. Hidden when that is already the case. */
export function CatchAllChoice({
	setup,
	worker,
	checked,
	onChange,
}: {
	setup: DomainSetup;
	worker?: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	if (catchAllReachesApp(setup, worker)) return null;
	return (
		<label className="flex items-start gap-2 text-[0.8125rem] cursor-pointer">
			<input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-kumo-brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
			<span>
				<span className="text-kumo-default">Also send unknown addresses on @{setup.domain} to this app</span>
				<span className="block text-xs text-kumo-subtle">
					Needed for the Other addresses folder. Burners work without it: each burner gets its own rule.
				</span>
			</span>
		</label>
	);
}

/** Default for CatchAllChoice, reset when the domain's setup first loads. */
export function useCatchAllChoice(setup: DomainSetup | undefined, worker?: string) {
	const [choice, setChoice] = useState<boolean | null>(null);
	const domain = setup?.domain;
	useEffect(() => setChoice(null), [domain]);
	return [choice ?? defaultCatchAllChoice(setup ?? null, worker), setChoice] as const;
}

/**
 * Cloudflare status of a domain (and one address on it), with one button
 * that applies every missing step. Used on a mailbox's settings page.
 */
export function DomainSetupPanel({ domain, address }: { domain: string; address?: string }) {
	const toast = useKumoToastManager();
	const zones = useZones();
	const enabled = zones.data?.enabled === true;
	const worker = zones.data?.worker;
	const { data: setup, error, isLoading, refetch, isFetching } = useDomainSetup(domain, { enabled });
	const apply = useApplyDomainSetup();
	const [catchAll, setCatchAll] = useCatchAllChoice(setup, worker);
	const [results, setResults] = useState<StepResult[] | null>(null);
	const steps = useMemo(() => (setup ? planSetup(setup, { address, catchAll, worker }) : []), [setup, address, catchAll, worker]);
	const todo = steps.filter((s) => s.state === "todo").length;

	if (zones.isLoading) return <div className="text-xs text-kumo-subtle">Loading Cloudflare status…</div>;
	if (zones.error) return <p className="text-xs text-[var(--ops-bad)]">{(zones.error as Error).message}</p>;
	if (!enabled) return <TokenMissing />;
	if (isLoading) return <div className="text-xs text-kumo-subtle">Reading the setup of @{domain} from Cloudflare…</div>;
	if (error || !setup) {
		return (
			<div className="space-y-2">
				<p className="text-xs text-[var(--ops-bad)] break-words">{(error as Error)?.message || "Could not read the setup"}</p>
				<button type="button" className="btn btn-ghost !h-7 !px-2 !text-xs" onClick={() => void refetch()}>
					Try again
				</button>
			</div>
		);
	}

	const run = async () => {
		try {
			const out = await apply.mutateAsync({ domain, address, catchAll });
			setResults(out.results);
			const failed = out.results.filter((r) => !r.ok).length;
			toast.add(
				failed
					? { title: `${failed} of ${out.results.length} Cloudflare changes failed`, variant: "error" }
					: { title: `Applied ${out.results.length} Cloudflare change${out.results.length === 1 ? "" : "s"} for @${domain}` },
			);
		} catch (e) {
			toast.add({ title: (e as Error).message || "Could not apply the setup", variant: "error" });
		}
	};

	return (
		<div className="space-y-4 max-w-lg">
			{address && (
				<div className="flex items-center gap-2 text-xs text-kumo-subtle">
					Status <HealthChip setup={setup} address={address} worker={worker} />
				</div>
			)}
			<CatchAllChoice setup={setup} worker={worker} checked={catchAll} onChange={setCatchAll} />
			<SetupStepList steps={steps} />
			{results && results.length > 0 && (
				<div className="rounded-md border border-kumo-line bg-kumo-tint px-3 py-2.5">
					<div className="text-xs font-semibold text-kumo-default mb-2">Last run</div>
					<StepResultList results={results} />
				</div>
			)}
			<div className="flex items-center gap-2">
				<button type="button" className="btn btn-primary" disabled={todo === 0 || apply.isPending} onClick={() => void run()}>
					{apply.isPending ? "Applying…" : todo === 0 ? "Nothing to change" : `Apply ${todo} change${todo === 1 ? "" : "s"} in Cloudflare`}
				</button>
				<button type="button" className="btn btn-ghost" disabled={isFetching} onClick={() => void refetch()}>
					{isFetching ? "Checking…" : "Check again"}
				</button>
			</div>
		</div>
	);
}

export function TokenMissing() {
	return (
		<div className="rounded-md border border-kumo-line bg-kumo-tint px-3 py-2.5 text-xs text-kumo-subtle max-w-lg">
			Cloudflare setup from the app is off. To turn it on, add a <span className="ops-mono">CF_API_TOKEN</span> secret to the Worker
			(see README, Cloudflare setup from the app). Until then, set up Email Routing and Email Sending in the Cloudflare dashboard.
		</div>
	);
}
