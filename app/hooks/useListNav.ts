// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { create } from "zustand";
import type { Email } from "~/types";

/**
 * The conversations currently shown in the list, so the reader can offer
 * Gmail's "Newer / Older" arrows and j/k without its own query.
 */
interface ListNavState {
	items: { email: Email; mailboxId: string }[];
	totalCount: number;
	/** 1-based index of the first item in `items` within the whole folder. */
	offset: number;
	setItems: (items: { email: Email; mailboxId: string }[], totalCount: number, offset: number) => void;
}

export const useListNav = create<ListNavState>((set) => ({
	items: [],
	totalCount: 0,
	offset: 1,
	setItems: (items, totalCount, offset) => set({ items, totalCount, offset }),
}));
