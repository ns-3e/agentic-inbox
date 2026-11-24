import { describe, expect, it } from "vitest";
import { buildFitScript, fitScale } from "../app/components/EmailIframe";

describe("fitScale", () => {
	it("keeps content that already fits at full size", () => {
		expect(fitScale(375, 375)).toBe(1);
		expect(fitScale(300, 375)).toBe(1);
		expect(fitScale(376, 375)).toBe(1); // sub-pixel rounding
	});
	it("shrinks wide content to the frame width", () => {
		expect(fitScale(600, 375)).toBe(0.625);
		expect(fitScale(700, 350)).toBe(0.5);
		const s = fitScale(640, 359);
		expect(640 * s).toBeLessThanOrEqual(359);
	});
	it("ignores bad measurements", () => {
		expect(fitScale(0, 375)).toBe(1);
		expect(fitScale(600, 0)).toBe(1);
		expect(fitScale(Number.NaN, 375)).toBe(1);
	});
});

describe("buildFitScript", () => {
	it("produces valid JavaScript with and without height reports", () => {
		for (const report of [true, false]) {
			const src = buildFitScript(report);
			expect(() => new Function(src)).not.toThrow();
			expect(src.includes("postMessage")).toBe(report);
			expect(src).not.toMatch(/<\/script/i);
		}
	});
});
