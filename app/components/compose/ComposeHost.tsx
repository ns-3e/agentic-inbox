// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	ArrowBendDoubleUpLeftIcon,
	ArrowBendUpLeftIcon,
	ArrowBendUpRightIcon,
	ArrowLeftIcon,
	ArrowsInSimpleIcon,
	ArrowsOutSimpleIcon,
	CaretDownIcon,
	DotsThreeVerticalIcon,
	FileIcon,
	FireIcon,
	LinkSimpleIcon,
	MinusIcon,
	PaperclipIcon,
	PaperPlaneRightIcon,
	TextAaIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useParams } from "react-router";
import { useEffect, useRef, useState } from "react";
import RecipientInput from "~/components/compose/RecipientInput";
import Menu from "~/components/Menu";
import { ComposeEditorContent, FormattingToolbar, LinkPopover, useComposeEditor } from "~/components/RichTextEditor";
import { useActiveMailbox } from "~/hooks/useActiveMailbox";
import { type ComposeForm, useComposeForm } from "~/hooks/useComposeForm";
import { useIsDesktop } from "~/hooks/useMediaQuery";
import { type ComposeMode, useUIStore } from "~/hooks/useUIStore";
import { displayName } from "~/lib/address";
import { formatBytes } from "~/lib/utils";

/** Which mailbox the open composer sends from. */
function useComposeMailbox() {
	const { mailboxId: routeMailbox } = useParams<{ mailboxId: string }>();
	const ctx = useActiveMailbox();
	const options = useUIStore((s) => s.composeOptions);
	const mailboxId = options.mailboxId ?? (routeMailbox || ctx.composeFrom || ctx.mailboxId);
	const canPick = !routeMailbox && !options.mailboxId && !!ctx.mailboxes && ctx.mailboxes.length > 1 && !!ctx.setComposeFrom;
	return { mailboxId, canPick, mailboxes: ctx.mailboxes ?? [], setFrom: ctx.setComposeFrom };
}

function titleFor(mode: ComposeMode, subject: string, isDraft: boolean) {
	if (subject.trim()) return subject;
	if (isDraft) return "Draft";
	return mode === "new" ? "New Message" : mode === "forward" ? "Forward" : "Reply";
}

/**
 * From menu: the mailbox address (or, in All inboxes, every mailbox) and the
 * mailbox's burner addresses. Replies in a burner conversation start on the
 * burner. Hidden when there is nothing to choose, except on phones.
 */
function FromField({
	form,
	mailboxId,
	canPick,
	mailboxes,
	setFrom,
	alwaysShow,
}: {
	form: ComposeForm;
	mailboxId?: string;
	canPick: boolean;
	mailboxes: string[];
	setFrom?: (id: string) => void;
	alwaysShow: boolean;
}) {
	const chosen = form.fields.fromAddress;
	// Active burners, plus the chosen one even if it was turned off, so the menu shows the truth.
	const burners = form.burners.filter((b) => b.enabled || b.address === chosen);
	if (!canPick && !alwaysShow && burners.length === 0 && !chosen) return null;

	const value = chosen ? `burner:${chosen}` : `mailbox:${mailboxId ?? ""}`;
	const onChange = (v: string) => {
		const [kind, address] = [v.slice(0, v.indexOf(":")), v.slice(v.indexOf(":") + 1)];
		if (kind === "burner") return form.update({ fromAddress: address });
		form.update({ fromAddress: undefined });
		if (address !== mailboxId) setFrom?.(address);
	};
	const ownAddresses = canPick ? mailboxes : mailboxId ? [mailboxId] : [];

	return (
		<div className="flex items-center gap-2 min-h-12 md:min-h-10 border-b border-kumo-line">
			<span className="text-sm text-kumo-subtle">From</span>
			{chosen && <FireIcon size={16} className="shrink-0 text-kumo-subtle" aria-hidden />}
			{ownAddresses.length + burners.length > 1 ? (
				<select
					aria-label="From"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="flex-1 min-w-0 h-9 bg-transparent border-0 outline-none text-sm text-kumo-default cursor-pointer"
				>
					{ownAddresses.map((m) => (
						<option key={m} value={`mailbox:${m}`}>
							{m}
						</option>
					))}
					{burners.length > 0 && (
						<optgroup label="Burner addresses">
							{burners.map((b) => (
								<option key={b.address} value={`burner:${b.address}`}>
									{b.address}
									{b.label ? ` · ${b.label}` : ""}
									{b.enabled ? "" : " (off)"}
								</option>
							))}
						</optgroup>
					)}
				</select>
			) : (
				<span className="flex-1 min-w-0 truncate text-sm text-kumo-default">{chosen ?? mailboxId}</span>
			)}
		</div>
	);
}

