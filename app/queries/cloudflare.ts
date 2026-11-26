// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import { queryKeys } from "./keys";

/** Each read is several Cloudflare API calls: keep results for a while. */
const STALE = 5 * 60_000;

/** Zones in the Cloudflare account. `enabled` is false without CF_API_TOKEN. */
export function useZones() {
	return useQuery({ queryKey: queryKeys.cloudflare.zones, queryFn: () => api.listZones(), staleTime: STALE, retry: false });
}

export function useDomainSetup(domain: string | undefined, opts: { enabled?: boolean } = {}) {
	return useQuery({
		queryKey: queryKeys.cloudflare.domain(domain ?? ""),
		queryFn: () => api.getDomainSetup(domain!),
		enabled: !!domain && opts.enabled !== false,
		staleTime: STALE,
		refetchOnWindowFocus: false,
		retry: false,
	});
}

/** Setup of many domains at once (the directory). */
export function useDomainSetups(domains: string[], enabled: boolean) {
	return useQueries({
		queries: domains.map((domain) => ({
			queryKey: queryKeys.cloudflare.domain(domain),
			queryFn: () => api.getDomainSetup(domain),
			enabled,
			staleTime: STALE,
			refetchOnWindowFocus: false,
			retry: false,
		})),
	});
}

export function useApplyDomainSetup() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ domain, ...opts }: { domain: string; address?: string; catchAll?: boolean }) => api.applyDomainSetup(domain, opts),
		onSuccess: (data, { domain }) => qc.setQueryData(queryKeys.cloudflare.domain(domain), data.setup),
	});
}
