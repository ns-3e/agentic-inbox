// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { create } from "zustand";
import {
	applyBootState,
	BOOT_KEY,
	bootState,
	DEFAULT_PREFERENCES,
	hour12For,
	normalizePreferences,
	PREFS_KEY,
	type Preferences,
} from "~/lib/preferences";

interface PreferencesState extends Preferences {
	hydrated: boolean;
	/** Read localStorage and apply. Safe to call more than once. */
	hydrate: () => void;
	set: (patch: Partial<Preferences>) => void;
	/** Restore defaults (all, or only the given keys). */
	reset: (keys?: (keyof Preferences)[]) => void;
}

function current(s: Preferences): Preferences {
	const out = {} as Record<string, unknown>;
	for (const k of Object.keys(DEFAULT_PREFERENCES)) out[k] = (s as unknown as Record<string, unknown>)[k];
	return out as unknown as Preferences;
}

function persist(p: Preferences) {
	try {
		localStorage.setItem(PREFS_KEY, JSON.stringify(p));
		localStorage.setItem(BOOT_KEY, JSON.stringify(bootState(p)));
	} catch {
		// Private mode / storage blocked: preferences apply for this visit only.
	}
}

function readStored(): Preferences {
	try {
		return normalizePreferences(JSON.parse(localStorage.getItem(PREFS_KEY) || "null"));
	} catch {
		return { ...DEFAULT_PREFERENCES };
	}
}

export const usePreferences = create<PreferencesState>((set, get) => ({
	...DEFAULT_PREFERENCES,
	hydrated: false,
	hydrate: () => {
		if (typeof window === "undefined") return;
		const p = readStored();
		set({ ...p, hydrated: true });
		applyBootState(bootState(p));
		if (!listening) listen();
	},
	set: (patch) => {
		const next = normalizePreferences({ ...current(get()), ...patch });
		set(next);
		persist(next);
		applyBootState(bootState(next));
	},
	reset: (keys) => {
		const patch: Partial<Preferences> = {};
		for (const k of keys ?? (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[])) {
			(patch as Record<string, unknown>)[k] = DEFAULT_PREFERENCES[k];
		}
		get().set(patch);
	},
}));

let listening = false;
function listen() {
	listening = true;
	// Another tab changed preferences: follow it.
	window.addEventListener("storage", (e) => {
		if (e.key !== PREFS_KEY) return;
		const p = readStored();
		usePreferences.setState(p);
		applyBootState(bootState(p));
	});
	// "System" theme: follow the OS when it switches between light and dark.
	matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
		applyBootState(bootState(current(usePreferences.getState())));
	});
}

/** Read preferences outside React (event handlers, callbacks). */
export const getPreferences = (): Preferences => current(usePreferences.getState());

/** The `hour12` date option for the chosen clock (undefined = follow the locale). */
export function useHour12(): boolean | undefined {
	return hour12For(usePreferences((s) => s.clock));
}
