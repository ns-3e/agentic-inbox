// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { XIcon } from "@phosphor-icons/react";
import { useSnackbar } from "~/hooks/useSnackbar";

/** Renders the current snackbar at the bottom left (desktop) or bottom (phones). */
export default function Snackbar() {
	const { current, dismiss } = useSnackbar();
	if (!current) return null;
	return (
		<div
			role="status"
			aria-live="polite"
			className="fixed z-[70] left-3 right-3 md:right-auto md:left-6 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 flex justify-center md:justify-start pointer-events-none"
		>
			<div
				key={current.id}
				className="animate-snackbar pointer-events-auto flex items-center gap-2 min-h-12 max-w-full md:max-w-md pl-4 pr-1.5 py-1.5 rounded-md shadow-lg text-sm"
				style={{
					background: current.variant === "error" ? "#b3261e" : "var(--snackbar-bg)",
					color: current.variant === "error" ? "#fff" : "var(--snackbar-text)",
				}}
			>
				<span className="flex-1 min-w-0 py-1">{current.message}</span>
				{current.actionLabel && (
					<button
						type="button"
						onClick={() => {
							dismiss(current.id, true);
							current.onAction?.();
						}}
						className="shrink-0 h-9 px-3 rounded font-semibold bg-transparent border-0 cursor-pointer hover:bg-white/10"
						style={{ color: current.variant === "error" ? "#fff" : "var(--snackbar-action)" }}
					>
						{current.actionLabel}
					</button>
				)}
				<button
					type="button"
					aria-label="Dismiss"
					onClick={() => dismiss(current.id)}
					className="shrink-0 h-9 w-9 flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-white/10"
					style={{ color: "inherit" }}
				>
					<XIcon size={16} />
				</button>
			</div>
		</div>
	);
}
