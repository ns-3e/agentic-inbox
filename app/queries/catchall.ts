// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import { queryKeys } from "./keys";

export function useCatchAll() {
	return useQuery({ queryKey: queryKeys.catchAll, queryFn: () => api.listCatchAll() });
}

export function useSetCatchAll() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ domain, mailboxId }: { domain: string; mailboxId: string | null }) => api.setCatchAll(domain, mailboxId),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.catchAll }),
	});
}
