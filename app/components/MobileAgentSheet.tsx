// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button } from "@cloudflare/kumo";
import { CaretDownIcon } from "@phosphor-icons/react";
import AgentSidebar from "~/components/AgentSidebar";
import { useUIStore } from "~/hooks/useUIStore";

/**
 * Full-screen agent chat for screens narrower than `lg`, where there is no
 * room for the side panel. Desktop keeps the side panel.
 */
export default function MobileAgentSheet({ agentName }: { agentName?: string }) {
	const { isMobileAgentOpen, closeMobileAgent } = useUIStore();
	if (!isMobileAgentOpen) return null;
	return (
		<div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-kumo-base pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
			<div className="flex items-center gap-2 px-2 py-1.5 border-b border-kumo-line shrink-0">
				<Button
					variant="ghost"
					shape="square"
					icon={<CaretDownIcon size={22} />}
					onClick={closeMobileAgent}
					aria-label="Close agent"
				/>
				<span className="text-base font-semibold text-kumo-default">Agent</span>
			</div>
			<div className="flex-1 min-h-0">
				<AgentSidebar agentName={agentName} />
			</div>
		</div>
	);
}
