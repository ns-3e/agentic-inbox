/**
 * Detect likely typos in the domain of an email address
 * (for example "hmail.com" -> "gmail.com", "gmial.com" -> "gmail.com").
 *
 * Used by the compose form to warn before sending. A mistyped domain is not
 * caught by Cloudflare at send time: the recipient server bounces the message
 * later, and the bounce never reaches this app.
 */

const COMMON_DOMAINS = [
	"gmail.com",
	"googlemail.com",
	"yahoo.com",
	"ymail.com",
	"hotmail.com",
	"outlook.com",
	"live.com",
	"msn.com",
	"icloud.com",
	"me.com",
	"mac.com",
	"aol.com",
	"proton.me",
	"protonmail.com",
	"pm.me",
	"fastmail.com",
	"hey.com",
	"comcast.net",
	"att.net",
	"verizon.net",
	"zoho.com",
	"gmx.com",
	"mail.com",
];

/** Real domains that are close to a common domain; never flag these. */
const KNOWN_GOOD = new Set(["mail.com", "gmx.com", "gmx.net", "ymail.com", "me.com", "mac.com", "live.com", "msn.com"]);

function editDistance(a: string, b: string): number {
	const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let diag = prev[0];
		prev[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const tmp = prev[j];
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + cost);
			// transposition ("gmial" -> "gmail")
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				prev[j] = Math.min(prev[j], diag);
			}
			diag = tmp;
		}
	}
	return prev[b.length];
}

/**
 * Return the corrected address if the domain looks like a typo of a common
 * provider, otherwise null.
 */
export function suggestEmailFix(address: string): string | null {
	const at = address.lastIndexOf("@");
	if (at < 1) return null;
	const local = address.slice(0, at);
	const domain = address.slice(at + 1).trim().toLowerCase();
	if (!domain || COMMON_DOMAINS.includes(domain) || KNOWN_GOOD.has(domain)) return null;

	// Wrong or missing TLD: "gmail.co", "gmail.con", "gmail"
	const [name] = domain.split(".");
	const sameName = COMMON_DOMAINS.find((d) => d.split(".")[0] === name);
	if (sameName && sameName !== domain && editDistance(domain, sameName) <= 2) {
		return `${local}@${sameName}`;
	}

	let best: string | null = null;
	let bestDistance = Infinity;
	for (const candidate of COMMON_DOMAINS) {
		const d = editDistance(domain, candidate);
		if (d < bestDistance) {
			best = candidate;
			bestDistance = d;
		}
	}
	// One edit for short domains, two for longer ones.
	const limit = domain.length <= 8 ? 1 : 2;
	return best && bestDistance <= limit ? `${local}@${best}` : null;
}
