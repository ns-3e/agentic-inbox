// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Switch, useKumoToastManager } from "@cloudflare/kumo";
import {
	ArrowCounterClockwiseIcon,
	CheckIcon,
	DownloadSimpleIcon,
	GearSixIcon,
	MonitorIcon,
	MoonIcon,
	PaintBrushIcon,
	RobotIcon,
	SunIcon,
	UploadSimpleIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useParams } from "react-router";
import { formatListDate } from "shared/dates";
import { mailboxHue } from "~/components/EmailListRow";
import ShortcutsDialog from "~/components/ShortcutsDialog";
import { usePreferences } from "~/hooks/usePreferences";
import { type ReadingPane, useUIStore } from "~/hooks/useUIStore";
import {
	ACCENT_PRESETS,
	AGENT_PRESETS,
	accentPair,
	contrastRatio,
	DEFAULT_PREFERENCES,
	hour12For,
	isHexColor,
	normalizePreferences,
	PAGE_SIZES,
	type Preferences,
	REFRESH_OPTIONS,
	TEXT_SIZES,
	UNDO_SEND_OPTIONS,
} from "~/lib/preferences";
import { useMailboxes } from "~/queries/mailboxes";

export function meta() {
	return [{ title: "Preferences · Agentic Inbox" }];
}

/**
 * App-wide preferences: appearance, list, reading, sending and keyboard.
 * Every change applies at once and is saved in this browser.
 * Per-mailbox settings (sender name, signature, routing, agent prompt)
 * stay on each mailbox's Routing & settings page.
 */
