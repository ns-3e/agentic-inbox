// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { buildSearchParams } from "~/queries/search";
import api from "~/services/api";
import type { Email } from "~/types";

/** What a list shows: a folder or a search, in one mailbox or all of them. */
export type MailListSource =
	| { kind: "folder"; mailboxId?: string; folder: string }
	| { kind: "search"; mailboxId?: string; query: string };

export interface MailPage {
	emails: Email[];
	totalCount: number;
	failed?: string[];
	mailboxes?: string[];
}

async function fetchPage(src: MailListSource, page: number, limit: number, signal?: AbortSignal): Promise<MailPage> {
	if (src.kind === "folder") {
		const params = { folder: src.folder, page: String(page), limit: String(limit) };
		if (!src.mailboxId) return api.listUnifiedEmails(params, { signal });
		const data = await api.listEmails(src.mailboxId, { ...params, threaded: "true" }, { signal });
		return Array.isArray(data) ? { emails: data, totalCount: data.length } : { emails: data.emails ?? [], totalCount: data.totalCount ?? 0 };
	}
	const params = { ...buildSearchParams(src.query, page), limit: String(limit) };
	if (!src.mailboxId) return api.searchUnified(params, { signal });
	const data = (await api.searchEmails(src.mailboxId, params)) as MailPage | Email[];
	return Array.isArray(data) ? { emails: data, totalCount: data.length } : { emails: data.emails ?? [], totalCount: data.totalCount ?? 0 };
}

/** Query keys share prefixes with the older hooks so existing invalidations still reach them. */
function baseKey(src: MailListSource): unknown[] {
	if (src.kind === "folder") return src.mailboxId ? ["emails", src.mailboxId] : ["unified", "emails"];
	return src.mailboxId ? ["search", src.mailboxId, src.query] : ["unified", "search", src.query];
}

/**
 * Conversation list data.
 * - Desktop: one page at a time (Gmail's "1–50 of N ‹ ›").
 * - Phones: infinite scroll; `loadMore` appends the next page.
 */
export function useMailList(
	src: MailListSource,
	opts: { paged: boolean; page: number; pageSize: number; enabled?: boolean; refetchInterval?: number },
) {
	const enabled = (opts.enabled ?? true) && (src.kind === "folder" || !!src.query);

	const paged = useQuery<MailPage>({
		queryKey: [...baseKey(src), { ...(src.kind === "folder" ? { folder: src.folder } : {}), page: opts.page, limit: opts.pageSize }],
		queryFn: ({ signal }) => fetchPage(src, opts.page, opts.pageSize, signal),
		enabled: enabled && opts.paged,
		refetchInterval: opts.refetchInterval,
		placeholderData: keepPreviousData,
	});

	const infinite = useInfiniteQuery({
		queryKey: [...baseKey(src), { ...(src.kind === "folder" ? { folder: src.folder } : {}), infinite: true, limit: opts.pageSize }],
		queryFn: ({ pageParam, signal }) => fetchPage(src, pageParam, opts.pageSize, signal),
		initialPageParam: 1,
		getNextPageParam: (last, all) => {
			const loaded = all.reduce((n, p) => n + p.emails.length, 0);
			return last.emails.length === opts.pageSize && loaded < last.totalCount ? all.length + 1 : undefined;
		},
		enabled: enabled && !opts.paged,
		refetchInterval: opts.refetchInterval,
	});

	if (opts.paged) {
		return {
			emails: paged.data?.emails ?? [],
			totalCount: paged.data?.totalCount ?? 0,
			failed: paged.data?.failed ?? [],
			isPending: enabled && paged.isPending,
			isFetching: paged.isFetching,
			error: paged.error as Error | null,
			hasMore: false,
			loadMore: () => {},
			isLoadingMore: false,
			refetch: () => paged.refetch(),
		};
	}

	const pages = infinite.data?.pages ?? [];
	const seen = new Set<string>();
	const emails = pages
		.flatMap((p) => p.emails)
		.filter((e) => {
			const k = `${e.mailbox_id ?? ""}:${e.id}`;
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		});
	return {
		emails,
		totalCount: pages[0]?.totalCount ?? 0,
		failed: pages[0]?.failed ?? [],
		isPending: enabled && infinite.isPending,
		isFetching: infinite.isFetching && !infinite.isFetchingNextPage,
		error: infinite.error as Error | null,
		hasMore: !!infinite.hasNextPage,
		loadMore: () => {
			if (infinite.hasNextPage && !infinite.isFetchingNextPage) void infinite.fetchNextPage();
		},
		isLoadingMore: infinite.isFetchingNextPage,
		refetch: () => infinite.refetch(),
	};
}

export type MailListResult = ReturnType<typeof useMailList>;
