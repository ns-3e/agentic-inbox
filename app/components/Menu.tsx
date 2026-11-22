// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { type ReactNode, useEffect, useRef, useState } from "react";

export interface MenuItem {
	label: string;
	icon?: ReactNode;
	onSelect: () => void;
	disabled?: boolean;
	danger?: boolean;
}

/**
 * Small popup menu (Gmail "more" menus). Closes on outside click, Escape or
 * selection. `items` may contain null for a divider.
 */
export default function Menu({
	trigger,
	items,
	align = "right",
	label,
	header,
	className = "",
}: {
	trigger: (props: { onClick: (e: React.MouseEvent) => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode;
	items: (MenuItem | null)[];
	align?: "left" | "right";
	label?: string;
	header?: ReactNode;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent | TouchEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", onDown);
		document.addEventListener("touchstart", onDown);
		document.addEventListener("keydown", onKey, true);
		// Focus the first item for keyboard users.
		ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("touchstart", onDown);
			document.removeEventListener("keydown", onKey, true);
		};
	}, [open]);

	return (
		<div ref={ref} className={`relative ${className}`}>
			{trigger({
				onClick: (e) => {
					e.stopPropagation();
					setOpen((o) => !o);
				},
				"aria-expanded": open,
				"aria-haspopup": "menu",
			})}
			{open && (
				<div
					role="menu"
					aria-label={label}
					className={`menu absolute top-full mt-1 ${align === "right" ? "right-0" : "left-0"} max-h-[70vh] overflow-y-auto`}
					onKeyDown={(e) => {
						if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
						e.preventDefault();
						const els = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
						const i = els.indexOf(document.activeElement as HTMLButtonElement);
						els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
					}}
				>
					{header}
					{items.map((item, i) =>
						item === null ? (
							<div key={`d${i}`} className="h-px bg-kumo-line my-1" />
						) : (
							<button
								key={item.label}
								type="button"
								role="menuitem"
								disabled={item.disabled}
								className={`menu-item disabled:opacity-40 ${item.danger ? "!text-[#c5221f] dark:!text-[#f28b82]" : ""}`}
								onClick={(e) => {
									e.stopPropagation();
									setOpen(false);
									item.onSelect();
								}}
							>
								{item.icon && <span className="shrink-0 text-kumo-strong flex">{item.icon}</span>}
								<span className="flex-1">{item.label}</span>
							</button>
						),
					)}
				</div>
			)}
		</div>
	);
}
