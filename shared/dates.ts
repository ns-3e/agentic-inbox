// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Consolidated date formatting utilities.
 *
 * Previously spread across `app/lib/utils.ts` (4 functions) and
 * `workers/lib/html.ts` (`formatEmailDate`). Now one canonical set
 * imported by both the frontend and backend.
 */

/** Parse safely — returns null on invalid dates instead of NaN-date. */
function safeParse(dateStr: string | undefined | null): Date | null {
	if (!dateStr) return null;
	try {
		const d = new Date(dateStr);
		return isNaN(d.getTime()) ? null : d;
	} catch {
		return null;
	}
}

/**
 * Email list rows.
 * - Today: "3:42 PM"
 * - This year: "Apr 15"
 * - Older: "Apr 15, 2024"
 */
export function formatListDate(dateStr: string): string {
	const date = safeParse(dateStr);
	if (!date) return dateStr;

	const now = new Date();
	if (date.toDateString() === now.toDateString()) {
		return date.toLocaleTimeString(undefined, {
			hour: "numeric",
			minute: "2-digit",
		});
	}
	if (date.getFullYear() === now.getFullYear()) {
		return date.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});
	}
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

/**
 * Email detail header.
 * "Tue, Apr 15, 3:42 PM"
 */
export function formatDetailDate(dateStr: string): string {
	const date = safeParse(dateStr);
	if (!date) return dateStr;

	return date.toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

/**
 * Thread message headers — time only.
 * "3:42 PM"
 */
export function formatShortDate(dateStr: string): string {
	const date = safeParse(dateStr);
	if (!date) return dateStr;

	return date.toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
}

/**
 * Compose quoted replies & backend quoted blocks.
 * "Tue, Apr 15, 2026, 3:42 PM"
 *
 * Uses explicit "en-US" locale for deterministic output on both browser
 * and Cloudflare Workers (which support `toLocaleString`).
 */
export function formatQuotedDate(dateStr: string | undefined): string {
	if (!dateStr) return "";
	const date = safeParse(dateStr);
	if (!date) return dateStr;

	return date.toLocaleString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}

/**
 * Gmail message header date: "Nov 19, 2026, 5:46 PM (3 days ago)".
 * Today: "5:46 PM (2 hours ago)". The year is left out for this year.
 */
export function formatMessageDate(dateStr: string, now: Date = new Date()): string {
	const date = safeParse(dateStr);
	if (!date) return dateStr;
	const sameDay = date.toDateString() === now.toDateString();
	const abs = sameDay
		? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
		: date.toLocaleString(undefined, {
				month: "short",
				day: "numeric",
				...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
				hour: "numeric",
				minute: "2-digit",
			});
	const rel = formatRelative(date, now);
	return rel ? `${abs} (${rel})` : abs;
}

/** "5 minutes ago", "3 days ago"; empty for dates older than 30 days. */
export function formatRelative(date: Date, now: Date = new Date()): string {
	const s = Math.round((now.getTime() - date.getTime()) / 1000);
	if (s < 0) return "";
	if (s < 60) return "just now";
	if (s < 3600) return plural(Math.floor(s / 60), "minute");
	if (s < 86400) return plural(Math.floor(s / 3600), "hour");
	if (s < 86400 * 30) return plural(Math.floor(s / 86400), "day");
	return "";
}

function plural(n: number, unit: string) {
	return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}
