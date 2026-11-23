// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	CaretRightIcon,
	CaretUpDownIcon,
	CheckIcon,
	FireIcon,
	FunnelIcon,
	GearSixIcon,
	KeyboardIcon,
	ListIcon,
	MagnifyingGlassIcon,
	RobotIcon,
	SidebarSimpleIcon,
	SlidersHorizontalIcon,
	SquaresFourIcon,
	StackIcon,
	TrayArrowDownIcon,
	XIcon,
} from "@phosphor-icons/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import Avatar from "~/components/Avatar";
import { mailboxHue } from "~/components/EmailListRow";
import Menu from "~/components/Menu";
import NewBurnerDialog from "~/components/NewBurnerDialog";
import { NAV_FOLDERS, useActiveNav } from "~/components/NavItems";
import { useActiveMailbox } from "~/hooks/useActiveMailbox";
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
		<label className="flex items-center gap-3">
			<span className="w-24 shrink-0 text-xs font-semibold text-kumo-strong">{label}</span>
			<input type={type} value={value} onChange={(e) => set(e.target.value)} className="field flex-1 min-w-0" />
		</label>
	);

	return (
		<form onSubmit={submit} className="menu absolute left-0 right-0 top-full mt-1 !p-4 space-y-2.5 z-50" onKeyDown={(e) => e.key === "Escape" && onClose()}>
			{row("From", from, setFrom)}
			{row("To", to, setTo)}
			{row("Subject", subject, setSubject)}
			{row("Has the words", words, setWords)}
			<div className="flex gap-4">
				<div className="flex-1">{row("After", after, setAfter, "date")}</div>
				<div className="flex-1">{row("Before", before, setBefore, "date")}</div>
			</div>
			<div className="flex items-center gap-6 pt-1">
				<label className="flex items-center gap-2 text-[13px] text-kumo-default cursor-pointer">
					<input type="checkbox" checked={hasAttachment} onChange={(e) => setHasAttachment(e.target.checked)} className="h-4 w-4 accent-[var(--color-kumo-brand)]" />
					Has attachment
				</label>
				<label className="flex items-center gap-2 text-[13px] text-kumo-default cursor-pointer">
					<input type="checkbox" checked={unread} onChange={(e) => setUnread(e.target.checked)} className="h-4 w-4 accent-[var(--color-kumo-brand)]" />
					Unread only
				</label>
			</div>
			<div className="flex justify-end gap-2 pt-2">
				<button type="button" onClick={onClose} className="btn btn-ghost">
					Cancel
				</button>
				<button type="submit" className="btn btn-primary">
					Run search
				</button>
			</div>
		</form>
	);
}

export const SEARCH_INPUT_ID = "mail-search-input";

