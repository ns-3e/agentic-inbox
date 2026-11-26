// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useKumoToastManager } from "@cloudflare/kumo";
import { FireIcon, PencilSimpleIcon, ShuffleIcon } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useState } from "react";
import { burnerDomains, LOCAL_PART_HINT, LOCAL_PART_RE, randomLocalPart } from "shared/burners";
import { useConfiguredDomains, useCreateBurner } from "~/queries/burners";
import { ApiError } from "~/services/api";
import type { Burner } from "~/types";

type Mode = "random" | "custom";

async function copy(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/**
 * Create a burner address: purpose, domain, and a random or custom name.
 * Random mode shows the exact name before creation; Shuffle picks another.
 * When `mailboxes` has more than one entry, a mailbox picker is shown and
 * `mailboxId` is only the first choice.
 */
export default function BurnerCreateForm({
	mailboxId: initialMailboxId,
	mailboxes,
	layout = "row",
	autoFocus = false,
	onCreated,
}: {
	mailboxId: string | undefined;
	mailboxes?: string[];
	layout?: "row" | "stack";
	autoFocus?: boolean;
	onCreated?: (burner: Burner) => void;
}) {
	const toast = useKumoToastManager();
	const ids = useId();
	const [mailboxId, setMailboxId] = useState(initialMailboxId);
	useEffect(() => setMailboxId(initialMailboxId), [initialMailboxId]);

	const configured = useConfiguredDomains();
	const domains = useMemo(() => burnerDomains(mailboxId, configured), [mailboxId, configured]);
	const ownDomain = mailboxId?.split("@")[1]?.toLowerCase() ?? "";
	const [domain, setDomain] = useState(ownDomain);
	// A new mailbox resets the domain to its own, unless the current choice is still valid.
	useEffect(() => {
		setDomain((d) => (d && domains.includes(d) ? d : ownDomain));
	}, [domains, ownDomain]);

	const [mode, setMode] = useState<Mode>("random");
	const [suggestion, setSuggestion] = useState("");
	const [custom, setCustom] = useState("");
	const [label, setLabel] = useState("");
	// Generated on the client only, so server and client renders match.
	useEffect(() => setSuggestion(randomLocalPart()), []);

	const createMutation = useCreateBurner(mailboxId);
	const customLocal = custom.trim().toLowerCase();
	const customError = mode === "custom" && customLocal && !LOCAL_PART_RE.test(customLocal) ? LOCAL_PART_HINT : null;
	const canSubmit = !!mailboxId && !createMutation.isPending && (mode === "random" ? !!suggestion : !!customLocal && !customError);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!canSubmit) return;
		const base = { label: label.trim() || undefined, domain: domain || undefined };
		try {
			let burner: (Burner & { routeWarning?: string }) | undefined;
			if (mode === "custom") {
				burner = await createMutation.mutateAsync({ ...base, localPart: customLocal });
			} else {
				// The previewed name can be taken in rare cases: try fresh names.
				let local = suggestion;
				for (let attempt = 0; attempt < 3 && !burner; attempt++) {
					try {
						burner = await createMutation.mutateAsync({ ...base, localPart: local });
					} catch (err) {
						if (!(err instanceof ApiError && err.status === 409) || attempt === 2) throw err;
						local = randomLocalPart();
					}
				}
			}
			if (!burner) return;
			setLabel("");
			setCustom("");
			setSuggestion(randomLocalPart());
			const copied = await copy(burner.address);
			toast.add({ title: copied ? `Created and copied ${burner.address}` : `Created ${burner.address}` });
			if (burner.routeWarning) toast.add({ title: burner.routeWarning, variant: "error" });
			onCreated?.(burner);
		} catch (err) {
			toast.add({ title: (err as Error).message || "Could not create burner", variant: "error" });
		}
	};

	const stack = layout === "stack";
	const showMailboxPicker = !!mailboxes && mailboxes.length > 1;

	const modeSwitch = (
		<div role="radiogroup" aria-label="Address type" className="inline-flex items-center rounded-md border border-[var(--ops-line-strong)] p-0.5 shrink-0">
			{(
				[
					["random", "Random", <ShuffleIcon key="r" size={12} weight="bold" />],
					["custom", "Custom", <PencilSimpleIcon key="c" size={12} weight="bold" />],
				] as const
			).map(([value, text, icon]) => (
				<button
					key={value}
					type="button"
					role="radio"
					aria-checked={mode === value}
					onClick={() => setMode(value)}
					className={`inline-flex items-center gap-1 h-6 px-2 rounded text-xs border-0 cursor-pointer ${mode === value ? "bg-kumo-fill text-kumo-default font-semibold" : "bg-transparent text-kumo-subtle hover:text-kumo-default"}`}
				>
					{icon}
					{text}
				</button>
			))}
		</div>
	);

	const domainControl =
		domains.length > 1 ? (
			<select
				value={domain}
				onChange={(e) => setDomain(e.target.value)}
				aria-label="Domain"
				className="h-8 max-w-[45%] shrink-0 border-0 border-l border-[var(--ops-line-strong)] bg-kumo-tint pl-2 pr-1 ops-mono text-[0.75rem] text-kumo-default cursor-pointer outline-none"
			>
				{domains.map((d) => (
					<option key={d} value={d}>
						@{d}
					</option>
				))}
			</select>
		) : (
			<span className="ops-mono text-[0.75rem] text-kumo-subtle pr-2.5 shrink-0">@{domain}</span>
		);

	const addressField = (
		<div className="flex-[1.4] min-w-0">
			<div className="flex items-center justify-between gap-2 mb-1">
				<span className="field-label !mb-0" id={`${ids}-addr`}>
					Address
				</span>
				{modeSwitch}
			</div>
			<div
				role="group"
				aria-labelledby={`${ids}-addr`}
				className={`flex items-center rounded-md border bg-kumo-control overflow-hidden ${customError ? "border-[var(--ops-bad)]" : "border-[var(--ops-line-strong)] focus-within:border-kumo-brand"}`}
			>
				{mode === "random" ? (
					<>
						<span className="flex-1 min-w-0 h-8 leading-8 px-2.5 ops-mono text-[0.8125rem] text-kumo-default truncate" aria-live="polite" title={suggestion}>
							{suggestion || "…"}
						</span>
						<button
							type="button"
							className="icon-btn !h-7 !w-7 shrink-0"
							onClick={() => setSuggestion(randomLocalPart())}
							aria-label="Shuffle: pick another random name"
							title="Shuffle"
						>
							<ShuffleIcon size={14} />
						</button>
					</>
				) : (
					<input
						className="flex-1 min-w-0 h-8 px-2.5 bg-transparent border-0 outline-none ops-mono text-[0.8125rem] text-kumo-default placeholder:text-kumo-subtle placeholder:font-sans"
						placeholder="your-name"
						value={custom}
						onChange={(e) => setCustom(e.target.value)}
						autoCapitalize="off"
						autoCorrect="off"
						spellCheck={false}
						autoFocus
						aria-label="Name before the @"
						aria-invalid={!!customError}
						aria-describedby={customError ? `${ids}-err` : undefined}
					/>
				)}
				{domainControl}
			</div>
			{customError && (
				<div id={`${ids}-err`} className="field-hint !text-[var(--ops-bad)]">
					{customError}
				</div>
			)}
		</div>
	);

	return (
		<form onSubmit={submit} className={stack ? "flex flex-col gap-4" : "flex flex-col md:flex-row md:items-end gap-3"}>
			{showMailboxPicker && (
				<label className={stack ? "" : "md:w-56 shrink-0"}>
					<span className="field-label">Delivers to</span>
					<select value={mailboxId} onChange={(e) => setMailboxId(e.target.value)} className="field ops-mono">
						{mailboxes!.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
				</label>
			)}
			<label className="flex-1 min-w-0">
				<span className="field-label">Purpose</span>
				<input className="field" placeholder="e.g. Shoe store sign-up" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus={autoFocus} />
			</label>
			{addressField}
			<button type="submit" className={`btn btn-primary ${stack ? "self-end" : "md:w-auto"}`} disabled={!canSubmit}>
				<FireIcon size={14} weight="bold" />
				{createMutation.isPending ? "Creating…" : "Create burner"}
			</button>
		</form>
	);
}
