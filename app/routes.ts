// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	index,
	type RouteConfig,
	route,
} from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("all", "routes/unified.tsx", [
		index("routes/unified-index.tsx"),
		route("search", "routes/unified-search.tsx"),
		route("burners", "routes/unified-burners.tsx"),
		route("preferences", "routes/preferences.tsx", { id: "unified-preferences" }),
		route(":folder", "routes/unified-list.tsx"),
	]),
	route("mailbox/:mailboxId", "routes/mailbox.tsx", [
		index("routes/mailbox-index.tsx"),
		route("emails/:folder", "routes/email-list.tsx"),
		route("settings", "routes/settings.tsx"),
		route("preferences", "routes/preferences.tsx", { id: "mailbox-preferences" }),
		route("burners", "routes/burners.tsx"),
		route("search", "routes/search-results.tsx"),
	]),
	route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