function SaveStatus({ form }: { form: ComposeForm }) {
	const text = { idle: "", saving: "Saving…", saved: "Draft saved", error: "Not saved" }[form.status];
	return text ? <span className="text-xs text-kumo-subtle whitespace-nowrap" aria-live="polite">{text}</span> : null;
}

function AttachmentChips({ form }: { form: ComposeForm }) {
	if (!form.fields.attachments.length) return null;
	return (
		<div className="flex flex-col gap-1.5 py-2">
			{form.fields.attachments.map((a) => (
				<div key={a.id} className="flex items-center gap-2 h-8 max-w-sm pl-2 pr-1 rounded bg-[var(--chip-bg)] text-sm">
					<FileIcon size={16} className="shrink-0 text-kumo-subtle" />
					<span className="truncate font-medium text-kumo-link">{a.file.name}</span>
					<span className="shrink-0 text-kumo-subtle">({formatBytes(a.file.size, 0)})</span>
					<button type="button" aria-label={`Remove ${a.file.name}`} onClick={() => form.removeAttachment(a.id)} className="ml-auto icon-btn !h-7 !w-7">
						<XIcon size={14} />
					</button>
				</div>
			))}
		</div>
	);
}

/**
 * The composer body shared by all three presentations. `variant`:
 *  - window: desktop floating window / full screen dialog
 *  - inline: reply box at the bottom of a conversation
 *  - mobile: phone full screen (send button lives in the top bar)
 */
