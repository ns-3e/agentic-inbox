// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useIsDesktop } from "~/hooks/useMediaQuery";
import { useUIStore } from "~/hooks/useUIStore";

/**
 * Keeps the open conversation (and, on phones, the full-screen composer) in
 * the URL so the browser / Android Back button closes them like Gmail does,
 * and so a reload or shared link opens the same email.
 *
 *   ?open=<emailId>&mb=<mailboxId>   open conversation
 *   #compose                          phone composer is open
 *
 * The UI store stays the source of truth for components; this component
 * mirrors it to the URL and back.
 */
export default function UrlStateSync({ unified }: { unified?: boolean }) {
	const [searchParams] = useSearchParams();
	const location = useLocation();
	const navigate = useNavigate();
	const isDesktop = useIsDesktop();
	const selected = useUIStore((s) => s.selectedEmailId);
	const activeMailboxId = useUIStore((s) => (unified ? s.selectedMailboxId : null));
	const isComposing = useUIStore((s) => s.isComposing);

	const urlOpen = searchParams.get("open");
	const urlMb = searchParams.get("mb");

	const prevUrl = useRef<string | null | undefined>(undefined);
	const prevSel = useRef<string | null | undefined>(undefined);

	// ── Open conversation ↔ ?open= ──
	useEffect(() => {
		const urlChanged = prevUrl.current !== urlOpen;
		const selChanged = prevSel.current !== selected;
		const firstRun = prevUrl.current === undefined;
		prevUrl.current = urlOpen;
		prevSel.current = selected;

		if (selected === urlOpen) return;

		if (urlChanged || firstRun) {
			// Back/forward, a link, or first load: the URL wins.
			useUIStore.getState().selectEmail(urlOpen, urlMb);
			prevSel.current = urlOpen;
			return;
		}

		if (selChanged) {
			const next = new URLSearchParams(searchParams);
			if (selected) {
				next.set("open", selected);
				if (activeMailboxId) next.set("mb", activeMailboxId);
				else next.delete("mb");
				// Opening from the list adds a history entry; moving between
				// conversations (newer/older, j/k) replaces it.
				navigate(
					{ search: `?${next}`, hash: location.hash },
					{ replace: !!urlOpen, state: { opened: true } },
				);
			} else if ((location.state as { opened?: boolean } | null)?.opened) {
				navigate(-1);
			} else {
				next.delete("open");
				next.delete("mb");
				const qs = next.toString();
				navigate({ search: qs ? `?${qs}` : "", hash: location.hash }, { replace: true });
			}
			prevUrl.current = selected;
		}
	}, [urlOpen, urlMb, selected, activeMailboxId, searchParams, location.hash, location.state, navigate]);

	// ── Phone composer ↔ #compose ──
	const prevComposing = useRef(isComposing);
	const prevHash = useRef(location.hash);
	useEffect(() => {
		const hasHash = location.hash === "#compose";
		const hadHash = prevHash.current === "#compose";
		const opened = isComposing && !prevComposing.current;
		const closed = !isComposing && prevComposing.current;
		prevComposing.current = isComposing;
		prevHash.current = location.hash;

		if (opened && !isDesktop && !hasHash) {
			navigate({ search: location.search, hash: "compose" }, { state: location.state });
		} else if (closed && hasHash) {
			navigate(-1);
		} else if (hadHash && !hasHash && isComposing && !isDesktop) {
			// Back button: close the composer (it saves a draft on close).
			useUIStore.getState().closeCompose();
			prevComposing.current = false;
		}
	}, [isComposing, isDesktop, location.hash, location.search, location.state, navigate]);

	return null;
}
