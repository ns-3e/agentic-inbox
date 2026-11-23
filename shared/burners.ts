// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Burner address naming, shared by the Worker (which creates burners) and
 * the app (which previews a random name before creation).
 */

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

function randomInt(max: number): number {
	return crypto.getRandomValues(new Uint32Array(1))[0] % max;
}

/** A random `adjective-noun-1234` local part. */
export function randomLocalPart(): string {
	return `${ADJECTIVES[randomInt(ADJECTIVES.length)]}-${NOUNS[randomInt(NOUNS.length)]}-${randomInt(9000) + 1000}`;
}

/** Local parts are limited to a conservative, URL-safe character set. */
export const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

export const LOCAL_PART_HINT = "Use only letters, numbers, dots, dashes and underscores";

/** Domains a mailbox's burners may use: the mailbox's own domain first, then DOMAINS. */
export function burnerDomains(mailboxId: string | undefined, configured: string[]): string[] {
	const own = mailboxId?.split("@")[1]?.toLowerCase();
	const all = [own, ...configured.map((d) => d.trim().toLowerCase())].filter((d): d is string => !!d);
	return [...new Set(all)];
}
