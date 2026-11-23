// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * App-wide display and behavior preferences. They belong to this browser
 * (localStorage), not to a mailbox: per-mailbox settings live on the server.
 *
 * Theme, accent and size are applied to <html> as CSS variables and data
 * attributes. A precomputed copy is stored under BOOT_KEY so an inline script
 * in <head> can apply it before first paint (no flash of the default theme).
 */

export type ThemeMode = "system" | "light" | "dark";
export type Density = "compact" | "default" | "comfortable";
export type TextSize = "xs" | "sm" | "md" | "lg" | "xl";
export type MotionPref = "system" | "reduce";
export type ClockPref = "system" | "12h" | "24h";
export type AfterAction = "list" | "older" | "newer";
export type RemoteImages = "load" | "block";

export interface Preferences {
	// Appearance
	theme: ThemeMode;
	/** A preset id from ACCENT_PRESETS, or "custom" (uses customAccent). */
	accent: string;
	customAccent: string;
	/** A preset id from AGENT_PRESETS. */
	agentColor: string;
	textSize: TextSize;
	density: Density;
	motion: MotionPref;
	// Conversation list
	showSnippets: boolean;
	showAwaitingReply: boolean;
	pageSize: number;
	refreshSeconds: number;
	clock: ClockPref;
	// Reading
	markReadOnOpen: boolean;
	afterAction: AfterAction;
	remoteImages: RemoteImages;
	// Sending
	undoSendSeconds: number;
	confirmNoSubject: boolean;
	// Keyboard
	shortcuts: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
	theme: "system",
	accent: "teal",
	customAccent: "#0b6e78",
	agentColor: "violet",
	textSize: "md",
	density: "default",
	motion: "system",
	showSnippets: true,
	showAwaitingReply: true,
	pageSize: 50,
	refreshSeconds: 30,
	clock: "system",
	markReadOnOpen: true,
	afterAction: "list",
	remoteImages: "load",
	undoSendSeconds: 5,
	confirmNoSubject: true,
	shortcuts: true,
};

export const PREFS_KEY = "inbox.prefs";
export const BOOT_KEY = "inbox.prefs.boot";

/** A color for light mode (white text on it) and one for dark mode (dark text on it). */
export interface ColorPair {
	id: string;
	label: string;
	light: string;
	dark: string;
}

export const ACCENT_PRESETS: ColorPair[] = [
	{ id: "teal", label: "Routing teal", light: "#0b6e78", dark: "#36aab4" },
	{ id: "blue", label: "Blue", light: "#1d5fd1", dark: "#6ea2ff" },
	{ id: "indigo", label: "Indigo", light: "#4f46e5", dark: "#9591ff" },
	{ id: "emerald", label: "Emerald", light: "#0f7a55", dark: "#3fc28f" },
	{ id: "amber", label: "Amber", light: "#a35a00", dark: "#f0a93c" },
	{ id: "orange", label: "Orange", light: "#c2410c", dark: "#fb8a4c" },
	{ id: "rose", label: "Rose", light: "#c0264d", dark: "#ff7a98" },
	{ id: "graphite", label: "Graphite", light: "#3d4652", dark: "#b7c0cc" },
];

export const AGENT_PRESETS: ColorPair[] = [
	{ id: "violet", label: "Violet", light: "#6b46d6", dark: "#ad97ff" },
	{ id: "magenta", label: "Magenta", light: "#a3248f", dark: "#f07fdc" },
	{ id: "blue", label: "Blue", light: "#2b59c3", dark: "#86a8ff" },
	{ id: "cyan", label: "Cyan", light: "#0e7490", dark: "#4fd1e8" },
	{ id: "amber", label: "Amber", light: "#9a5b00", dark: "#f2b34b" },
];

export const TEXT_SIZES: { id: TextSize; label: string; scale: string }[] = [
	{ id: "xs", label: "Smaller", scale: "87.5%" },
	{ id: "sm", label: "Small", scale: "93.75%" },
	{ id: "md", label: "Default", scale: "100%" },
	{ id: "lg", label: "Large", scale: "106.25%" },
	{ id: "xl", label: "Larger", scale: "112.5%" },
];

