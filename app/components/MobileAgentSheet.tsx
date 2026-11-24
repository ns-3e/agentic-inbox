// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button } from "@cloudflare/kumo";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import AgentSidebar from "~/components/AgentSidebar";
import { useUIStore } from "~/hooks/useUIStore";

/**
 * Full-screen agent chat for screens narrower than `lg`, where there is no
 * room for the side panel. Desktop keeps the side panel.
 */
export default function MobileAgentSheet({ agentName }: { agentName?: string }) {
	const { isMobileAgentOpen, closeMobileAgent } = useUIStore();
	// Esc closes the sheet, like every other overlay.
	useEffect(() => {
		if (!isMobileAgentOpen) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMobileAgent();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [isMobileAgentOpen, closeMobileAgent]);
	if (!isMobileAgentOpen) return null;
	return (
		<div role="dialog" aria-modal="true" aria-label="Agent and MCP endpoint" className="lg:hidden fixed inset-0 z-50 flex flex-col bg-kumo-base pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
			<div className="flex-1 min-h-0">
				<AgentSidebar
					agentName={agentName}
					leading={
						<Button
							variant="ghost"
							shape="square"
							icon={<CaretDownIcon size={22} />}
							onClick={closeMobileAgent}
							aria-label="Close agent"
						/>
					}
				/>
			</div>
		</div>
	);
}
