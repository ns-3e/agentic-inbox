// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { create } from "zustand";

/** Gmail-style snackbar: one short message at the bottom, with an optional action (Undo). */
export interface SnackbarMessage {
	id: number;
	message: string;
	actionLabel?: string;
	onAction?: () => void;
	/** Called when the snackbar goes away without the action being used. */
	onTimeout?: () => void;
	duration: number;
	variant?: "default" | "error";
}

interface SnackbarState {
	current: SnackbarMessage | null;
	show: (msg: Omit<SnackbarMessage, "id" | "duration"> & { duration?: number }) => number;
	dismiss: (id?: number, viaAction?: boolean) => void;
}

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

export const useSnackbar = create<SnackbarState>((set, get) => ({
	current: null,
	show: (msg) => {
		// A new message replaces the old one; the old one counts as timed out.
		const prev = get().current;
		if (prev) {
			clearTimeout(timer);
			prev.onTimeout?.();
		}
		const id = nextId++;
		const duration = msg.duration ?? (msg.actionLabel ? 6000 : 4000);
		set({ current: { ...msg, id, duration } });
		timer = setTimeout(() => get().dismiss(id), duration);
		return id;
	},
	dismiss: (id, viaAction) => {
		const cur = get().current;
		if (!cur || (id !== undefined && cur.id !== id)) return;
		clearTimeout(timer);
		set({ current: null });
		if (!viaAction) cur.onTimeout?.();
	},
}));

/** Shorthand for use outside React components. */
export const snackbar = {
	show: (...args: Parameters<SnackbarState["show"]>) => useSnackbar.getState().show(...args),
	error: (message: string) => useSnackbar.getState().show({ message, variant: "error" }),
};
