// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { CheckIcon } from "@phosphor-icons/react";
import { displayName, parseAddress } from "~/lib/address";

const AVATAR_HUES = [210, 340, 150, 28, 270, 190, 0, 95, 245, 315, 50, 170];

export function avatarHue(seed: string): number {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
	return AVATAR_HUES[Math.abs(h) % AVATAR_HUES.length];
}

/** Round avatar with the sender's initial: people are circles, addresses are dots. */
export default function Avatar({
	sender,
	size = 40,
	checked,
	className = "",
}: {
	sender: string;
	size?: number;
	/** Show a check mark instead of the initial (list selection mode on phones). */
	checked?: boolean;
	className?: string;
}) {
	const name = displayName(sender);
	const seed = (parseAddress(sender).address || name).toLowerCase();
	const initial = (name.trim().replace(/^[^\p{L}\p{N}]+/u, "")[0] || "?").toUpperCase();
	return (
		<div
			aria-hidden
			className={`shrink-0 rounded-full flex items-center justify-center font-semibold text-white select-none ${className}`}
			style={{
				width: size,
				height: size,
				fontSize: Math.round(size * 0.45),
				backgroundColor: checked ? "var(--color-kumo-brand)" : `hsl(${avatarHue(seed)} 38% 42%)`,
				color: checked ? "var(--text-color-kumo-inverse)" : "#fff",
			}}
		>
			{checked ? <CheckIcon size={Math.round(size * 0.5)} weight="bold" /> : initial}
		</div>
	);
}
