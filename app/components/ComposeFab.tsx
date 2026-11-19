// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useUIStore } from "~/hooks/useUIStore";

/** Gmail-style floating Compose button for phones. Hidden while reading or composing. */
export default function ComposeFab() {
	const { selectedEmailId, isComposing, isMobileAgentOpen, startCompose } = useUIStore();
	if (selectedEmailId !== null || isComposing || isMobileAgentOpen) return null;
	return (
		<button
			type="button"
			onClick={() => startCompose()}
			aria-label="Compose"
			className="md:hidden fixed z-20 right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] flex items-center gap-2 h-14 pl-5 pr-6 rounded-2xl bg-kumo-brand text-white font-semibold text-[15px] shadow-lg active:scale-95 transition-transform cursor-pointer border-0"
		>
			<PencilSimpleIcon size={22} weight="bold" />
			Compose
		</button>
	);
}