export default function PreferencesRoute() {
	const prefs = usePreferences();
	const set = prefs.set;
	const { readingPane, setReadingPane } = useUIStore();
	const [showShortcuts, setShowShortcuts] = useState(false);
	const toast = useKumoToastManager();
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const changed = (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]).filter(
		(k) => prefs[k] !== DEFAULT_PREFERENCES[k],
	).length + (readingPane !== "none" ? 1 : 0);

	const resetAll = () => {
		if (!window.confirm("Reset all preferences to their defaults?")) return;
		prefs.reset();
		setReadingPane("none");
		toast.add({ title: "Preferences reset to defaults" });
	};

	return (
		<div className="h-full flex flex-col min-h-0 overflow-hidden">
			<header className="page-head">
				<PaintBrushIcon size={18} className="text-kumo-subtle shrink-0" />
				<div className="min-w-0">
					<h1 className="page-title">Preferences</h1>
					<div className="page-meta">Changes apply at once and are saved in this browser. They apply to every mailbox.</div>
				</div>
				<div className="ml-auto flex items-center gap-2">
					<button type="button" className="btn btn-ghost" onClick={resetAll} disabled={changed === 0} title="Reset all preferences">
						<ArrowCounterClockwiseIcon size={14} />
						<span className="hidden sm:inline">Reset all</span>
					</button>
				</div>
			</header>

			<div className="flex-1 min-h-0 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
				<AppearanceSections prefs={prefs} set={set} />

				<Section id="list" title="Conversation list" desc="How the queue is laid out and how often it checks for new mail.">
					<Field label="Reading pane" hint="Split shows the open conversation next to the list (wide screens).">
						<Segmented<ReadingPane>
							label="Reading pane"
							value={readingPane}
							onChange={setReadingPane}
							options={[
								{ value: "none", label: "Full-width list" },
								{ value: "right", label: "Split" },
							]}
						/>
					</Field>
					<div className="grid sm:grid-cols-2 gap-4">
						<Field label="Conversations per page" hint="Desktop. Phones load more as you scroll.">
							<select className="field" value={prefs.pageSize} onChange={(e) => set({ pageSize: Number(e.target.value) })} aria-label="Conversations per page">
								{PAGE_SIZES.map((n) => (
									<option key={n} value={n}>
										{n}
									</option>
								))}
							</select>
						</Field>
						<Field label="Check for new mail">
							<select className="field" value={prefs.refreshSeconds} onChange={(e) => set({ refreshSeconds: Number(e.target.value) })} aria-label="Check for new mail">
								{REFRESH_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</select>
						</Field>
					</div>
					<Field label="Clock" hint={<ClockSample clock={prefs.clock} />}>
						<Segmented
							label="Clock"
							value={prefs.clock}
							onChange={(clock) => set({ clock })}
							options={[
								{ value: "system", label: "System" },
								{ value: "12h", label: "12-hour" },
								{ value: "24h", label: "24-hour" },
							]}
						/>
					</Field>
					<Toggle
						label="Show message previews"
						hint="The first line of the latest message after the subject."
						checked={prefs.showSnippets}
						onChange={(showSnippets) => set({ showSnippets })}
					/>
					<Toggle
						label="Flag conversations that await a reply"
						hint={
							<>
								Shows <span className="chip chip-warn">Awaiting reply</span> on read conversations that have no reply yet.
							</>
						}
						checked={prefs.showAwaitingReply}
						onChange={(showAwaitingReply) => set({ showAwaitingReply })}
					/>
				</Section>

				<Section id="reading" title="Reading" desc="What happens when you open, archive or delete a conversation.">
					<Toggle
						label="Mark as read when opened"
						hint="Off: conversations stay unread until you press Shift + i or use Mark as read."
						checked={prefs.markReadOnOpen}
						onChange={(markReadOnOpen) => set({ markReadOnOpen })}
					/>
					<Field label="After you archive or delete the open conversation">
						<select className="field" value={prefs.afterAction} onChange={(e) => set({ afterAction: e.target.value as Preferences["afterAction"] })} aria-label="After archive or delete">
							<option value="list">Go back to the list</option>
							<option value="older">Open the next older conversation</option>
							<option value="newer">Open the next newer conversation</option>
						</select>
					</Field>
					<Field label="Remote images" hint="Blocking stops tracking pixels. Images attached to the message always show.">
						<Segmented
							label="Remote images"
							value={prefs.remoteImages}
							onChange={(remoteImages) => set({ remoteImages })}
							options={[
								{ value: "load", label: "Always show" },
								{ value: "block", label: "Ask first" },
							]}
						/>
					</Field>
				</Section>

				<Section id="sending" title="Sending" desc="Safety checks before a message leaves.">
					<Field label="Undo send" hint="How long the Undo button stays after you press Send. The message goes out when it closes.">
						<Segmented
							label="Undo send"
							value={String(prefs.undoSendSeconds)}
							onChange={(v) => set({ undoSendSeconds: Number(v) })}
							options={UNDO_SEND_OPTIONS.map((n) => ({ value: String(n), label: n === 0 ? "Off" : `${n}s` }))}
						/>
					</Field>
					<Toggle
						label="Ask before sending without a subject"
						checked={prefs.confirmNoSubject}
						onChange={(confirmNoSubject) => set({ confirmNoSubject })}
					/>
					<p className="field-hint">The display name and signature are set for each mailbox. See Mailbox settings below.</p>
				</Section>

				<Section id="keyboard" title="Keyboard" desc="Single-key shortcuts for the desktop, in the style of Gmail.">
					<Toggle
						label="Keyboard shortcuts"
						hint="Turn off if single keys conflict with a screen reader or other tools."
						checked={prefs.shortcuts}
						onChange={(shortcuts) => set({ shortcuts })}
					/>
					<div>
						<button type="button" className="btn" onClick={() => setShowShortcuts(true)}>
							Show all shortcuts
						</button>
					</div>
				</Section>

				<MailboxLinks current={mailboxId} />

				<BackupSection prefs={prefs} />
			</div>

			<ShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
		</div>
	);
}

// ── Appearance ─────────────────────────────────────────────────────

