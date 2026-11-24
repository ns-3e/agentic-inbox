// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Loader } from "@cloudflare/kumo";
import { PlugsIcon, RobotIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useUIStore } from "~/hooks/useUIStore";
import MCPPanel from "./MCPPanel";

function LazyAgentPanel({ agentName }: { agentName?: string }) {
	const [AgentChat, setAgentChat] = useState<React.ComponentType<{ agentName?: string }> | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		import("~/components/AgentPanel")
			.then((mod) => {
				setAgentChat(() => mod.default);
			})
			.catch((err) => {
				console.error("Failed to load AgentPanel:", err);
				setLoadError("Could not load the agent console. Reload the page to retry.");
			});
	}, []);

	if (loadError) {
		return (
			<div className="flex items-center justify-center h-full px-6 text-center">
				<span className="text-xs text-[var(--ops-bad)]">{loadError}</span>
			</div>
		);
	}
	if (!AgentChat) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-2">
				<Loader size="base" />
				<span className="text-xs text-kumo-subtle">Loading agent console…</span>
			</div>
		);
	}
	return <AgentChat agentName={agentName} />;
}

const TABS = [
	{ id: "agent" as const, label: "Agent", icon: RobotIcon },
	{ id: "mcp" as const, label: "MCP endpoint", icon: PlugsIcon },
];

/**
 * The automation dock: the agent console and the MCP endpoint.
 * @param agentName Agent instance to chat with. Defaults to the mailbox in the
 *   URL; the unified view passes UNIFIED_AGENT_NAME for the all-mailbox agent.
 * @param leading Optional control before the tabs (the phone sheet's close
 *   button), so the sheet needs no second header row.
 */
export default function AgentSidebar({ agentName, leading }: { agentName?: string; leading?: React.ReactNode } = {}) {
	const { agentTab, setAgentTab } = useUIStore();

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-end gap-1 px-2 border-b border-kumo-line shrink-0 bg-[var(--ops-header)]">
				{leading && <div className="self-center mr-1">{leading}</div>}
				<div role="tablist" aria-label="Automation" className="flex items-end gap-1 h-10 max-lg:h-12">
				{TABS.map(({ id, label, icon: Icon }) => {
					const on = agentTab === id;
					return (
						<button
							key={id}
							type="button"
							role="tab"
							aria-selected={on}
							onClick={() => setAgentTab(id)}
							className={`flex items-center gap-1.5 h-10 max-lg:h-12 px-2.5 max-lg:px-3 -mb-px text-[0.8125rem] border-b-2 bg-transparent cursor-pointer transition-colors ${
								on ? "border-kumo-brand text-kumo-default font-semibold" : "border-transparent text-kumo-subtle hover:text-kumo-default"
							}`}
						>
							<Icon size={15} weight={on ? "fill" : "regular"} className={id === "agent" ? "text-[var(--ops-agent)]" : ""} />
							{label}
						</button>
					);
				})}
				</div>
			</div>

			{/* Keep the agent mounted so the transcript is not lost. */}
			<div className="flex-1 min-h-0 overflow-hidden">
				<div className={agentTab === "agent" ? "h-full" : "hidden"}>
					<LazyAgentPanel agentName={agentName} />
				</div>
				{agentTab === "mcp" && <MCPPanel />}
			</div>
		</div>
	);
}
