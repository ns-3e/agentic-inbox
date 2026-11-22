import { describe, expect, it } from "vitest";
import { displayName, isValidEmail, nameOrMe, parseAddress, splitAddresses } from "../app/lib/address";
import { splitQuotedText } from "../app/lib/quote";
import { formatMessageDate, formatRelative } from "../shared/dates";
import { buildReplyAllRecipients } from "../app/hooks/useComposeForm";

describe("parseAddress / displayName", () => {
	it("splits a display name and address", () => {
		expect(parseAddress('"Jane Doe" <jane@x.com>')).toEqual({ name: "Jane Doe", address: "jane@x.com" });
		expect(parseAddress("Bob <bob@y.org>")).toEqual({ name: "Bob", address: "bob@y.org" });
		expect(parseAddress("solo@z.io")).toEqual({ name: "", address: "solo@z.io" });
	});
	it("falls back to the local part", () => {
		expect(displayName("chen@partner.co")).toBe("chen");
		expect(displayName("Chen Li <chen@partner.co>")).toBe("Chen Li");
	});
	it("shows me for the mailbox itself", () => {
		expect(nameOrMe("Alice <ALICE@example.com>", "alice@example.com")).toBe("me");
	});
	it("validates addresses", () => {
		expect(isValidEmail("a@b.co")).toBe(true);
		expect(isValidEmail("Name <a@b.co>")).toBe(true);
		expect(isValidEmail("not an address")).toBe(false);
		expect(isValidEmail("a@b")).toBe(false);
	});
});

describe("splitAddresses", () => {
	it("splits commas, semicolons and new lines", () => {
		expect(splitAddresses("a@x.com, b@y.com; c@z.com\nd@w.com")).toEqual(["a@x.com", "b@y.com", "c@z.com", "d@w.com"]);
	});
	it("keeps commas inside quoted names", () => {
		expect(splitAddresses('"Doe, Jane" <jane@x.com>, bob@y.com')).toEqual(['"Doe, Jane" <jane@x.com>', "bob@y.com"]);
	});
	it("splits space separated bare addresses", () => {
		expect(splitAddresses("a@x.com b@y.com")).toEqual(["a@x.com", "b@y.com"]);
	});
});

describe("splitQuotedText", () => {
	it("trims a Gmail quote container", () => {
		const html = '<div>Thanks!</div><div class="gmail_quote">On Mon, Jane wrote:<blockquote>old</blockquote></div>';
		const r = splitQuotedText(html);
		expect(r.body).toBe("<div>Thanks!</div>");
		expect(r.quote).toContain("gmail_quote");
	});
	it("trims an On … wrote: block followed by a blockquote", () => {
		const html = "<p>Sounds good</p><br>On Tue, Apr 15, 2026, 3:42 PM, Jane &lt;j@x.com&gt; wrote:<br><blockquote>earlier</blockquote>";
		const r = splitQuotedText(html);
		expect(r.body).toBe("<p>Sounds good</p>");
		expect(r.quote).toContain("<blockquote>earlier</blockquote>");
	});
	it("does not hide a message that is only a quote", () => {
		const html = '<blockquote type="cite">only quote</blockquote>';
		expect(splitQuotedText(html)).toEqual({ body: html, quote: "" });
	});
	it("leaves plain mail alone", () => {
		expect(splitQuotedText("<p>Hello</p>")).toEqual({ body: "<p>Hello</p>", quote: "" });
	});
});

describe("buildReplyAllRecipients", () => {
	it("puts sender and other To in To, Cc in Cc, and leaves out me", () => {
		const r = buildReplyAllRecipients(
			{ sender: "jane@x.com", recipient: "me@ex.com, bob@y.com", cc: "carol@z.com, me@ex.com, bob@y.com" },
			"me@ex.com",
		);
		expect(r.to).toEqual(["jane@x.com", "bob@y.com"]);
		expect(r.cc).toEqual(["carol@z.com"]);
	});
	it("answers my recipients when I wrote the message", () => {
		const r = buildReplyAllRecipients({ sender: "me@ex.com", recipient: "jane@x.com", cc: "" }, "me@ex.com");
		expect(r.to).toEqual(["jane@x.com"]);
	});
});

describe("buildReplyAllRecipients with burners", () => {
	it("leaves out the mailbox and every burner", () => {
		const r = buildReplyAllRecipients(
			{ sender: "shop@store.test", recipient: "promo@ex.com, jane@x.com", cc: "me@ex.com, bob@y.com" },
			["me@ex.com", "promo@ex.com"],
		);
		expect(r.to).toEqual(["shop@store.test", "jane@x.com"]);
		expect(r.cc).toEqual(["bob@y.com"]);
	});
});

describe("dates", () => {
	const now = new Date("2026-11-22T12:00:00Z");
	it("formats relative times", () => {
		expect(formatRelative(new Date("2026-11-22T11:55:00Z"), now)).toBe("5 minutes ago");
		expect(formatRelative(new Date("2026-11-19T12:00:00Z"), now)).toBe("3 days ago");
		expect(formatRelative(new Date("2026-09-01T12:00:00Z"), now)).toBe("");
	});
	it("adds the relative part to the header date", () => {
		expect(formatMessageDate("2026-11-19T12:00:00Z", now)).toMatch(/\(3 days ago\)$/);
	});
});
