// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Catch-all handling for mail sent to unknown addresses on a domain (the
 * Email Routing catch-all rule sends every address to this Worker).
 *
 * Per domain, one mailbox collects that mail in its "Other addresses"
 * folder, or catch-all is off and unknown addresses are rejected at SMTP
 * time. The choice is stored at `catchall/{domain}.json`. With no stored
 * choice, the first mailbox on the domain (alphabetical) collects it.
 */
import { listMailboxes } from "./email-helpers";

interface StoredCatchAll {
	/** The collecting mailbox, or null when catch-all is off. */
	mailboxId: string | null;
}

export interface CatchAllStatus {
	domain: string;
	/** The mailbox that collects unknown-address mail now; null = rejected. */
	mailboxId: string | null;
	/** False when no choice was saved and the default applies. */
	configured: boolean;
	/** Mailboxes on this domain, to choose from. */
	mailboxes: string[];
}

const keyFor = (domain: string) => `catchall/${domain.toLowerCase()}.json`;
const domainOf = (address: string) => address.split("@")[1]?.toLowerCase() ?? "";

async function readStored(bucket: R2Bucket, domain: string): Promise<StoredCatchAll | null> {
	const obj = await bucket.get(keyFor(domain));
	return obj ? ((await obj.json()) as StoredCatchAll) : null;
}

async function mailboxesOn(bucket: R2Bucket, domain: string): Promise<string[]> {
	return (await listMailboxes(bucket))
		.map((m) => m.id.toLowerCase())
		.filter((id) => domainOf(id) === domain.toLowerCase())
		.sort();
}

export async function getCatchAllStatus(bucket: R2Bucket, domain: string): Promise<CatchAllStatus> {
	const d = domain.toLowerCase();
	const [stored, mailboxes] = await Promise.all([readStored(bucket, d), mailboxesOn(bucket, d)]);
	if (stored) {
		if (stored.mailboxId === null) return { domain: d, mailboxId: null, configured: true, mailboxes };
		// A deleted collector falls back to the default.
		if (mailboxes.includes(stored.mailboxId)) return { domain: d, mailboxId: stored.mailboxId, configured: true, mailboxes };
	}
	return { domain: d, mailboxId: mailboxes[0] ?? null, configured: false, mailboxes };
}

/** Catch-all status for every domain that has at least one mailbox. */
export async function listCatchAllStatus(bucket: R2Bucket): Promise<CatchAllStatus[]> {
	const domains = [...new Set((await listMailboxes(bucket)).map((m) => domainOf(m.id)).filter(Boolean))].sort();
	return Promise.all(domains.map((d) => getCatchAllStatus(bucket, d)));
}

/** Choose the collecting mailbox for a domain, or null to turn catch-all off. */
export async function setCatchAll(bucket: R2Bucket, domain: string, mailboxId: string | null): Promise<CatchAllStatus> {
	const d = domain.toLowerCase();
	if (mailboxId !== null) {
		const id = mailboxId.toLowerCase();
		if (domainOf(id) !== d || !(await bucket.head(`mailboxes/${id}.json`))) {
			throw new Error(`${mailboxId} is not a mailbox on ${d}`);
		}
		mailboxId = id;
	}
	await bucket.put(keyFor(d), JSON.stringify({ mailboxId } satisfies StoredCatchAll));
	return getCatchAllStatus(bucket, d);
}
