// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useRef } from "react";
import { getPreferences } from "~/hooks/usePreferences";

/** Keys are matched on `event.key` ("j", "#", "Enter", "I" for Shift+i, "?"). */
export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

export function isTypingTarget(el: EventTarget | null): boolean {
	if (!(el instanceof HTMLElement)) return false;
	if (el.isContentEditable) return true;
	const tag = el.tagName;
	if (tag === "TEXTAREA" || tag === "SELECT") return true;
	if (tag === "INPUT") {
		const type = (el as HTMLInputElement).type;
		return !["checkbox", "radio", "button", "submit"].includes(type);
	}
	return false;
}

/** True while a dialog / menu or the composer has focus: list hotkeys stay quiet. */
function inOverlay(el: EventTarget | null): boolean {
	return el instanceof HTMLElement && !!el.closest("[role=dialog], [data-composer]");
}

/**
 * Gmail-style single-key shortcuts. Off when Preferences → Keyboard shortcuts
 * is off. Ignored while typing, with Ctrl/Cmd/Alt,
 * or when focus is inside a dialog or the composer. The latest handlers are
 * always used, so callers can pass inline functions.
 */
export function useHotkeys(map: HotkeyMap, enabled = true) {
	const ref = useRef(map);
	ref.current = map;
	useEffect(() => {
		if (!enabled) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
			if (!getPreferences().shortcuts) return;
			if (isTypingTarget(e.target) || inOverlay(e.target)) return;
			const fn = ref.current[e.key];
			if (fn) {
				e.preventDefault();
				fn(e);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [enabled]);
}
