import { describe, expect, it } from "vitest";
import { hasRemoteImages } from "../app/components/EmailIframe";
import { nextAfterRemoval } from "../app/hooks/useMailActions";
import {
	ACCENT_PRESETS,
	AGENT_PRESETS,
	BOOT_KEY,
	BOOT_SCRIPT,
	bootState,
	contrastRatio,
	DEFAULT_PREFERENCES,
	deriveAccent,
	hour12For,
	normalizePreferences,
} from "../app/lib/preferences";
import type { Email } from "../app/types";

describe("normalizePreferences", () => {
	it("returns defaults for missing or broken input", () => {
		expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
		expect(normalizePreferences("nope")).toEqual(DEFAULT_PREFERENCES);
	});
	it("keeps valid values and drops invalid ones", () => {
		const p = normalizePreferences({
			theme: "dark",
			accent: "rose",
			customAccent: "not-a-color",
			pageSize: 37,
			undoSendSeconds: 10,
			shortcuts: "yes",
			unknown: 1,
		});
		expect(p.theme).toBe("dark");
		expect(p.accent).toBe("rose");
		expect(p.customAccent).toBe(DEFAULT_PREFERENCES.customAccent);
		expect(p.pageSize).toBe(DEFAULT_PREFERENCES.pageSize);
		expect(p.undoSendSeconds).toBe(10);
		expect(p.shortcuts).toBe(true);
		expect("unknown" in p).toBe(false);
	});
	it("accepts a custom accent", () => {
		expect(normalizePreferences({ accent: "custom", customAccent: "#ff00aa" }).accent).toBe("custom");
	});
});

describe("accent colors", () => {
	it("presets keep text readable in both themes", () => {
		for (const p of [...ACCENT_PRESETS, ...AGENT_PRESETS]) {
			expect(contrastRatio(p.light, "#ffffff"), `${p.id} light`).toBeGreaterThanOrEqual(4.5);
			expect(contrastRatio(p.dark, "#15191e"), `${p.id} dark`).toBeGreaterThanOrEqual(4.5);
		}
	});
	it("derives readable shades from any custom color", () => {
		for (const hex of ["#ffff00", "#00ff00", "#ffffff", "#000000", "#0b6e78", "#ff69b4", "#123"]) {
			const { light, dark } = deriveAccent(hex);
			expect(contrastRatio(light, "#ffffff"), `${hex} light`).toBeGreaterThanOrEqual(4.5);
			expect(contrastRatio(dark, "#15191e"), `${hex} dark`).toBeGreaterThanOrEqual(4.5);
			expect(light).toMatch(/^#[0-9a-f]{6}$/);
			expect(dark).toMatch(/^#[0-9a-f]{6}$/);
		}
	});
	it("keeps a dark-enough color as it is", () => {
		expect(deriveAccent("#0b6e78").light).toBe("#0b6e78");
	});
});

describe("bootState / BOOT_SCRIPT", () => {
	it("writes the CSS variables and attributes", () => {
		const b = bootState({ ...DEFAULT_PREFERENCES, accent: "blue", textSize: "lg", density: "comfortable" });
		expect(b.vars["--accent-l"]).toBe("#1d5fd1");
		expect(b.vars["--ui-scale"]).toBe("106.25%");
		expect(b.attrs["data-density"]).toBe("comfortable");
	});
	it("the boot script reads the boot key and is valid JavaScript", () => {
		expect(BOOT_SCRIPT).toContain(JSON.stringify(BOOT_KEY));
		expect(() => new Function(BOOT_SCRIPT)).not.toThrow();
	});
});

describe("hour12For", () => {
	it("maps the clock choice", () => {
		expect(hour12For("system")).toBeUndefined();
		expect(hour12For("12h")).toBe(true);
		expect(hour12For("24h")).toBe(false);
	});
});

describe("nextAfterRemoval", () => {
	const t = (id: string) => ({ email: { id } as Email, mailboxId: "a@x.com" });
	const items = [t("1"), t("2"), t("3"), t("4")];
	it("goes back to the list by default", () => {
		expect(nextAfterRemoval("2", [t("2")], "list", items)).toBeNull();
	});
	it("opens the next older or newer conversation", () => {
		expect(nextAfterRemoval("2", [t("2")], "older", items)?.email.id).toBe("3");
		expect(nextAfterRemoval("2", [t("2")], "newer", items)?.email.id).toBe("1");
	});
	it("skips conversations removed in the same action", () => {
		expect(nextAfterRemoval("2", [t("2"), t("3")], "older", items)?.email.id).toBe("4");
	});
	it("returns null at the end of the list", () => {
		expect(nextAfterRemoval("4", [t("4")], "older", items)).toBeNull();
		expect(nextAfterRemoval("1", [t("1")], "newer", items)).toBeNull();
	});
});

describe("hasRemoteImages", () => {
	it("finds network images", () => {
		expect(hasRemoteImages('<img src="https://t.example.com/p.gif">')).toBe(true);
		expect(hasRemoteImages("<img src=//cdn.example.com/a.png>")).toBe(true);
		expect(hasRemoteImages('<div style="background:url(https://x.com/a.png)">')).toBe(true);
		expect(hasRemoteImages('<td background="http://x.com/bg.png">')).toBe(true);
	});
	it("ignores inline and data images", () => {
		expect(hasRemoteImages('<img src="/api/v1/mailboxes/a/emails/b/attachments/c">')).toBe(false);
		expect(hasRemoteImages('<img src="data:image/png;base64,AAA">')).toBe(false);
		expect(hasRemoteImages("<p>No images at https://example.com</p>")).toBe(false);
	});
});