function AppearanceSections({ prefs, set }: { prefs: Preferences; set: (p: Partial<Preferences>) => void }) {
	return (
		<>
			<Section id="theme" title="Theme" desc="System follows your device's light or dark setting.">
				<div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3 max-w-lg">
					{(
						[
							{ value: "system", label: "System", icon: <MonitorIcon size={14} /> },
							{ value: "light", label: "Light", icon: <SunIcon size={14} /> },
							{ value: "dark", label: "Dark", icon: <MoonIcon size={14} /> },
						] as const
					).map((t) => (
						<button
							key={t.value}
							type="button"
							role="radio"
							aria-checked={prefs.theme === t.value}
							onClick={() => set({ theme: t.value })}
							className="theme-card"
						>
							<ThemeThumb mode={t.value} />
							<span className="flex items-center gap-1.5 px-2.5 py-2 text-[0.8125rem] font-semibold">
								{t.icon}
								{t.label}
								{prefs.theme === t.value && <CheckIcon size={13} weight="bold" className="ml-auto text-kumo-brand" />}
							</span>
						</button>
					))}
				</div>
			</Section>

			<Section
				id="accent"
				title="Accent color"
				desc="Used for selection, primary buttons, unread marks, links and focus rings. Light and dark shades are tuned for contrast."
			>
				<AccentPicker prefs={prefs} set={set} />
				<AccentPreview />
			</Section>

			<Section id="agent" title="Agent color" desc="Marks the agent and everything it does, so machine actions never look like yours.">
				<div role="radiogroup" aria-label="Agent color" className="flex flex-wrap gap-2">
					{AGENT_PRESETS.map((p) => (
						<Swatch key={p.id} label={p.label} light={p.light} dark={p.dark} selected={prefs.agentColor === p.id} onSelect={() => set({ agentColor: p.id })} />
					))}
				</div>
				<div className="flex flex-wrap items-center gap-2 rounded-md border border-kumo-line bg-kumo-tint px-3 py-2.5">
					<span className="btn !border-[var(--ops-agent)] !text-[var(--ops-agent)] !bg-[var(--ops-agent-tint)] pointer-events-none">
						<RobotIcon size={16} />
						Agent
					</span>
					<span className="chip chip-agent">Drafted by agent</span>
					<span className="text-xs text-[var(--ops-agent)] font-semibold">Running · search_emails</span>
				</div>
			</Section>

			<Section id="size" title="Size and density" desc="Text size scales type and spacing together. Density changes only row heights.">
				<Field label="Text size">
					<div role="radiogroup" aria-label="Text size" className="segmented">
						{TEXT_SIZES.map((t, i) => (
							<button
								key={t.id}
								type="button"
								role="radio"
								aria-checked={prefs.textSize === t.id}
								onClick={() => set({ textSize: t.id })}
								title={`${t.label} (${t.scale})`}
								className="!px-3"
							>
								<span aria-hidden style={{ fontSize: `${11 + i * 2}px` }} className="font-semibold leading-none">
									Aa
								</span>
								<span className="sr-only">{t.label}</span>
							</button>
						))}
					</div>
					<span className="field-hint block">{TEXT_SIZES.find((t) => t.id === prefs.textSize)?.label}</span>
				</Field>
				<Field label="Density">
					<div role="radiogroup" aria-label="Density" className="grid grid-cols-3 gap-3 max-w-lg">
						{(
							[
								{ value: "compact", label: "Compact", rows: 5 },
								{ value: "default", label: "Default", rows: 4 },
								{ value: "comfortable", label: "Comfortable", rows: 3 },
							] as const
						).map((d) => (
							<button key={d.value} type="button" role="radio" aria-checked={prefs.density === d.value} onClick={() => set({ density: d.value })} className="theme-card">
								<span className="flex flex-col justify-around h-14 px-2.5 py-1.5 bg-kumo-base border-b border-kumo-line" aria-hidden>
									{Array.from({ length: d.rows }, (_, i) => (
										<span key={i} className="flex items-center gap-1.5">
											<span className={`dot !w-1.5 !h-1.5 ${i === 0 ? "bg-kumo-brand" : "bg-kumo-fill"}`} />
											<span className="h-1 rounded-full bg-kumo-fill" style={{ width: `${60 - i * 8}%` }} />
										</span>
									))}
								</span>
								<span className="flex items-center px-2.5 py-2 text-[0.8125rem] font-semibold">
									{d.label}
									{prefs.density === d.value && <CheckIcon size={13} weight="bold" className="ml-auto text-kumo-brand" />}
								</span>
							</button>
						))}
					</div>
				</Field>
				<Field label="Motion" hint="Reduce turns off animations even when your device allows them.">
					<Segmented
						label="Motion"
						value={prefs.motion}
						onChange={(motion) => set({ motion })}
						options={[
							{ value: "system", label: "Follow system" },
							{ value: "reduce", label: "Reduce" },
						]}
					/>
				</Field>
			</Section>
		</>
	);
}

