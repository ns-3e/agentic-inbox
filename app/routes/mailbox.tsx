// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useRef } from "react";
import { useParams } from "react-router";
import MailShell from "~/components/MailShell";
import Sidebar from "~/components/Sidebar";
import { useUIStore } from "~/hooks/useUIStore";
import { useMailbox } from "~/queries/mailboxes";

export default function MailboxRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	// Prefetch mailbox data for child components
	useMailbox(mailboxId);
	const prev = useRef<string | undefined>(undefined);

	useEffect(() => {
		if (prev.current && mailboxId && prev.current !== mailboxId) {
			const s = useUIStore.getState();
			s.closePanel();
			s.closeCompose();
			s.closeSidebar();
			s.closeMobileAgent();
			s.clearChecked();
		}
		prev.current = mailboxId;
	}, [mailboxId]);

	return <MailShell basePath={`/mailbox/${mailboxId}`} sidebar={(collapsed) => <Sidebar collapsed={collapsed} />} />;
}
