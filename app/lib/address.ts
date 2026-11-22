// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/** Helpers for "Name <address>" strings. Pure functions, safe on server and client. */

export interface ParsedAddress {
	name: string;
	address: string;
}

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/** Split `"Jane Doe" <jane@x.com>` into name and address. A bare address has no name. */
export function parseAddress(raw: string | null | undefined): ParsedAddress {
	const t = (raw || "").trim();
	const lt = t.lastIndexOf("<");
	const gt = t.lastIndexOf(">");
	if (lt >= 0 && gt > lt) {
		const name = t.slice(0, lt).trim().replace(/^"(.*)"$/, "$1").trim();
		return { name, address: t.slice(lt + 1, gt).trim() };
	}
	return { name: "", address: t };
}

/** Name to show for a sender: the display name, else the local part made readable. */
export function displayName(raw: string | null | undefined): string {
	const { name, address } = parseAddress(raw);
	if (name) return name;
	const local = address.split("@")[0] || address;
	return local;
}

export function isValidEmail(address: string): boolean {
	return EMAIL_RE.test(parseAddress(address).address);
}

/**
 * Split typed or pasted text into addresses. Commas, semicolons, new lines
 * and spaces separate them; a quoted display name may hold spaces and commas.
 */
export function splitAddresses(text: string): string[] {
	const out: string[] = [];
	let cur = "";
	let inQuote = false;
	let inAngle = false;
	for (const ch of text) {
		if (ch === '"') inQuote = !inQuote;
		else if (ch === "<") inAngle = true;
		else if (ch === ">") inAngle = false;
		if (!inQuote && !inAngle && /[,;\n\r\t]/.test(ch)) {
			if (cur.trim()) out.push(cur.trim());
			cur = "";
			continue;
		}
		cur += ch;
	}
	if (cur.trim()) out.push(cur.trim());
	// "a@x.com b@y.com" (space separated, no names) -> two addresses
	return out.flatMap((part) =>
		!part.includes("<") && !part.includes('"') && /\s/.test(part) && part.split(/\s+/).every((p) => p.includes("@"))
			? part.split(/\s+/)
			: [part],
	);
}

/** "me" when the address is the mailbox itself, else the display name. */
export function nameOrMe(raw: string, self?: string): string {
	const { address } = parseAddress(raw);
	if (self && address.toLowerCase() === self.toLowerCase()) return "me";
	return displayName(raw);
}