function ComposerBody({
	form,
	variant,
	mailboxId,
	canPick,
	mailboxes,
	setFrom,
	onPopOut,
}: {
	form: ComposeForm;
	variant: "window" | "inline" | "mobile";
	mailboxId?: string;
	canPick: boolean;
	mailboxes: string[];
	setFrom?: (id: string) => void;
	onPopOut?: () => void;
}) {
	const options = useUIStore((s) => s.composeOptions);
	const startCompose = useUIStore((s) => s.startCompose);
	const { fields } = form;
	const [showFormat, setShowFormat] = useState(false);
	const [showLink, setShowLink] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [showFields, setShowFields] = useState(variant !== "inline" || options.mode === "forward" || !!options.snapshot);
	const fileRef = useRef<HTMLInputElement>(null);
	const isReply = options.mode !== "new";
	const isMobile = variant === "mobile";

	const editor = useComposeEditor({
		initialHtml: fields.body,
		onChange: (html) => form.update({ body: html }),
		onPasteFiles: form.addFiles,
		// New mail starts in To; replies and forwards start in the body (forwards in To).
		autofocus: isReply && options.mode !== "forward",
	});

	const showQuote = () => {
		const q = form.expandQuote();
		if (q && editor) editor.chain().focus("end").insertContentAt(editor.state.doc.content.size, q).run();
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			void form.send();
		}
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "c" || e.key === "C")) {
			e.preventDefault();
			form.update({ showCcBcc: true });
		}
	};

	const ccLinks = !fields.showCcBcc && (
		<button
			type="button"
			className="text-sm text-kumo-strong bg-transparent border-0 cursor-pointer hover:underline px-1"
			onClick={(e) => {
				e.stopPropagation();
				form.update({ showCcBcc: true });
			}}
		>
			{isMobile ? <CaretDownIcon size={18} /> : "Cc Bcc"}
		</button>
	);

	const replyMenu = variant === "inline" && options.originalEmail && (
		<Menu
			align="left"
			label="Type of response"
			items={[
				{ label: "Reply", icon: <ArrowBendUpLeftIcon size={18} />, onSelect: () => startCompose({ ...options, mode: "reply", snapshot: undefined }) },
				{ label: "Reply all", icon: <ArrowBendDoubleUpLeftIcon size={18} />, onSelect: () => startCompose({ ...options, mode: "reply-all", snapshot: undefined }) },
				{ label: "Forward", icon: <ArrowBendUpRightIcon size={18} />, onSelect: () => startCompose({ ...options, mode: "forward", snapshot: undefined }) },
				null,
				...(onPopOut ? [{ label: "Pop out reply", icon: <ArrowsOutSimpleIcon size={18} />, onSelect: onPopOut }] : []),
			]}
			trigger={(p) => (
				<button type="button" {...p} className="flex items-center gap-0.5 h-8 px-1 rounded border-0 bg-transparent cursor-pointer text-kumo-strong hover:bg-kumo-fill" aria-label="Type of response">
					{options.mode === "forward" ? <ArrowBendUpRightIcon size={18} /> : options.mode === "reply-all" ? <ArrowBendDoubleUpLeftIcon size={18} /> : <ArrowBendUpLeftIcon size={18} />}
					<CaretDownIcon size={12} />
				</button>
			)}
		/>
	);

	return (
		<div
			data-composer
			className="relative flex flex-col flex-1 min-h-0"
			onKeyDown={onKeyDown}
			onDragOver={(e) => {
				if (e.dataTransfer.types.includes("Files")) {
					e.preventDefault();
					setDragging(true);
				}
			}}
			onDragLeave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
			}}
			onDrop={(e) => {
				if (!e.dataTransfer.files.length) return;
				e.preventDefault();
				setDragging(false);
				form.addFiles([...e.dataTransfer.files]);
			}}
		>
			<input
				ref={fileRef}
				type="file"
				multiple
				hidden
				onChange={(e) => {
					form.addFiles([...(e.target.files ?? [])]);
					e.target.value = "";
				}}
			/>
			{isMobile && <MobileFileTrigger fileRef={fileRef} />}

			<div className={`flex-1 min-h-0 overflow-y-auto ${variant === "inline" ? "" : "px-4"}`}>
				{form.error && (
					<div role="alert" className="mt-2 mb-1 rounded-md bg-[#fce8e6] dark:bg-[#5c2b29] text-[var(--ops-bad)] text-sm px-3 py-2">
						{form.error}
					</div>
				)}

				<FromField form={form} mailboxId={mailboxId} canPick={canPick} mailboxes={mailboxes} setFrom={setFrom} alwaysShow={isMobile} />

				{variant === "inline" && !showFields ? (
					<div className="flex items-center gap-1 min-h-10">
						{replyMenu}
						<button
							type="button"
							onClick={() => setShowFields(true)}
							className="flex-1 min-w-0 text-left truncate text-sm text-kumo-default bg-transparent border-0 cursor-pointer h-8 px-1 rounded hover:bg-kumo-tint"
						>
							{[...fields.to, ...fields.cc].map((a) => displayName(a)).join(", ") || <span className="text-kumo-subtle">Recipients</span>}
						</button>
						{onPopOut && (
							<button type="button" className="icon-btn !h-8 !w-8" aria-label="Pop out reply" title="Pop out reply" onClick={onPopOut}>
								<ArrowsOutSimpleIcon size={16} />
							</button>
						)}
					</div>
				) : (
					<>
						<div className="flex items-start gap-1">
							{replyMenu && <div className="pt-1">{replyMenu}</div>}
							<div className="flex-1 min-w-0">
								<RecipientInput
									label="To"
									values={fields.to}
									onChange={(to) => form.update({ to })}
									pending={form.pending.to}
									onPendingChange={(t) => form.updatePending("to", t)}
									mailboxId={mailboxId}
									autoFocus={!isReply || options.mode === "forward"}
									trailing={ccLinks}
									compact={variant === "inline"}
								/>
							</div>
							{variant === "inline" && onPopOut && (
								<button type="button" className="icon-btn !h-8 !w-8 mt-1" aria-label="Pop out reply" title="Pop out reply" onClick={onPopOut}>
									<ArrowsOutSimpleIcon size={16} />
								</button>
							)}
						</div>
						{fields.showCcBcc && (
							<>
								<RecipientInput label="Cc" values={fields.cc} onChange={(cc) => form.update({ cc })} pending={form.pending.cc} onPendingChange={(t) => form.updatePending("cc", t)} mailboxId={mailboxId} compact={variant === "inline"} />
								<RecipientInput label="Bcc" values={fields.bcc} onChange={(bcc) => form.update({ bcc })} pending={form.pending.bcc} onPendingChange={(t) => form.updatePending("bcc", t)} mailboxId={mailboxId} compact={variant === "inline"} />
							</>
						)}
						{variant !== "inline" && (
							<input
								type="text"
								aria-label="Subject"
								placeholder="Subject"
								value={fields.subject}
								onChange={(e) => form.update({ subject: e.target.value })}
								className="w-full min-h-12 md:min-h-10 bg-transparent border-0 border-b border-kumo-line outline-none text-sm text-kumo-default placeholder:text-kumo-subtle"
							/>
						)}
					</>
				)}

				<div className={`${isMobile ? "pt-4" : "pt-3"} pb-2`} onClick={() => editor?.commands.focus()}>
					<ComposeEditorContent editor={editor} />
				</div>

				{fields.quoteHtml && (
					<button
						type="button"
						onClick={showQuote}
						aria-label="Show trimmed content"
						title="Show trimmed content"
						className="mb-2 inline-flex items-center justify-center h-3.5 w-7 rounded-full bg-kumo-fill hover:bg-kumo-fill-hover border-0 cursor-pointer text-kumo-strong text-xs leading-none"
					>
						•••
					</button>
				)}

				<AttachmentChips form={form} />
			</div>

			{/* ── Bottom bar (desktop) ── */}
			{!isMobile && (
				<div className={`shrink-0 ${variant === "inline" ? "pt-2" : "px-4 pb-3 pt-1"}`}>
					{showFormat && editor && (
						<div className="mb-2">
							<FormattingToolbar editor={editor} />
						</div>
					)}
					<div className="relative flex items-center gap-1">
						<div className="flex items-center rounded-md bg-kumo-brand text-kumo-inverse overflow-hidden">
							<button
								type="button"
								onClick={() => void form.send()}
								disabled={form.isSending}
								className="h-8 px-4 border-0 bg-transparent text-inherit text-[0.8125rem] font-semibold cursor-pointer hover:bg-black/10 disabled:opacity-60"
								title="Send (⌘/Ctrl+Enter)"
							>
								{form.isSending ? "Sending…" : "Send"}
							</button>
						</div>
						<button type="button" className={`icon-btn ml-1 ${showFormat ? "!bg-kumo-fill" : ""}`} aria-label="Formatting options" title="Formatting options" aria-pressed={showFormat} onClick={() => setShowFormat((v) => !v)}>
							<TextAaIcon size={20} />
						</button>
						<button type="button" className="icon-btn" aria-label="Attach files" title="Attach files" onClick={() => fileRef.current?.click()}>
							<PaperclipIcon size={20} />
						</button>
						<div className="relative">
							<button type="button" className="icon-btn" aria-label="Insert link" title="Insert link" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowLink((v) => !v)}>
								<LinkSimpleIcon size={20} />
							</button>
							{showLink && editor && <LinkPopover editor={editor} onClose={() => setShowLink(false)} />}
						</div>
						<div className="ml-auto flex items-center gap-1">
							<SaveStatus form={form} />
							<button type="button" className="icon-btn" aria-label="Discard draft" title="Discard draft" onClick={() => void form.discard()}>
								<TrashIcon size={20} />
							</button>
						</div>
					</div>
				</div>
			)}

			{dragging && (
				<div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-kumo-brand bg-[color-mix(in_srgb,var(--color-kumo-brand)_10%,transparent)] text-kumo-link font-medium pointer-events-none">
					Drop files here
				</div>
			)}
		</div>
	);
}

