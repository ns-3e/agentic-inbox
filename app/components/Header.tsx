// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Tooltip } from "@cloudflare/kumo";
import { GearSixIcon, ListIcon, MagnifyingGlassIcon, RobotIcon, XIcon } from "@phosphor-icons/react";
import { type KeyboardEvent, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useUIStore } from "~/hooks/useUIStore";

export default function Header() {
	const [searchQuery, setSearchQuery] = useState("");
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const {
		toggleSidebar,
		toggleAgentPanel,
		isAgentPanelOpen,
		openMobileAgent,
		selectedEmailId,
		isComposing,
	} = useUIStore();
	// Without a mailbox in the URL we are in the unified "All inboxes" view.
	const isUnified = !mailboxId;
	const searchPath = isUnified ? "/all/search" : `/mailbox/${mailboxId}/search`;
	const inboxPath = isUnified ? "/all/inbox" : `/mailbox/${mailboxId}/emails/inbox`;

	// Sync search input with URL query param so it stays populated
	const urlQuery = searchParams.get("q") || "";
	useEffect(() => {
		if (location.pathname.includes("/search") && urlQuery) {
			setSearchQuery(urlQuery);
		}
	}, [urlQuery, location.pathname]);

	const performSearch = () => {
		if (searchQuery.trim()) {
			const q = searchQuery.trim();
			navigate(`${searchPath}?q=${encodeURIComponent(q)}`);
		}
	};

	const clearSearch = () => {
		setSearchQuery("");
		if (location.pathname.includes("/search")) {
			navigate(inboxPath);
		}
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Enter") {
			performSearch();
			(e.target as HTMLInputElement).blur();
		}
		if (e.key === "Escape") {
			if (searchQuery) {
				clearSearch();
			} else {
				}
		}
	};

	const isSettingsActive = location.pathname.includes("/settings");

	// The agent side panel only exists at lg+; below that the button opens a sheet.
	const [isDesktop, setIsDesktop] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(min-width: 1024px)");
		const update = () => setIsDesktop(mq.matches);
		update();
		mq.addEventListener("change", update);
		return () => mq.removeEventListener("change", update);
	}, []);
	const isPanelOpen = selectedEmailId !== null || isComposing;

	// Desktop: toggle the side panel. Phones/tablets: open the full-screen sheet.
	const handleAgentClick = () => {
		if (isDesktop) {
			toggleAgentPanel();
		} else {
			openMobileAgent();
		}
	};

	return (
		<header
			className={`items-center gap-1.5 px-2 py-2 bg-kumo-base border-b border-kumo-line sticky top-0 z-10 md:px-5 md:gap-4 md:py-2.5 ${
				// On phones the reader/composer is full screen, Gmail-style: no search bar.
				isPanelOpen ? "hidden md:flex" : "flex"
			}`}
		>
			{/* Search pill with the menu button inside it on phones */}
			<div className="flex-1 min-w-0 max-w-2xl flex items-center h-12 md:h-10 rounded-full bg-kumo-recessed md:bg-kumo-tint border border-transparent focus-within:border-kumo-line focus-within:bg-kumo-base transition-colors">
				<button
					type="button"
					onClick={toggleSidebar}
					aria-label="Open menu"
					className="md:hidden shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-transparent border-0 text-kumo-strong cursor-pointer active:bg-kumo-fill"
				>
					<ListIcon size={22} />
				</button>
				<span className="hidden md:flex shrink-0 pl-3.5 pr-1 text-kumo-subtle">
					<MagnifyingGlassIcon size={18} />
				</span>
				<input
					type="search"
					enterKeyHint="search"
					autoComplete="off"
					autoCorrect="off"
					spellCheck={false}
					aria-label="Search emails"
					placeholder={isUnified ? "Search all mailboxes" : "Search mail"}
					title="Try from:name, is:unread, has:attachment, in:sent"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					onKeyDown={handleKeyDown}
					className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-[15px] md:text-sm text-kumo-default placeholder:text-kumo-subtle px-1 md:px-2 [&::-webkit-search-cancel-button]:hidden"
				/>
				{searchQuery ? (
					<button
						type="button"
						onClick={clearSearch}
						className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-transparent border-0 text-kumo-subtle hover:text-kumo-default cursor-pointer"
						aria-label="Clear search"
					>
						<XIcon size={16} />
					</button>
				) : (
					<button
						type="button"
						onClick={performSearch}
						className="md:hidden shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-transparent border-0 text-kumo-subtle cursor-pointer"
						aria-label="Search"
					>
						<MagnifyingGlassIcon size={20} />
					</button>
				)}
			</div>

			<div className="flex items-center gap-0.5 md:gap-1 ml-auto shrink-0">
				<Tooltip content={isAgentPanelOpen ? "Hide agent panel" : "Show agent panel"} side="bottom" asChild>
					<Button
						variant={isAgentPanelOpen && isDesktop ? "secondary" : "ghost"}
						shape="square"
						icon={<RobotIcon size={22} />}
						onClick={handleAgentClick}
						aria-label="Open agent"
						className="h-11 w-11 md:h-9 md:w-9"
					/>
				</Tooltip>
				{!isUnified && (
					<Tooltip content="Settings" side="bottom" asChild>
						<Button
							variant={isSettingsActive ? "secondary" : "ghost"}
							shape="square"
							icon={<GearSixIcon size={22} />}
							onClick={() =>
								navigate(
									isSettingsActive
										? inboxPath
										: `/mailbox/${mailboxId}/settings`,
								)
							}
							aria-label="Settings"
							className="h-11 w-11 md:h-9 md:w-9"
						/>
					</Tooltip>
				)}
			</div>
		</header>
	);
}
