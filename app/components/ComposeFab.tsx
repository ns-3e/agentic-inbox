// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useLocation } from "react-router";
import { useUIStore } from "~/hooks/useUIStore";

/** Floating "New message" button for phones. Hidden while reading, composing or selecting. */
export default function ComposeFab() {
	const { selectedEmailId, isComposing, isMobileAgentOpen, startCompose, checked } = useUIStore();
	const { pathname } = useLocation();
	// Configuration pages have their own bottom actions.
	if (/\/(settings|burners)$/.test(pathname)) return null;
	if (selectedEmailId !== null || isComposing || isMobileAgentOpen || checked.size > 0) return null;
	return (
		<button
			type="button"
			onClick={() => startCompose()}
			aria-label="New message"
			className="md:hidden fixed z-20 right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] flex items-center gap-2 h-12 pl-4 pr-5 rounded-lg font-semibold text-[15px] shadow-[0_8px_20px_-6px_rgb(15_20_26/0.35),0_2px_6px_-2px_rgb(15_20_26/0.2)] active:scale-95 transition-transform cursor-pointer border-0"
			style={{ background: "var(--compose-pill)", color: "var(--compose-pill-text)" }}
		>
			<PencilSimpleIcon size={20} weight="bold" />
			New message
		</button>
	);
}