/** Lets the phone top bar's paperclip open the hidden file input. */
let mobileFileInput: React.RefObject<HTMLInputElement | null> | null = null;
function MobileFileTrigger({ fileRef }: { fileRef: React.RefObject<HTMLInputElement | null> }) {
	useEffect(() => {
		mobileFileInput = fileRef;
		return () => {
			if (mobileFileInput === fileRef) mobileFileInput = null;
		};
	}, [fileRef]);
	return null;
}

/** Desktop floating window (bottom right), with minimise and full screen. */
function ComposeWindow() {
	const { composeOptions, composeKey, composeMinimized, composeFullscreen, setComposeMinimized, setComposeFullscreen } = useUIStore();
	const m = useComposeMailbox();
	const form = useComposeForm(m.mailboxId, composeOptions);
	const title = titleFor(composeOptions.mode, form.fields.subject, !!composeOptions.draftEmail);

	useEffect(() => {
		if (!composeFullscreen) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && setComposeFullscreen(false);
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [composeFullscreen, setComposeFullscreen]);

	const header = (
		<div
			className="flex items-center gap-1 h-10 pl-4 pr-1.5 shrink-0 cursor-pointer select-none rounded-t-lg"
			style={{ background: "var(--compose-header)" }}
			onClick={() => setComposeMinimized(!composeMinimized)}
		>
			<span className="flex-1 min-w-0 truncate text-sm font-medium text-kumo-default">{title}</span>
			<button
				type="button"
				className="icon-btn !h-8 !w-8"
				aria-label={composeMinimized ? "Restore" : "Minimize"}
				title={composeMinimized ? "Restore" : "Minimize"}
				onClick={(e) => {
					e.stopPropagation();
					setComposeMinimized(!composeMinimized);
				}}
			>
				<MinusIcon size={16} weight="bold" />
			</button>
			<button
				type="button"
				className="icon-btn !h-8 !w-8"
				aria-label={composeFullscreen ? "Exit full screen" : "Full screen"}
				title={composeFullscreen ? "Exit full screen" : "Full screen"}
				onClick={(e) => {
					e.stopPropagation();
					setComposeFullscreen(!composeFullscreen);
				}}
			>
				{composeFullscreen ? <ArrowsInSimpleIcon size={16} /> : <ArrowsOutSimpleIcon size={16} />}
			</button>
			<button
				type="button"
				className="icon-btn !h-8 !w-8"
				aria-label="Save & close"
				title="Save & close"
				onClick={(e) => {
					e.stopPropagation();
					void form.close();
				}}
			>
				<XIcon size={16} weight="bold" />
			</button>
		</div>
	);

	const box = (
		<div
			role="dialog"
			aria-label={title}
			className={`flex flex-col bg-kumo-elevated rounded-t-lg border border-kumo-line shadow-[0_16px_40px_-12px_rgb(15_20_26/0.35),0_4px_12px_-4px_rgb(15_20_26/0.2)] overflow-hidden ${
				composeFullscreen
					? "w-[min(1100px,92vw)] h-[88vh] rounded-lg"
					: composeMinimized
						? "w-[280px]"
						: "w-[560px] max-w-[calc(100vw-2rem)] h-[min(620px,calc(100dvh-5rem))]"
			}`}
		>
			{header}
			{!composeMinimized && form.initialised && (
				<ComposerBody key={composeKey} form={form} variant="window" mailboxId={m.mailboxId} canPick={m.canPick} mailboxes={m.mailboxes} setFrom={m.setFrom} />
			)}
		</div>
	);

	if (composeFullscreen) {
		return (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setComposeFullscreen(false)}>
				<div onClick={(e) => e.stopPropagation()}>{box}</div>
			</div>
		);
	}
	return <div className="fixed z-40 bottom-0 right-4 lg:right-16">{box}</div>;
}

