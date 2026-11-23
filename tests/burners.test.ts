import { describe, expect, it } from "vitest";
import { burnerDomains, LOCAL_PART_RE, randomLocalPart } from "../shared/burners";
import { BurnerError, createBurner } from "../workers/lib/burners";

/** Just enough of R2 for createBurner. */
function fakeBucket() {
	const store = new Map<string, string>();
	return {
		store,
		head: async (key: string) => (store.has(key) ? {} : null),
		put: async (key: string, value: string) => void store.set(key, value),
	} as unknown as R2Bucket & { store: Map<string, string> };
}

describe("burner naming", () => {
	it("random names are valid local parts", () => {
		for (let i = 0; i < 50; i++) expect(LOCAL_PART_RE.test(randomLocalPart())).toBe(true);
	});
	it("lists the mailbox domain first, then configured domains, without duplicates", () => {
		expect(burnerDomains("me@a.com", ["b.com", "A.com", " c.io "])).toEqual(["a.com", "b.com", "c.io"]);
		expect(burnerDomains(undefined, ["b.com"])).toEqual(["b.com"]);
	});
});

describe("createBurner domains", () => {
	it("defaults to the mailbox domain", async () => {
		const b = await createBurner(fakeBucket(), "me@a.com", { localPart: "shop" });
		expect(b.address).toBe("shop@a.com");
	});
	it("uses a configured domain", async () => {
		const b = await createBurner(fakeBucket(), "me@a.com", { localPart: "Shop", domain: "B.com" }, ["b.com"]);
		expect(b.address).toBe("shop@b.com");
		expect(b.mailboxId).toBe("me@a.com");
	});
	it("generates a random name on the chosen domain", async () => {
		const b = await createBurner(fakeBucket(), "me@a.com", { domain: "b.com" }, ["b.com"]);
		expect(b.address).toMatch(/^[a-z]+-[a-z]+-\d{4}@b\.com$/);
	});
	it("rejects a domain that is not configured", async () => {
		await expect(createBurner(fakeBucket(), "me@a.com", { domain: "evil.com" }, ["b.com"])).rejects.toBeInstanceOf(BurnerError);
	});
	it("rejects an address that is taken", async () => {
		const bucket = fakeBucket();
		await createBurner(bucket, "me@a.com", { localPart: "shop", domain: "b.com" }, ["b.com"]);
		await expect(createBurner(bucket, "me@a.com", { localPart: "shop", domain: "b.com" }, ["b.com"])).rejects.toMatchObject({ status: 409 });
	});
});
