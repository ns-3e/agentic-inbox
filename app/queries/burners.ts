// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { Burner } from "~/types";
import { queryKeys } from "./keys";

export function useBurners(mailboxId: string | undefined) {
	return useQuery<Burner[]>({
		queryKey: mailboxId ? queryKeys.burners.list(mailboxId) : ["burners", "_disabled"],
		queryFn: () => api.listBurners(mailboxId!),
		enabled: !!mailboxId,
	});
}

export function useCreateBurner(mailboxId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (data: { label?: string; localPart?: string }) => api.createBurner(mailboxId!, data),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.burners.list(mailboxId!) }),
	});
}

/** Optimistic so the switch flips immediately. */
export function useUpdateBurner(mailboxId: string | undefined) {
	const qc = useQueryClient();
	const key = queryKeys.burners.list(mailboxId ?? "");
	return useMutation({
		mutationFn: ({ address, ...data }: { address: string; enabled?: boolean; label?: string }) =>
			api.updateBurner(mailboxId!, address, data),
		onMutate: async ({ address, ...data }) => {
			await qc.cancelQueries({ queryKey: key });
			const previous = qc.getQueryData<Burner[]>(key);
			qc.setQueryData<Burner[]>(key, (list) =>
				list?.map((b) => (b.address === address ? { ...b, ...data } : b)),
			);
			return { previous };
		},
		onError: (_e, _v, ctx) => {
			if (ctx?.previous) qc.setQueryData(key, ctx.previous);
		},
		onSettled: () => qc.invalidateQueries({ queryKey: key }),
	});
}

export function useDeleteBurner(mailboxId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (address: string) => api.deleteBurner(mailboxId!, address),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.burners.list(mailboxId!) }),
	});
}