/** Phone full screen composer: ✕ · title · 📎 · ➤ · ⋮ in the top bar. */
function MobileComposer() {
	const { composeOptions, composeKey } = useUIStore();
	const m = useComposeMailbox();
	const form = useComposeForm(m.mailboxId, composeOptions);
	const title = composeOptions.mode === "new" ? "Compose" : composeOptions.mode === "forward" ? "Forward" : "Reply";

	return (
		<div role="dialog" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-kumo-base pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] animate-slide-up">
			<div className="flex items-center gap-1 h-14 px-1 shrink-0">
				<button type="button" className="icon-btn" aria-label="Save & close" onClick={() => void form.close()}>
					<ArrowLeftIcon size={22} />
				</button>
				<span className="flex-1 min-w-0 truncate text-lg text-kumo-default">{title}</span>
				<button type="button" className="icon-btn" aria-label="Attach files" onClick={() => mobileFileInput?.current?.click()}>
					<PaperclipIcon size={22} />
				</button>
				<button type="button" className="icon-btn !text-kumo-brand" aria-label="Send" disabled={form.isSending} onClick={() => void form.send()}>
					<PaperPlaneRightIcon size={22} />
				</button>
				<Menu
					label="More"
					items={[
						{ label: "Save draft", onSelect: () => void form.saveDraft() },
						{ label: "Add Cc/Bcc", onSelect: () => form.update({ showCcBcc: true }), disabled: form.fields.showCcBcc },
						null,
						{ label: "Discard", danger: true, onSelect: () => void form.discard() },
					]}
					trigger={(p) => (
						<button type="button" {...p} className="icon-btn" aria-label="More">
							<DotsThreeVerticalIcon size={22} weight="bold" />
						</button>
					)}
				/>
			</div>
			{form.initialised && (
				<ComposerBody key={composeKey} form={form} variant="mobile" mailboxId={m.mailboxId} canPick={m.canPick} mailboxes={m.mailboxes} setFrom={m.setFrom} />
			)}
		</div>
	);
}

