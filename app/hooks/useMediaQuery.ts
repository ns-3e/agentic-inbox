// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useSyncExternalStore } from "react";

const subscribers = new Map<string, (cb: () => void) => () => void>();
function subscribe(query: string) {
	const cached = subscribers.get(query);
	if (cached) return cached;
	const fn = (cb: () => void) => {
		const mq = window.matchMedia(query);
		mq.addEventListener("change", cb);
		return () => mq.removeEventListener("change", cb);
	};
	subscribers.set(query, fn);
	return fn;
}

/** True when the media query matches. Always false during SSR. */
export function useMediaQuery(query: string): boolean {
	return useSyncExternalStore(
		subscribe(query),
		() => window.matchMedia(query).matches,
		() => false,
	);
}

/** Tailwind `md` and up: the desktop layout. */
export const useIsDesktop = () => useMediaQuery("(min-width: 768px)");
