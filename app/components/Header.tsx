// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	CheckIcon,
	EnvelopeSimpleIcon,
	GearSixIcon,
	KeyboardIcon,
	ListIcon,
	MagnifyingGlassIcon,
	RobotIcon,
	SlidersHorizontalIcon,
	StackIcon,
	XIcon,
} from "@phosphor-icons/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import Avatar from "~/components/Avatar";
import Menu from "~/components/Menu";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { useUIStore } from "~/hooks/useUIStore";
import { useMailboxes } from "~/queries/mailboxes";

/** Gmail "Search options" panel: builds a query with from:, to:, subject:, has:attachment. */
function SearchOptions({ initial, onSearch, onClose }: { initial: string; onSearch: (q: string) => void; onClose: () => void }) {
	const pick = (key: string) => {
		const m = initial.match(new RegExp(`\\b${key}:(?:"([^"]*)"|(\\S+))`, "i"));
		return m ? (m[1] ?? m[2] ?? "") : "";
	};
	const [from, setFrom] = useState(pick("from"));
	const [to, setTo] = useState(pick("to"));
	const [subject, setSubject] = useState(pick("subject"));
	const [words, setWords] = useState(initial.replace(/\b\w+:(?:"[^"]*"|\S+)/g, "").trim());
	const [after, setAfter] = useState(pick("after"));
	const [before, setBefore] = useState(pick("before"));
	const [hasAttachment, setHasAttachment] = useState(/\bhas:attachment\b/i.test(initial));
	const [unread, setUnread] = useState(/\bis:unread\b/i.test(initial));
	const quote = (v: string) => (/\s/.test(v) ? `"${v}"` : v);

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		const parts = [
			from && `from:${quote(from)}`,
			to && `to:${quote(to)}`,
			subject && `subject:${quote(subject)}`,
			after && `after:${after}`,
			before && `before:${before}`,
			hasAttachment && "has:attachment",
			unread && "is:unread",
			words,
		].filter(Boolean);
		if (parts.length) onSearch(parts.join(" "));
		onClose();
	};

	const row = (label: string, value: string, set: (v: string) => void, type = "text") => (
		<label className="flex items-end gap-4">
			<span className="w-28 shrink-0 text-sm text-kumo-strong pb-1.5">{label}</span>
			<input
				type={type}
				value={value}
				onChange={(e) => set(e.target.value)}
				className="flex-1 min-w-0 h-8 bg-transparent border-0 border-b border-kumo-line focus:border-kumo-brand outline-none text-sm text-kumo-default"
			/>
		</label>
	);

	return (
		<form onSubmit={submit} className="menu absolute left-0 right-0 top-full mt-1 p-5 space-y-3 z-50" onKeyDown={(e) => e.key === "Escape" && onClose()}>
			{row("From", from, setFrom)}
			{row("To", to, setTo)}
			{row("Subject", subject, setSubject)}
			{row("Has the words", words, setWords)}
			<div className="flex gap-4">
				<div className="flex-1">{row("After", after, setAfter, "date")}</div>
				<div className="flex-1">{row("Before", before, setBefore, "date")}</div>
			</div>
			<div className="flex items-center gap-6 pt-1">
				<label className="flex items-center gap-2 text-sm text-kumo-default cursor-pointer">
					<input type="checkbox" checked={hasAttachment} onChange={(e) => setHasAttachment(e.target.checked)} className="h-4 w-4 accent-[var(--color-kumo-brand)]" />
					Has attachment
				</label>
				<label className="flex items-center gap-2 text-sm text-kumo-default cursor-pointer">
					<input type="checkbox" checked={unread} onChange={(e) => setUnread(e.target.checked)} className="h-4 w-4 accent-[var(--color-kumo-brand)]" />
					Unread only
				</label>
			</div>
			<div className="flex justify-end gap-2 pt-2">
				<button type="button" onClick={onClose} className="h-9 px-4 rounded-full border-0 bg-transparent text-sm font-medium text-kumo-link cursor-pointer hover:bg-kumo-tint">
					Cancel
				</button>
				<button type="submit" className="h-9 px-6 rounded-full border-0 bg-kumo-brand text-kumo-inverse text-sm font-medium cursor-pointer hover:shadow-md">
					Search
				</button>
			</div>
		</form>
	);
}

export const SEARCH_INPUT_ID = "mail-search-input";

export default function Header({ onShowShortcuts }: { onShowShortcuts?: () => void }) {
	const [searchQuery, setSearchQuery] = useState("");
	const [showOptions, setShowOptions] = useState(false);
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const isLg = useMediaQuery("(min-width: 1024px)");
	const {
		toggleSidebar,
		toggleSidebarCollapsed,
		toggleAgentPanel,
		isAgentPanelOpen,
		openMobileAgent,
		selectedEmailId,
		readingPane,
		setReadingPane,
	} = useUIStore();
	const { data: mailboxes = [] } = useMailboxes();
	const isUnified = !mailboxId;
	const searchPath = isUnified ? "/all/search" : `/mailbox/${mailboxId}/search`;
	const inboxPath = isUnified ? "/all/inbox" : `/mailbox/${mailboxId}/emails/inbox`;
	const searchBoxRef = useRef<HTMLDivElement>(null);

	// Keep the box in sync with the URL (?q=), except for the Starred view.
	const urlQuery = searchParams.get("q") || "";
	useEffect(() => {
		setSearchQuery(location.pathname.endsWith("/search") && urlQuery !== "is:starred" ? urlQuery : "");
	}, [urlQuery, location.pathname]);

	useEffect(() => {
		if (!showOptions) return;
		const onDown = (e: MouseEvent) => {
			if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setShowOptions(false);
		};
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, [showOptions]);

	const search = (q: string) => {
		const t = q.trim();
		if (t) navigate(`${searchPath}?q=${encodeURIComponent(t)}`);
	};
	const clearSearch = () => {
		setSearchQuery("");
		if (location.pathname.endsWith("/search")) navigate(inboxPath);
	};
	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			search(searchQuery);
			e.currentTarget.blur();
		}
		if (e.key === "Escape") {
			if (searchQuery) clearSearch();
			e.currentTarget.blur();
		}
	};

	const handleAgentClick = () => (isLg ? toggleAgentPanel() : openMobileAgent());
	const current = mailboxId ?? "All inboxes";

	const accountMenu = (
		<Menu
			label="Mailboxes"
			header={
				<div className="px-4 pt-2 pb-3 text-center border-b border-kumo-line mb-1">
					<div className="mx-auto mb-2 w-fit">{mailboxId ? <Avatar sender={mailboxId} size={56} /> : <div className="h-14 w-14 rounded-full bg-kumo-fill flex items-center justify-center"><StackIcon size={26} /></div>}</div>
					<div className="text-sm font-medium text-kumo-default truncate">{current}</div>
				</div>
			}
			items={[
				{ label: "All inboxes", icon: <StackIcon size={18} />, onSelect: () => navigate("/all/inbox") },
				...mailboxes.map((m) => ({ label: m.email, icon: <Avatar sender={m.email} size={22} />, onSelect: () => navigate(`/mailbox/${encodeURIComponent(m.id)}/emails/inbox`) })),
				null,
				{ label: "Agent", icon: <RobotIcon size={18} />, onSelect: handleAgentClick },
				...(mailboxId ? [{ label: "Mailbox settings", icon: <GearSixIcon size={18} />, onSelect: () => navigate(`/mailbox/${mailboxId}/settings`) }] : []),
				{ label: "Manage mailboxes", icon: <EnvelopeSimpleIcon size={18} />, onSelect: () => navigate("/") },
			]}
			trigger={(p) => (
				<button type="button" {...p} aria-label={`Mailbox: ${current}`} title={current} className="shrink-0 h-10 w-10 md:h-8 md:w-8 rounded-full border-0 p-0 bg-transparent cursor-pointer flex items-center justify-center hover:ring-4 hover:ring-black/5">
					{mailboxId ? <Avatar sender={mailboxId} size={isLg ? 32 : 32} /> : <span className="h-8 w-8 rounded-full bg-kumo-brand text-kumo-inverse flex items-center justify-center"><StackIcon size={18} /></span>}
				</button>
			)}
		/>
	);

	return (
		<header
			className={`items-center gap-2 h-16 px-2 md:px-3 shrink-0 bg-kumo-recessed ${
				// On phones the reader is full screen, Gmail-style: no search bar.
				selectedEmailId ? "hidden md:flex" : "flex"
			}`}
		>
			{/* Desktop: menu + product name */}
			<div className="hidden md:flex items-center gap-1 w-[232px] shrink-0 pl-1">
				<button type="button" className="icon-btn !h-12 !w-12" aria-label="Main menu" title="Main menu" onClick={toggleSidebarCollapsed}>
					<ListIcon size={22} />
				</button>
				<button type="button" onClick={() => navigate(inboxPath)} className="flex items-center gap-2 border-0 bg-transparent cursor-pointer pl-1">
					<span className="h-8 w-8 rounded-lg bg-kumo-brand text-kumo-inverse flex items-center justify-center">
						<EnvelopeSimpleIcon size={20} weight="fill" />
					</span>
					<span className="text-[22px] text-kumo-strong">Inbox</span>
				</button>
			</div>

			{/* Search */}
			<div ref={searchBoxRef} className="relative flex-1 min-w-0 max-w-[720px]">
				<div className="flex items-center h-12 rounded-full bg-[light-dark(#e9eef6,#2d2f31)] focus-within:bg-kumo-elevated focus-within:shadow-[0_1px_1px_0_rgba(65,69,73,0.3),0_1px_3px_1px_rgba(65,69,73,0.15)] transition-[background,box-shadow]">
					<button type="button" onClick={toggleSidebar} aria-label="Open navigation drawer" className="md:hidden icon-btn !h-12 !w-12 ml-0.5">
						<ListIcon size={22} />
					</button>
					<button type="button" onClick={() => search(searchQuery)} aria-label="Search" className="hidden md:inline-flex icon-btn !h-12 !w-12 ml-1">
						<MagnifyingGlassIcon size={20} />
					</button>
					<input
						id={SEARCH_INPUT_ID}
						type="search"
						enterKeyHint="search"
						autoComplete="off"
						autoCorrect="off"
						spellCheck={false}
						aria-label="Search mail"
						placeholder={isUnified ? "Search all mailboxes" : "Search in mail"}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						onKeyDown={handleKeyDown}
						className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-base text-kumo-default placeholder:text-kumo-strong px-1 [&::-webkit-search-cancel-button]:hidden"
					/>
					{searchQuery && (
						<button type="button" onClick={clearSearch} className="icon-btn" aria-label="Clear search" title="Clear search">
							<XIcon size={18} />
						</button>
					)}
					<button
						type="button"
						onClick={() => setShowOptions((v) => !v)}
						className="hidden md:inline-flex icon-btn mr-1"
						aria-label="Show search options"
						title="Show search options"
						aria-expanded={showOptions}
					>
						<SlidersHorizontalIcon size={20} />
					</button>
					<div className="md:hidden pr-1.5">{accountMenu}</div>
				</div>
				{showOptions && <SearchOptions key={searchQuery} initial={searchQuery} onSearch={search} onClose={() => setShowOptions(false)} />}
			</div>

			{/* Desktop: right side */}
			<div className="hidden md:flex items-center gap-0.5 ml-auto shrink-0 pr-1">
				<button
					type="button"
					className={`icon-btn !h-10 !w-10 ${isAgentPanelOpen && isLg ? "!bg-[var(--nav-active)] !text-[var(--nav-active-text)]" : ""}`}
					onClick={handleAgentClick}
					aria-label={isAgentPanelOpen ? "Hide agent" : "Show agent"}
					title={isAgentPanelOpen ? "Hide agent" : "Show agent"}
					aria-pressed={isAgentPanelOpen && isLg}
				>
					<RobotIcon size={22} />
				</button>
				<Menu
					label="Quick settings"
					header={<div className="px-4 pt-1 pb-2 text-xs font-medium uppercase tracking-wide text-kumo-subtle">Reading pane</div>}
					items={[
						{ label: "No split", icon: readingPane === "none" ? <CheckIcon size={18} /> : <span className="w-[18px]" />, onSelect: () => setReadingPane("none") },
						{ label: "Right of inbox", icon: readingPane === "right" ? <CheckIcon size={18} /> : <span className="w-[18px]" />, onSelect: () => setReadingPane("right") },
						null,
						...(onShowShortcuts ? [{ label: "Keyboard shortcuts", icon: <KeyboardIcon size={18} />, onSelect: onShowShortcuts }] : []),
						...(mailboxId ? [{ label: "See all settings", icon: <GearSixIcon size={18} />, onSelect: () => navigate(`/mailbox/${mailboxId}/settings`) }] : []),
					]}
					trigger={(p) => (
						<button type="button" {...p} className="icon-btn !h-10 !w-10" aria-label="Settings" title="Settings">
							<GearSixIcon size={22} />
						</button>
					)}
				/>
				<div className="pl-2">{accountMenu}</div>
			</div>
		</header>
	);
}