/** Reply box at the bottom of the open conversation (desktop). */
export function InlineComposer() {
	const composeKey = useUIStore((s) => s.composeKey);
	return <InlineComposerInner key={composeKey} />;
}

function InlineComposerInner() {
	const { composeOptions, composeKey, startCompose } = useUIStore();
	const m = useComposeMailbox();
	const form = useComposeForm(m.mailboxId, composeOptions);
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}, []);
	if (!form.initialised) return null;
	return (
		<div ref={ref} className="rounded-lg shadow-[0_8px_24px_-6px_rgb(15_20_26/0.18)] border border-kumo-line bg-kumo-elevated px-4 pt-2 pb-3 min-h-[260px] flex flex-col">
			<ComposerBody
				key={composeKey}
				form={form}
				variant="inline"
				mailboxId={m.mailboxId}
				canPick={false}
				mailboxes={[]}
				onPopOut={() => startCompose({ ...composeOptions, inline: false, snapshot: form.snapshot() })}
			/>
		</div>
	);
}

/**
 * Mount once per layout. Shows the floating window (desktop) or the full
 * screen composer (phones). Inline replies are rendered by the reader.
 */
export default function ComposeHost() {
	const isDesktop = useIsDesktop();
	const { isComposing, composeOptions, composeKey } = useUIStore();
	if (!isComposing) return null;
	if (isDesktop && composeOptions.inline) return null;
	return isDesktop ? <ComposeWindow key={composeKey} /> : <MobileComposer key={composeKey} />;
}