function AccentPicker({ prefs, set }: { prefs: Preferences; set: (p: Partial<Preferences>) => void }) {
	const [hex, setHex] = useState(prefs.customAccent);
	useEffect(() => setHex(prefs.customAccent), [prefs.customAccent]);
	const valid = isHexColor(hex);
	const custom = prefs.accent === "custom";
	const pair = accentPair({ accent: "custom", customAccent: valid ? normalizeHex(hex) : prefs.customAccent });
	const adjusted = valid && custom && pair.light.toLowerCase() !== normalizeHex(hex).toLowerCase();

	const applyHex = (v: string) => {
		setHex(v);
		if (isHexColor(v)) set({ accent: "custom", customAccent: normalizeHex(v) });
	};

	return (
		<div className="space-y-3">
			<div role="radiogroup" aria-label="Accent color" className="flex flex-wrap gap-2">
				{ACCENT_PRESETS.map((p) => (
					<Swatch key={p.id} label={p.label} light={p.light} dark={p.dark} selected={prefs.accent === p.id} onSelect={() => set({ accent: p.id })} />
				))}
				<Swatch
					label="Custom"
					light={pair.light}
					dark={pair.dark}
					selected={custom}
					onSelect={() => set({ accent: "custom" })}
					custom
				/>
			</div>
			<div className="flex flex-wrap items-end gap-3">
				<label className="block">
					<span className="field-label">Custom color</span>
					<span className="flex items-center gap-2">
						<input
							type="color"
							value={valid ? normalizeHex(hex) : "#000000"}
							onChange={(e) => applyHex(e.target.value)}
							aria-label="Pick a custom accent color"
							className="h-8 w-10 cursor-pointer rounded-md border border-[var(--ops-line-strong)] bg-kumo-control p-0.5"
						/>
						<input
							className="field ops-mono !w-28"
							value={hex}
							onChange={(e) => applyHex(e.target.value.trim())}
							spellCheck={false}
							aria-label="Custom accent hex value"
							aria-invalid={!valid}
							placeholder="#0b6e78"
						/>
					</span>
				</label>
				{custom && (
					<div className="text-xs text-kumo-subtle pb-1.5 tabular">
						Light <span className="ops-mono">{pair.light}</span> · Dark <span className="ops-mono">{pair.dark}</span> · Contrast{" "}
						<span className="ops-mono">{contrastRatio(pair.light, "#ffffff").toFixed(1)}:1</span>
					</div>
				)}
			</div>
			{!valid && <p className="field-hint !text-[var(--ops-bad)]">Enter a hex color, for example #0b6e78.</p>}
			{adjusted && <p className="field-hint">The light shade was darkened so white text on it stays readable.</p>}
		</div>
	);
}

function normalizeHex(v: string): string {
	let h = v.trim().replace(/^#/, "").toLowerCase();
	if (h.length === 3) h = h.split("").map((c) => c + c).join("");
	return `#${h}`;
}

/** A live sample of every place the accent shows. Uses the real component classes. */
function AccentPreview() {
	return (
		<div className="rounded-md border border-kumo-line overflow-hidden" aria-label="Accent preview">
			<div className="grid sm:grid-cols-[11rem_1fr]">
				<div className="bg-kumo-recessed border-b sm:border-b-0 sm:border-r border-kumo-line py-2">
					<span className="nav-pill active pointer-events-none">
						Inbox
						<span className="nav-count ml-auto">12</span>
					</span>
					<span className="nav-pill pointer-events-none">
						Archive
					</span>
				</div>
				<div className="bg-kumo-base">
					<div className="mail-row flex items-center gap-2.5 h-[var(--row-h)] px-3 text-[0.8125rem] border-b border-kumo-line" data-selected="true">
						<span className="dot bg-kumo-brand" />
						<span className="font-semibold">Selected conversation</span>
					</div>
					<div className="mail-row flex items-center gap-2.5 h-[var(--row-h)] px-3 text-[0.8125rem] border-b border-kumo-line">
						<span className="dot bg-kumo-brand" />
						<span className="font-semibold">Unread conversation</span>
						<span className="text-kumo-subtle truncate">— with a preview line</span>
					</div>
					<div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
						<span className="btn btn-primary pointer-events-none">Send</span>
						<span className="chip chip-accent">This mailbox</span>
						<span className="text-[0.8125rem] text-kumo-link underline">A link</span>
						<input className="field !w-36" placeholder="Focus ring" aria-label="Focus ring sample" />
					</div>
				</div>
			</div>
		</div>
	);
}

/** A color choice: the light shade on the left half, the dark shade on the right. */
function Swatch({
	label,
	light,
	dark,
	selected,
	onSelect,
	custom,
}: {
	label: string;
	light: string;
	dark: string;
	selected: boolean;
	onSelect: () => void;
	custom?: boolean;
}) {
	return (
		<button type="button" role="radio" aria-checked={selected} onClick={onSelect} title={label} className="swatch">
			<span
				className="swatch-chip"
				style={{ background: custom && !selected ? "conic-gradient(#e5484d, #f5a524, #30a46c, #0091ff, #8e4ec6, #e5484d)" : `linear-gradient(135deg, ${light} 50%, ${dark} 50%)` }}
				aria-hidden
			>
				{selected && <CheckIcon size={14} weight="bold" className="text-white drop-shadow" />}
			</span>
			<span className="text-xs text-kumo-strong">{label}</span>
		</button>
	);
}

/** Miniature of the console in one theme. */
function ThemeThumb({ mode }: { mode: "system" | "light" | "dark" }) {
	const pane = (m: "light" | "dark") => (
		<span className="flex h-full flex-1" style={{ colorScheme: m }}>
			<span className="w-1/3 h-full bg-kumo-recessed border-r border-kumo-line flex flex-col gap-1 p-1.5">
				<span className="h-1.5 rounded-sm bg-kumo-brand opacity-90" />
				<span className="h-1.5 rounded-sm bg-kumo-fill" />
				<span className="h-1.5 rounded-sm bg-kumo-fill" />
			</span>
			<span className="flex-1 h-full bg-kumo-base flex flex-col gap-1.5 p-1.5">
				<span className="h-1.5 w-3/4 rounded-sm bg-kumo-fill" />
				<span className="h-1.5 w-2/3 rounded-sm bg-kumo-fill" />
				<span className="h-1.5 w-1/2 rounded-sm bg-kumo-fill" />
			</span>
		</span>
	);
	return (
		<span className="flex h-16 overflow-hidden border-b border-kumo-line" aria-hidden>
			{mode === "system" ? (
				<>
					{pane("light")}
					{pane("dark")}
				</>
			) : (
				pane(mode)
			)}
		</span>
	);
}

function ClockSample({ clock }: { clock: Preferences["clock"] }) {
	const sample = new Date();
	sample.setHours(15, 42, 0, 0);
	return <>Example: <span className="ops-mono">{formatListDate(sample.toISOString(), hour12For(clock))}</span></>;
}

// ── Mailboxes and backup ───────────────────────────────────────────

function MailboxLinks({ current }: { current?: string }) {
	const { data: mailboxes = [] } = useMailboxes();
	return (
		<Section id="mailboxes" title="Mailbox settings" desc="Display name, signature, catch-all routing and agent instructions are set for each mailbox.">
			{mailboxes.length === 0 ? (
				<p className="text-xs text-kumo-subtle">No mailboxes yet.</p>
			) : (
				<ul className="rounded-md border border-kumo-line divide-y divide-[var(--color-kumo-line)] overflow-hidden">
					{mailboxes.map((m) => (
						<li key={m.id}>
							<RouterLink
								to={`/mailbox/${encodeURIComponent(m.id)}/settings`}
								className="flex items-center gap-2.5 h-[var(--table-row-h)] px-3 no-underline text-kumo-default hover:bg-[var(--mail-row-hover)]"
							>
								<span className="dot" style={{ backgroundColor: `hsl(${mailboxHue(m.id)} 60% 48%)` }} />
								<span className="ops-mono text-[0.8125rem] truncate">{m.email}</span>
								{m.id === current && <span className="chip chip-accent">This mailbox</span>}
								<span className="ml-auto flex items-center gap-1 text-xs text-kumo-subtle">
									<GearSixIcon size={14} />
									Routing &amp; settings
								</span>
							</RouterLink>
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}

function BackupSection({ prefs }: { prefs: Preferences }) {
	const toast = useKumoToastManager();
	const fileRef = useRef<HTMLInputElement>(null);
	const set = usePreferences((s) => s.set);
	const setReadingPane = useUIStore((s) => s.setReadingPane);
	const readingPane = useUIStore((s) => s.readingPane);

	const exportPrefs = () => {
		const data: Record<string, unknown> = { readingPane };
		for (const k of Object.keys(DEFAULT_PREFERENCES)) data[k] = prefs[k as keyof Preferences];
		const blob = new Blob([JSON.stringify({ app: "agentic-inbox", preferences: data }, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "agentic-inbox-preferences.json";
		a.click();
		URL.revokeObjectURL(url);
	};

	const importPrefs = async (file: File) => {
		try {
			const json = JSON.parse(await file.text());
			const raw = json?.preferences ?? json;
			if (!raw || typeof raw !== "object") throw new Error("bad file");
			set(normalizePreferences(raw));
			if (raw.readingPane === "none" || raw.readingPane === "right") setReadingPane(raw.readingPane);
			toast.add({ title: "Preferences imported" });
		} catch {
			toast.add({ title: "That file is not a preferences export", variant: "error" });
		}
	};

	return (
		<Section id="backup" title="Move to another browser" desc="Preferences are saved in this browser only. Export them to a file, then import the file in another browser.">
			<div className="flex flex-wrap gap-2">
				<button type="button" className="btn" onClick={exportPrefs}>
					<DownloadSimpleIcon size={14} />
					Export
				</button>
				<button type="button" className="btn" onClick={() => fileRef.current?.click()}>
					<UploadSimpleIcon size={14} />
					Import
				</button>
				<input
					ref={fileRef}
					type="file"
					accept="application/json,.json"
					className="hidden"
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) void importPrefs(f);
						e.target.value = "";
					}}
				/>
			</div>
		</Section>
	);
}

// ── Building blocks ────────────────────────────────────────────────

function Section({ id, title, desc, children }: { id: string; title: string; desc: string; children: ReactNode }) {
	return (
		<section className="config-section" aria-labelledby={`pref-${id}`} id={id}>
			<div>
				<h2 id={`pref-${id}`} className="config-title">
					{title}
				</h2>
				<p className="config-desc">{desc}</p>
			</div>
			<div className="space-y-4 min-w-0">{children}</div>
		</section>
	);
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
	return (
		<div>
			<span className="field-label">{label}</span>
			{children}
			{hint && <span className="field-hint block">{hint}</span>}
		</div>
	);
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
	return (
		<div className="flex items-start justify-between gap-4 max-w-xl">
			<div className="min-w-0">
				<div className="text-[0.8125rem] font-semibold text-kumo-default">{label}</div>
				{hint && <div className="field-hint !mt-0.5">{hint}</div>}
			</div>
			<Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
		</div>
	);
}

function Segmented<T extends string>({
	label,
	value,
	onChange,
	options,
}: {
	label: string;
	value: T;
	onChange: (v: T) => void;
	options: { value: T; label: string }[];
}) {
	return (
		<div role="radiogroup" aria-label={label} className="segmented">
			{options.map((o) => (
				<button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
					{o.label}
				</button>
			))}
		</div>
	);
}
