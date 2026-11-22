// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useUIStore } from "~/hooks/useUIStore";

/** Gmail-style floating Compose button for phones. Hidden while reading, composing or selecting. */
export default function ComposeFab() {
	const { selectedEmailId, isComposing, isMobileAgentOpen, startCompose, checked } = useUIStore();
	if (selectedEmailId !== null || isComposing || isMobileAgentOpen || checked.size > 0) return null;
	return (
		<button
			type="button"
			onClick={() => startCompose()}
			aria-label="Compose"
			className="md:hidden fixed z-20 right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] flex items-center gap-3 h-14 pl-4 pr-5 rounded-2xl font-medium text-[15px] shadow-[0_1px_3px_0_rgba(60,64,67,0.3),0_4px_8px_3px_rgba(60,64,67,0.15)] active:scale-95 transition-transform cursor-pointer border-0"
			style={{ background: "var(--compose-pill)", color: "var(--compose-pill-text)" }}
		>
			<PencilSimpleIcon size={22} />
			Compose
		</button>
	);
}
