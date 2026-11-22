// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Burner addresses: throwaway aliases that deliver into a parent mailbox.
 *
 * Each burner is one R2 object at `burners/{address}.json`, so the inbound
 * email handler can resolve an address with a single lookup. The owning
 * mailbox is also kept in customMetadata so a listing can filter by mailbox
 * without fetching every object body.
 *
 * Enabled burners deliver to the parent mailbox's Inbox. Disabled burners
 * reject the message at SMTP time, so the sender gets a bounce.
 */

export interface Burner {
	address: string;
	mailboxId: string;
	label: string;
	enabled: boolean;
	createdAt: string;
	receivedCount: number;
	blockedCount: number;
	lastReceivedAt: string | null;
}

const PREFIX = "burners/";
const keyFor = (address: string) => `${PREFIX}${address.toLowerCase()}.json`;

const ADJECTIVES = [
	"amber", "brisk", "calm", "dusty", "eager", "faint", "gentle", "hollow", "icy", "jolly",
	"keen", "lunar", "misty", "noble", "olive", "plain", "quiet", "rapid", "rusty", "silent",
	"sunny", "tidy", "urban", "vivid", "windy", "young", "zesty", "bold", "coral", "frosty",
];
const NOUNS = [
	"otter", "maple", "harbor", "falcon", "pebble", "comet", "meadow", "lantern", "badger", "cedar",
	"ember", "fjord", "gecko", "heron", "island", "juniper", "kettle", "lagoon", "marble", "nectar",
	"orchid", "parrot", "quartz", "raven", "spruce", "tundra", "walrus", "willow", "yarrow", "zephyr",
];

function pick<T>(list: T[]): T {
	return list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
}

function randomLocalPart(): string {
	const digits = (crypto.getRandomValues(new Uint32Array(1))[0] % 9000) + 1000;
	return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${digits}`;
}

/** Local parts are limited to a conservative, URL-safe character set. */
export const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

export async function getBurner(bucket: R2Bucket, address: string): Promise<Burner | null> {
	const obj = await bucket.get(keyFor(address));
	return obj ? ((await obj.json()) as Burner) : null;
}

export async function putBurner(bucket: R2Bucket, burner: Burner): Promise<void> {
	await bucket.put(keyFor(burner.address), JSON.stringify(burner), {
		customMetadata: { mailboxId: burner.mailboxId },
	});
}

export async function deleteBurner(bucket: R2Bucket, address: string): Promise<void> {
	await bucket.delete(keyFor(address));
}

/** All burners owned by one mailbox, newest first. */
export async function listBurners(bucket: R2Bucket, mailboxId: string): Promise<Burner[]> {
	const keys: string[] = [];
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ prefix: PREFIX, cursor, include: ["customMetadata"] });
		for (const obj of page.objects) {
			if (obj.customMetadata?.mailboxId === mailboxId) keys.push(obj.key);
		}
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);

	const burners = await Promise.all(
		keys.map(async (key) => {
			const obj = await bucket.get(key);
			return obj ? ((await obj.json()) as Burner) : null;
		}),
	);
	return burners
		.filter((b): b is Burner => b !== null)
		.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** True if the address is already a mailbox or a burner. */
async function addressTaken(bucket: R2Bucket, address: string): Promise<boolean> {
	const [mailbox, burner] = await Promise.all([
		bucket.head(`mailboxes/${address}.json`),
		bucket.head(keyFor(address)),
	]);
	return !!(mailbox || burner);
}

export class BurnerError extends Error {
	constructor(message: string, public status: 400 | 409) {
		super(message);
		this.name = "BurnerError";
	}
}

/**
 * Create a burner on the parent mailbox's domain. Uses `localPart` when given,
 * otherwise generates a random `adjective-noun-1234` name.
 */
export async function createBurner(
	bucket: R2Bucket,
	mailboxId: string,
	opts: { label?: string; localPart?: string },
): Promise<Burner> {
	const domain = mailboxId.split("@")[1];
	if (!domain) throw new BurnerError("Mailbox has no domain", 400);

	let address: string | undefined;
	if (opts.localPart) {
		const local = opts.localPart.trim().toLowerCase();
		if (!LOCAL_PART_RE.test(local)) {
			throw new BurnerError("Use only letters, numbers, dots, dashes and underscores", 400);
		}
		address = `${local}@${domain}`;
		if (await addressTaken(bucket, address)) throw new BurnerError("That address is already in use", 409);
	} else {
		for (let i = 0; i < 5 && !address; i++) {
			const candidate = `${randomLocalPart()}@${domain}`;
			if (!(await addressTaken(bucket, candidate))) address = candidate;
		}
		if (!address) throw new BurnerError("Could not generate a free address, try again", 409);
	}

	const burner: Burner = {
		address,
		mailboxId,
		label: (opts.label || "").trim().slice(0, 100),
		enabled: true,
		createdAt: new Date().toISOString(),
		receivedCount: 0,
		blockedCount: 0,
		lastReceivedAt: null,
	};
	await putBurner(bucket, burner);
	return burner;
}

/**
 * Best-effort counter update after inbound mail. A read-modify-write on R2,
 * so concurrent deliveries can lose an increment; that is fine for stats.
 */
export async function recordBurnerHit(bucket: R2Bucket, address: string, delivered: boolean): Promise<void> {
	const burner = await getBurner(bucket, address);
	if (!burner) return;
	if (delivered) {
		burner.receivedCount += 1;
		burner.lastReceivedAt = new Date().toISOString();
	} else {
		burner.blockedCount += 1;
	}
	await putBurner(bucket, burner);
}

const ADDRESS_RE = /[^\s<>,;"']+@[^\s<>,;"']+/g;

/** Every distinct, lowercased email address found in the given header fields. */
export function addressesIn(...fields: (string | null | undefined)[]): string[] {
	const out = new Set<string>();
	for (const f of fields) for (const m of (f || "").matchAll(ADDRESS_RE)) out.add(m[0].toLowerCase());
	return [...out];
}

/**
 * The burner of `mailboxId` that took part in an email, if any: found in its
 * recipients (mail received at the burner) or its sender (a reply already
 * sent from the burner). Replies to that email go out from this burner, so
 * the mailbox's real address is never revealed in a burner conversation.
 */
export async function findThreadBurner(
	bucket: R2Bucket,
	mailboxId: string,
	email: { sender?: string | null; recipient?: string | null; cc?: string | null },
): Promise<Burner | null> {
	const self = mailboxId.toLowerCase();
	const candidates = addressesIn(email.recipient, email.cc, email.sender)
		.filter((a) => a !== self && a.endsWith(`@${self.split("@")[1]}`))
		.slice(0, 10);
	for (const address of candidates) {
		const burner = await getBurner(bucket, address);
		if (burner && burner.mailboxId === mailboxId) return burner;
	}
	return null;
}
