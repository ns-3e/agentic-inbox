// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { EnvelopeSimpleOpenIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import EmailPanel from "~/components/EmailPanel";
import { useUIStore } from "~/hooks/useUIStore";

/**
 * List + reader layout.
 * - Phones, and desktop with "Reading pane: None" (default, like Gmail): the
 *   open conversation replaces the list. The list stays mounted (hidden) so
 *   its scroll position survives.
 * - Desktop with "Reading pane: Right": list on the left, reader on the right.
 */
export default function MailboxSplitView({
	selectedEmailId,
	children,
}: {
	selectedEmailId: string | null;
	/** Kept for older callers; composing no longer takes over this view. */
	isComposing?: boolean;
	children: ReactNode;
}) {
	const readingPane = useUIStore((s) => s.readingPane);
	const split = readingPane === "right";
	const open = selectedEmailId !== null;

	return (
		<div className="flex h-full min-h-0">
			<div
				className={`flex-col min-w-0 min-h-0 ${
					open
						? split
							? "hidden md:flex md:w-[40%] md:min-w-[360px] md:max-w-[560px] md:border-r md:border-kumo-line"
							: "hidden"
						: "flex w-full"
				} ${!open && split ? "md:w-[40%] md:min-w-[360px] md:max-w-[560px] md:border-r md:border-kumo-line" : ""}`}
			>
				{children}
			</div>
			{open ? (
				<div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
					<EmailPanel emailId={selectedEmailId} />
				</div>
			) : (
				split && (
					<div className="hidden md:flex flex-1 flex-col items-center justify-center text-kumo-subtle gap-3">
						<EnvelopeSimpleOpenIcon size={64} weight="thin" />
						<span className="text-sm">No conversation selected</span>
					</div>
				)
			)}
		</div>
	);
}
