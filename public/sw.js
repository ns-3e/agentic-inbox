// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Minimal service worker so the app can be installed to the home screen.
// It deliberately caches nothing: every request goes straight to the network,
// so mail is never stale and Cloudflare Access sign-in keeps working.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
	// Pass-through: no respondWith(), the browser handles the request normally.
});
