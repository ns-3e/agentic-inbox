// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { type ReactNode, useRef, useState } from "react";

const TRIGGER = 70; // px of pull needed to refresh
const MAX = 110;

/**
 * Scroll container with a touch pull-to-refresh gesture. Overscroll is
 * disabled globally, so this replaces the browser's own bounce/refresh.
 */
export default function PullToRefresh({
	onRefresh,
	children,
	className = "",
}: {
	onRefresh: () => Promise<unknown> | void;
	children: ReactNode;
	className?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const startY = useRef<number | null>(null);
	const [pull, setPull] = useState(0);
	const [refreshing, setRefreshing] = useState(false);

	const onTouchStart = (e: React.TouchEvent) => {
		if (refreshing || (ref.current?.scrollTop ?? 0) > 0) return;
		startY.current = e.touches[0].clientY;
	};

	const onTouchMove = (e: React.TouchEvent) => {
		if (startY.current === null) return;
		const dy = e.touches[0].clientY - startY.current;
		if (dy <= 0 || (ref.current?.scrollTop ?? 0) > 0) {
			setPull(0);
			return;
		}
		// Resistance so it feels elastic.
		setPull(Math.min(MAX, dy * 0.5));
	};

	const onTouchEnd = async () => {
		if (startY.current === null) return;
		startY.current = null;
		if (pull >= TRIGGER * 0.5 + 20) {
			setRefreshing(true);
			setPull(48);
			try {
				await onRefresh();
			} finally {
				setRefreshing(false);
				setPull(0);
			}
		} else {
			setPull(0);
		}
	};

	const progress = Math.min(1, pull / (TRIGGER * 0.5 + 20));

	return (
		<div
			ref={ref}
			className={`relative overflow-y-auto ${className}`}
			onTouchStart={onTouchStart}
			onTouchMove={onTouchMove}
			onTouchEnd={onTouchEnd}
			onTouchCancel={onTouchEnd}
		>
			<div
				aria-hidden={!refreshing}
				className="pointer-events-none absolute left-0 right-0 top-0 flex justify-center z-10"
				style={{
					transform: `translateY(${pull - 40}px)`,
					opacity: pull > 4 ? 1 : 0,
					transition: startY.current === null ? "transform 200ms ease-out, opacity 200ms" : undefined,
				}}
			>
				<div className="h-9 w-9 rounded-full bg-kumo-base shadow-md border border-kumo-line flex items-center justify-center text-kumo-brand">
					<ArrowClockwiseIcon
						size={18}
						weight="bold"
						className={refreshing ? "animate-spin" : ""}
						style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
					/>
				</div>
			</div>
			<div
				style={{
					transform: pull ? `translateY(${pull}px)` : undefined,
					transition: startY.current === null ? "transform 200ms ease-out" : undefined,
				}}
			>
				{children}
			</div>
		</div>
	);
}
