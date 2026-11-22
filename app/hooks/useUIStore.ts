// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { create } from "zustand";
import type { Email } from "~/types";

export type ComposeMode = "new" | "reply" | "reply-all" | "forward";

/** A file attached in the composer (kept in memory until the message is sent). */
export interface ComposeAttachment {
	id: string;
	file: File;
}

/** Everything typed into a composer, so it can be re-opened (undo send, pop out). */
export interface ComposeSnapshot {
	to: string[];
	cc: string[];
	bcc: string[];
	showCcBcc: boolean;
	subject: string;
	body: string;
	/** Quoted original, kept out of the editor behind the "•••" toggle. */
	quoteHtml: string;
	attachments: ComposeAttachment[];
	draftId?: string;
	/** A burner address to send from; unset means the mailbox's own address. */
	fromAddress?: string;
}

export interface ComposeOptions {
	mode: ComposeMode;
	originalEmail?: Email | null;
	/** When editing a draft, this holds the draft email to pre-fill the composer */
	draftEmail?: Email | null;
	/** Restore a composer exactly as it was (undo send, pop out of inline reply). */
	snapshot?: ComposeSnapshot;
	/** Desktop: show the reply inside the conversation instead of a floating window. */
	inline?: boolean;
	/** Mailbox the composer sends from (replies, drafts). New mail uses the From picker. */
	mailboxId?: string;
}

export type ReadingPane = "none" | "right";

const PREFS_KEY = "inbox.ui.prefs";
interface Prefs {
	readingPane: ReadingPane;
	isAgentPanelOpen: boolean;
	sidebarCollapsed: boolean;
}
const DEFAULT_PREFS: Prefs = { readingPane: "none", isAgentPanelOpen: false, sidebarCollapsed: false };

function savePrefs(p: Prefs) {
	try {
		localStorage.setItem(PREFS_KEY, JSON.stringify(p));
	} catch {
		// Private mode / storage blocked: preferences just do not persist.
	}
}

interface UIState extends Prefs {
	// Reader
	selectedEmailId: string | null;
	/** Mailbox of the open email (needed in the unified view). */
	selectedMailboxId: string | null;
	selectEmail: (id: string | null, mailboxId?: string | null) => void;
	closePanel: () => void;

	// Composer
	isComposing: boolean;
	composeOptions: ComposeOptions;
	/** Bumped on every startCompose so the composer re-initialises. */
	composeKey: number;
	composeMinimized: boolean;
	composeFullscreen: boolean;
	/** Draft id of the open composer (the reader hides that draft while it is edited). */
	composeDraftId: string | null;
	setComposeDraftId: (id: string | null) => void;
	startCompose: (options?: ComposeOptions) => void;
	closeCompose: () => void;
	setComposeMinimized: (v: boolean) => void;
	setComposeFullscreen: (v: boolean) => void;

	// Bulk selection in the list (keys from rowKey())
	checked: Set<string>;
	setChecked: (keys: Iterable<string>) => void;
	toggleChecked: (key: string) => void;
	clearChecked: () => void;

	// Mobile drawer
	isSidebarOpen: boolean;
	openSidebar: () => void;
	closeSidebar: () => void;
	toggleSidebar: () => void;

	// Desktop preferences (persisted)
	hydratePrefs: () => void;
	setReadingPane: (p: ReadingPane) => void;
	toggleSidebarCollapsed: () => void;

	// Agent panel (desktop side panel) and full-screen sheet (phones/tablets)
	toggleAgentPanel: () => void;
	isMobileAgentOpen: boolean;
	openMobileAgent: () => void;
	closeMobileAgent: () => void;
}

/** Stable key for a list row; the unified view needs the mailbox too. */
export function rowKey(email: Pick<Email, "id" | "mailbox_id">): string {
	return email.mailbox_id ? `${email.mailbox_id}:${email.id}` : email.id;
}

const EMPTY_COMPOSE: ComposeOptions = { mode: "new", originalEmail: null };

export const useUIStore = create<UIState>((set, get) => {
	const prefs = (): Prefs => {
		const s = get();
		return { readingPane: s.readingPane, isAgentPanelOpen: s.isAgentPanelOpen, sidebarCollapsed: s.sidebarCollapsed };
	};
	const setPref = (patch: Partial<Prefs>) => {
		set(patch);
		savePrefs(prefs());
	};

	return {
		...DEFAULT_PREFS,
		selectedEmailId: null,
		selectedMailboxId: null,
		isComposing: false,
		composeOptions: EMPTY_COMPOSE,
		composeKey: 0,
		composeMinimized: false,
		composeFullscreen: false,
		composeDraftId: null,
		checked: new Set(),
		isSidebarOpen: false,
		isMobileAgentOpen: false,

		selectEmail: (id, mailboxId) =>
			set((s) => ({
				selectedEmailId: id,
				selectedMailboxId: id ? (mailboxId ?? s.selectedMailboxId) : null,
				// An inline reply belongs to the conversation it was opened from.
				...(s.isComposing && s.composeOptions.inline && id !== s.selectedEmailId
					? { isComposing: false, composeOptions: EMPTY_COMPOSE }
					: {}),
			})),

		closePanel: () =>
			set((s) => ({
				selectedEmailId: null,
				selectedMailboxId: null,
				...(s.isComposing && s.composeOptions.inline
					? { isComposing: false, composeOptions: EMPTY_COMPOSE }
					: {}),
			})),

		startCompose: (options) =>
			set((s) => ({
				isComposing: true,
				composeOptions: options || EMPTY_COMPOSE,
				composeDraftId: options?.snapshot?.draftId ?? options?.draftEmail?.id ?? null,
				composeKey: s.composeKey + 1,
				composeMinimized: false,
				isSidebarOpen: false,
			})),

		closeCompose: () =>
			set({
				isComposing: false,
				composeOptions: EMPTY_COMPOSE,
				composeDraftId: null,
				composeMinimized: false,
				composeFullscreen: false,
			}),

		setComposeDraftId: (id) => set({ composeDraftId: id }),
		setComposeMinimized: (v) => set({ composeMinimized: v, ...(v ? { composeFullscreen: false } : {}) }),
		setComposeFullscreen: (v) => set({ composeFullscreen: v, ...(v ? { composeMinimized: false } : {}) }),

		setChecked: (keys) => set({ checked: new Set(keys) }),
		toggleChecked: (key) =>
			set((s) => {
				const next = new Set(s.checked);
				if (next.has(key)) next.delete(key);
				else next.add(key);
				return { checked: next };
			}),
		clearChecked: () => set((s) => (s.checked.size ? { checked: new Set() } : {})),

		openSidebar: () => set({ isSidebarOpen: true }),
		closeSidebar: () => set({ isSidebarOpen: false }),
		toggleSidebar: () => set({ isSidebarOpen: !get().isSidebarOpen }),

		hydratePrefs: () => {
			try {
				const raw = localStorage.getItem(PREFS_KEY);
				if (raw) set({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) });
			} catch {
				// Ignore unreadable preferences.
			}
		},
		setReadingPane: (readingPane) => setPref({ readingPane }),
		toggleSidebarCollapsed: () => setPref({ sidebarCollapsed: !get().sidebarCollapsed }),
		toggleAgentPanel: () => setPref({ isAgentPanelOpen: !get().isAgentPanelOpen }),

		openMobileAgent: () => set({ isMobileAgentOpen: true, isSidebarOpen: false }),
		closeMobileAgent: () => set({ isMobileAgentOpen: false }),
	};
});
