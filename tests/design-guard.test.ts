import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guards for the mobile UI audit (2026-11-24): phone parity rules from
// DESIGN.md that are easy to lose in a CSS refactor.
const css = readFileSync(new URL("../app/index.css", import.meta.url), "utf8");
const phoneBlocks = [...css.matchAll(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");

describe("phone parity (DESIGN.md: 44px targets)", () => {
	for (const cls of [".icon-btn", ".btn", ".field"]) {
		it(`${cls} is 2.75rem tall on phones`, () => {
			const rule = new RegExp(`\\${cls} \\{[^}]*height: 2\\.75rem`);
			expect(phoneBlocks).toMatch(rule);
		});
	}
});

describe("form controls", () => {
	it("selects drop the native look and share the field chevron", () => {
		expect(css).toMatch(/select\.field \{[^}]*appearance: none/);
	});
	it("an off switch has a visible track (WCAG 1.4.11)", () => {
		expect(css).toMatch(/button\[role="switch"\]\[aria-checked="false"\] \{[^}]*background:/);
	});
});