export const PAGE_SIZES = [25, 50, 100];
export const REFRESH_OPTIONS = [
	{ value: 15, label: "Every 15 seconds" },
	{ value: 30, label: "Every 30 seconds" },
	{ value: 60, label: "Every minute" },
	{ value: 300, label: "Every 5 minutes" },
	{ value: 0, label: "Off (refresh by hand)" },
];
export const UNDO_SEND_OPTIONS = [0, 5, 10, 20, 30];

// ── Color math (OKLCH) ─────────────────────────────────────────────

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB | null {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	let h = m[1];
	if (h.length === 3) h = h.split("").map((c) => c + c).join("");
	const n = Number.parseInt(h, 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function rgbToHex([r, g, b]: RGB): string {
	const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
	return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToOklch(rgb: RGB): [number, number, number] {
	const [r, g, b] = rgb.map(toLinear);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

/** OKLCH to sRGB; null when the color is outside the sRGB gamut. */
function oklchToRgb(L: number, C: number, H: number): RGB | null {
	const h = (H * Math.PI) / 180;
	const A = C * Math.cos(h);
	const B = C * Math.sin(h);
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
	const lin: RGB = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	if (lin.some((v) => v < -0.0005 || v > 1.0005)) return null;
	return lin.map(fromLinear) as RGB;
}

/** Nearest in-gamut color: keep lightness and hue, reduce chroma. */
function oklchToHex(L: number, C: number, H: number): string {
	let c = C;
	for (let i = 0; i < 40; i++) {
		const rgb = oklchToRgb(L, c, H);
		if (rgb) return rgbToHex(rgb);
		c *= 0.92;
	}
	return rgbToHex(oklchToRgb(L, 0, H) ?? [L, L, L]);
}

function luminance(rgb: RGB): number {
	const [r, g, b] = rgb.map(toLinear);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
	const x = hexToRgb(a);
	const y = hexToRgb(b);
	if (!x || !y) return 1;
	const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
	return (hi + 0.05) / (lo + 0.05);
}

export function isHexColor(v: string): boolean {
	return hexToRgb(v) !== null;
}

/**
 * Turn any color into an accent pair that stays readable: the light-mode
 * color carries white text (≥ 4.5:1), the dark-mode color carries the dark
 * inverse text and reads on the dark surface. Hue and chroma are kept.
 */
export function deriveAccent(hex: string): { light: string; dark: string } {
	const rgb = hexToRgb(hex) ?? hexToRgb(DEFAULT_PREFERENCES.customAccent)!;
	const [L, C, H] = rgbToOklch(rgb);
	let lightL = Math.min(Math.max(L, 0.3), 0.56);
	let light = oklchToHex(lightL, C, H);
	while (contrastRatio(light, "#ffffff") < 4.5 && lightL > 0.2) {
		lightL -= 0.01;
		light = oklchToHex(lightL, C, H);
	}
	let darkL = Math.min(Math.max(L, 0.72), 0.84);
	let dark = oklchToHex(darkL, C, H);
	while (contrastRatio(dark, "#15191e") < 6 && darkL < 0.95) {
		darkL += 0.01;
		dark = oklchToHex(darkL, C, H);
	}
	return { light, dark };
}

export function accentPair(p: Pick<Preferences, "accent" | "customAccent">): { light: string; dark: string } {
	if (p.accent === "custom") return deriveAccent(p.customAccent);
	return ACCENT_PRESETS.find((a) => a.id === p.accent) ?? ACCENT_PRESETS[0];
}

export function agentPair(p: Pick<Preferences, "agentColor">): { light: string; dark: string } {
	return AGENT_PRESETS.find((a) => a.id === p.agentColor) ?? AGENT_PRESETS[0];
}

// ── Applying to the document ──────────────────────────────────────

/** What the <head> boot script and applyPreferences() write onto <html>. */
export interface BootState {
	theme: ThemeMode;
	vars: Record<string, string>;
	attrs: Record<string, string>;
}

export function bootState(p: Preferences): BootState {
	const accent = accentPair(p);
	const agent = agentPair(p);
	return {
		theme: p.theme,
		vars: {
			"--accent-l": accent.light,
			"--accent-d": accent.dark,
			"--agent-l": agent.light,
			"--agent-d": agent.dark,
			"--ui-scale": TEXT_SIZES.find((t) => t.id === p.textSize)?.scale ?? "100%",
		},
		attrs: {
			"data-density": p.density,
			"data-motion": p.motion,
		},
	};
}

/**
 * Inline script for <head>. It must stay self-contained (it runs before the
 * app bundle) and mirror applyBootState() below.
 */
export const BOOT_SCRIPT = `(function(){try{var b=JSON.parse(localStorage.getItem(${JSON.stringify(BOOT_KEY)})||"null");if(!b)return;var r=document.documentElement,k;for(k in b.vars)r.style.setProperty(k,b.vars[k]);for(k in b.attrs)r.setAttribute(k,b.attrs[k]);var m=b.theme;if(m==="light"||m==="dark"){r.style.colorScheme=m}else{m=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}r.setAttribute("data-mode",m)}catch(e){}})();`;

const THEME_COLOR = { light: "#ffffff", dark: "#15191e" };

export function resolvedMode(theme: ThemeMode): "light" | "dark" {
	if (theme !== "system") return theme;
	return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyBootState(b: BootState) {
	if (typeof document === "undefined") return;
	const r = document.documentElement;
	for (const [k, v] of Object.entries(b.vars)) r.style.setProperty(k, v);
	for (const [k, v] of Object.entries(b.attrs)) r.setAttribute(k, v);
	r.style.colorScheme = b.theme === "system" ? "" : b.theme;
	const mode = resolvedMode(b.theme);
	r.setAttribute("data-mode", mode);
	// The browser / installed-app chrome color follows the forced theme too.
	for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
		const media = meta.getAttribute("media") ?? "";
		const own = media.includes("dark") ? "dark" : "light";
		meta.content = THEME_COLOR[b.theme === "system" ? own : mode];
	}
}

/** Fill in missing or invalid fields so old or hand-edited storage cannot break the app. */
export function normalizePreferences(raw: unknown): Preferences {
	const p = { ...DEFAULT_PREFERENCES };
	if (!raw || typeof raw !== "object") return p;
	const r = raw as Record<string, unknown>;
	const pick = <K extends keyof Preferences>(key: K, ok: (v: unknown) => boolean) => {
		if (key in r && ok(r[key])) (p as Record<string, unknown>)[key] = r[key];
	};
	const oneOf = (...vals: unknown[]) => (v: unknown) => vals.includes(v);
	const isBool = (v: unknown) => typeof v === "boolean";
	pick("theme", oneOf("system", "light", "dark"));
	pick("accent", (v) => v === "custom" || ACCENT_PRESETS.some((a) => a.id === v));
	pick("customAccent", (v) => typeof v === "string" && isHexColor(v));
	pick("agentColor", (v) => AGENT_PRESETS.some((a) => a.id === v));
	pick("textSize", (v) => TEXT_SIZES.some((t) => t.id === v));
	pick("density", oneOf("compact", "default", "comfortable"));
	pick("motion", oneOf("system", "reduce"));
	pick("showSnippets", isBool);
	pick("showAwaitingReply", isBool);
	pick("pageSize", oneOf(...PAGE_SIZES));
	pick("refreshSeconds", oneOf(...REFRESH_OPTIONS.map((o) => o.value)));
	pick("clock", oneOf("system", "12h", "24h"));
	pick("markReadOnOpen", isBool);
	pick("afterAction", oneOf("list", "older", "newer"));
	pick("remoteImages", oneOf("load", "block"));
	pick("undoSendSeconds", oneOf(...UNDO_SEND_OPTIONS));
	pick("confirmNoSubject", isBool);
	pick("shortcuts", isBool);
	return p;
}

/** `hour12` option for toLocale*String: undefined follows the locale. */
export function hour12For(clock: ClockPref): boolean | undefined {
	return clock === "system" ? undefined : clock === "12h";
}