/** Human name of the section the URL points at, for the breadcrumb. */
function useSectionName(): string | null {
	const { pathname, search } = useLocation();
	const active = useActiveNav();
	if (pathname.endsWith("/search")) return new URLSearchParams(search).get("q") === "is:starred" ? "Starred" : "Search";
	if (active === "burners") return "Burner addresses";
	if (active === "settings") return "Routing & settings";
	const folder = NAV_FOLDERS.find((f) => f.id === active);
	if (folder) return folder.label;
	return active ? decodeURIComponent(active) : null;
}

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
		sidebarCollapsed,
	} = useUIStore();
	const { data: mailboxes = [] } = useMailboxes();
	const section = useSectionName();
	const isUnified = !mailboxId;
	const searchPath = isUnified ? "/all/search" : `/mailbox/${mailboxId}/search`;
	const inboxPath = isUnified ? "/all/inbox" : `/mailbox/${mailboxId}/emails/inbox`;
	const searchBoxRef = useRef<HTMLDivElement>(null);
	const [burnerOpen, setBurnerOpen] = useState(false);
	const { composeFrom } = useActiveMailbox();
	const mailboxIds = mailboxes.map((m) => m.id);
	const burnerMailbox = mailboxId ?? (composeFrom && mailboxIds.includes(composeFrom) ? composeFrom : mailboxIds[0]);

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
	const current = mailboxId ?? "All mailboxes";

	const scopeMenu = (compact: boolean) => (
		<Menu
			label="Switch scope"
			align="left"
			header={<div className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold text-kumo-subtle">Switch scope</div>}
			items={[
				{ label: "All mailboxes", icon: <StackIcon size={16} />, onSelect: () => navigate("/all/inbox") },
				...mailboxes.map((m) => ({
					label: m.email,
					icon: <span className="dot" style={{ backgroundColor: `hsl(${mailboxHue(m.id)} 60% 48%)` }} />,
					onSelect: () => navigate(`/mailbox/${encodeURIComponent(m.id)}/emails/inbox`),
				})),
				null,
				{ label: "Mailbox directory", icon: <SquaresFourIcon size={16} />, onSelect: () => navigate("/") },
			]}
			trigger={(p) =>
				compact ? (
					<button type="button" {...p} aria-label={`Scope: ${current}`} title={current} className="icon-btn">
						{mailboxId ? <Avatar sender={mailboxId} size={28} /> : <StackIcon size={20} />}
					</button>
				) : (
					<button
						type="button"
						{...p}
						aria-label={`Scope: ${current}`}
						className="flex items-center gap-2 h-8 max-w-[18rem] pl-2 pr-1.5 rounded-md border border-[var(--ops-line-strong)] bg-kumo-base cursor-pointer hover:bg-kumo-tint text-[13px] text-kumo-default"
					>
						{mailboxId ? (
							<span className="dot" style={{ backgroundColor: `hsl(${mailboxHue(mailboxId)} 60% 48%)` }} />
						) : (
							<StackIcon size={15} className="text-kumo-subtle shrink-0" />
						)}
						<span className={`truncate ${mailboxId ? "ops-mono" : "font-semibold"}`}>{current}</span>
						<CaretUpDownIcon size={14} className="text-kumo-subtle shrink-0" />
					</button>
				)
			}
		/>
	);

	return (
		<header
			className={`items-center gap-2 h-14 md:h-12 px-2 md:px-0 md:pr-2 shrink-0 bg-kumo-base border-b border-kumo-line ${
				// On phones the reader is full screen: no search bar.
				selectedEmailId ? "hidden md:flex" : "flex"
			}`}
		>
			{/* Desktop: rail toggle + product */}
			<div className={`hidden md:flex items-center gap-1.5 shrink-0 h-full border-r border-kumo-line transition-[width] duration-200 ${sidebarCollapsed ? "w-[56px] justify-center" : "w-[232px] pl-2 pr-3"}`}>
				<button type="button" className="icon-btn" aria-label="Collapse navigation" title="Collapse navigation" onClick={toggleSidebarCollapsed}>
					<SidebarSimpleIcon size={18} />
				</button>
				{!sidebarCollapsed && <button type="button" onClick={() => navigate("/")} className="flex items-center gap-2 border-0 bg-transparent cursor-pointer p-0 min-w-0" title="Mailbox directory">
					<span className="h-6 w-6 rounded-[5px] bg-kumo-brand text-kumo-inverse flex items-center justify-center shrink-0">
						<TrayArrowDownIcon size={15} weight="bold" />
					</span>
					<span className="text-[13px] font-semibold tracking-[-0.01em] text-kumo-default truncate">Agentic Inbox</span>
				</button>}
			</div>

			{/* Desktop: scope + breadcrumb */}
			<nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1.5 pl-3 min-w-0 shrink">
				{scopeMenu(false)}
				{section && (
					<>
						<CaretRightIcon size={12} className="text-kumo-subtle shrink-0" />
						<span className="text-[13px] font-semibold text-kumo-default truncate" aria-current="page">{section}</span>
					</>
				)}
			</nav>

			{/* Search */}
			<div ref={searchBoxRef} className="relative flex-1 min-w-0 md:max-w-[560px] md:ml-auto">
				<div className="flex items-center h-11 md:h-8 rounded-md border border-[var(--ops-line-strong)] bg-kumo-control focus-within:border-kumo-brand focus-within:shadow-[0_0_0_3px_light-dark(rgb(11_110_120/0.15),rgb(54_170_180/0.25))] transition-[border-color,box-shadow]">
					<button type="button" onClick={toggleSidebar} aria-label="Open navigation drawer" className="md:hidden icon-btn">
						<ListIcon size={22} />
					</button>
					<button type="button" onClick={() => search(searchQuery)} aria-label="Search" className="hidden md:inline-flex icon-btn !h-7 !w-8">
						<MagnifyingGlassIcon size={15} />
					</button>
					<input
						id={SEARCH_INPUT_ID}
						type="search"
						enterKeyHint="search"
						autoComplete="off"
						autoCorrect="off"
						spellCheck={false}
						aria-label="Search mail"
						placeholder={isUnified ? "Search all mailboxes" : "Search this mailbox"}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						onKeyDown={handleKeyDown}
						className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-base md:text-[13px] text-kumo-default placeholder:text-kumo-subtle px-1 [&::-webkit-search-cancel-button]:hidden"
					/>
					{searchQuery ? (
						<button type="button" onClick={clearSearch} className="icon-btn md:!h-7 md:!w-7" aria-label="Clear search" title="Clear search">
							<XIcon size={14} />
						</button>
					) : (
						<kbd className="hidden md:inline-flex mr-1" title="Press / to search">/</kbd>
					)}
					<button
						type="button"
						onClick={() => setShowOptions((v) => !v)}
						className="hidden md:inline-flex icon-btn !h-7 !w-7 mr-0.5"
						aria-label="Search filters"
						title="Search filters"
						aria-expanded={showOptions}
					>
						<FunnelIcon size={15} />
					</button>
					<div className="md:hidden pr-1">{scopeMenu(true)}</div>
				</div>
				{showOptions && <SearchOptions key={searchQuery} initial={searchQuery} onSearch={search} onClose={() => setShowOptions(false)} />}
			</div>

			{/* Desktop: right side */}
			<div className="hidden md:flex items-center gap-1 shrink-0 pl-2">
				<button
					type="button"
					className="btn btn-ghost"
					onClick={() => setBurnerOpen(true)}
					aria-label="New burner address"
					title="New burner address"
				>
					<FireIcon size={16} />
					<span className="hidden lg:inline">New burner</span>
				</button>
				<button
					type="button"
					className={`btn ${isAgentPanelOpen && isLg ? "!border-[var(--ops-agent)] !text-[var(--ops-agent)] !bg-[var(--ops-agent-tint)]" : "btn-ghost"}`}
					onClick={handleAgentClick}
					aria-label={isAgentPanelOpen && isLg ? "Hide agent console" : "Show agent console"}
					title={isAgentPanelOpen && isLg ? "Hide agent console" : "Show agent console"}
					aria-pressed={isAgentPanelOpen && isLg}
				>
					<RobotIcon size={16} className="text-[var(--ops-agent)]" />
					<span className="hidden lg:inline">Agent</span>
				</button>
				<Menu
					label="View options"
					header={<div className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold text-kumo-subtle">Reading pane</div>}
					items={[
						{ label: "Full-width list", icon: readingPane === "none" ? <CheckIcon size={16} /> : <span className="w-4" />, onSelect: () => setReadingPane("none") },
						{ label: "Split: list and reader", icon: readingPane === "right" ? <CheckIcon size={16} /> : <span className="w-4" />, onSelect: () => setReadingPane("right") },
						null,
						...(onShowShortcuts ? [{ label: "Keyboard shortcuts", icon: <KeyboardIcon size={16} />, onSelect: onShowShortcuts }] : []),
						...(mailboxId ? [{ label: "Routing & settings", icon: <GearSixIcon size={16} />, onSelect: () => navigate(`/mailbox/${mailboxId}/settings`) }] : []),
						{ label: "Mailbox directory", icon: <SquaresFourIcon size={16} />, onSelect: () => navigate("/") },
					]}
					trigger={(p) => (
						<button type="button" {...p} className="icon-btn" aria-label="View options" title="View options">
							<SlidersHorizontalIcon size={18} />
						</button>
					)}
				/>
			</div>
			<NewBurnerDialog
				open={burnerOpen}
				onOpenChange={setBurnerOpen}
				mailboxId={burnerMailbox}
				mailboxes={isUnified ? mailboxIds : undefined}
				manageHref={isUnified ? (burnerMailbox ? `/all/burners?mb=${encodeURIComponent(burnerMailbox)}` : "/all/burners") : `/mailbox/${mailboxId}/burners`}
			/>
		</header>
	);
}
