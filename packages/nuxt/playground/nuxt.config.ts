// Playground configuration for testing @databuddy/nuxt locally.
//
// Architecture:
//   1. The inline <head> script below runs BEFORE any async external scripts,
//      so `Object.defineProperty` traps on `window.db` / `window.databuddy` are
//      guaranteed to be in place when the CDN tracker assigns those globals.
//   2. The Nuxt plugin at plugins/01.debug-interceptor.client.ts polls
//      `window.__dbDebug` (populated by the inline script) and syncs new
//      entries into reactive `useState` so the DebugPanel re-renders.
//   3. The DebugPanel component (components/DebugPanel.vue) reads that state
//      and displays events in a floating overlay — no backend required.

import { defineNuxtConfig } from "nuxt/config";

const DEBUG_SETUP_SCRIPT = `(function () {
  "use strict";

  var _db, _databuddy, _globals = {};
  var seen = new Map();

  // Shared store read by the Nuxt plugin
  window.__dbDebug = { events: [], globals: {} };

  // Dedup: ignore events with the same name + props within a 50ms window
  // (window.db and window.databuddy may both fire for the same call)
  function dedup(name, props) {
    var key;
    try { key = name + ":" + JSON.stringify(props); } catch { key = name; }
    var now = Date.now();
    if ((seen.get(key) || 0) > now - 50) return false;
    seen.set(key, now);
    return true;
  }

  // Wrap a tracker instance so its methods populate window.__dbDebug
  function wrap(tracker) {
    var origTrack = tracker.track.bind(tracker);
    tracker.track = function (name, props) {
      if (dedup(name, props || {})) {
        window.__dbDebug.events.unshift({
          name: name,
          properties: Object.assign({}, _globals, props || {}),
          time: new Date().toLocaleTimeString("en", { hour12: false }),
        });
      }
      return origTrack(name, props);
    };

    var origScreenView = tracker.screenView.bind(tracker);
    tracker.screenView = function (props) {
      if (dedup("screen_view", props || {})) {
        window.__dbDebug.events.unshift({
          name: "screen_view",
          properties: Object.assign({}, _globals, props || {}),
          time: new Date().toLocaleTimeString("en", { hour12: false }),
        });
      }
      return origScreenView(props);
    };

    var origSetGlobalProperties = tracker.setGlobalProperties.bind(tracker);
    tracker.setGlobalProperties = function (props) {
      Object.assign(_globals, props);
      window.__dbDebug.globals = Object.assign({}, _globals);
      return origSetGlobalProperties(props);
    };
  }

  // Install traps before the CDN script runs
  Object.defineProperty(window, "db", {
    configurable: true,
    get: function () { return _db; },
    set: function (t) { _db = t; if (t) wrap(t); },
  });
  Object.defineProperty(window, "databuddy", {
    configurable: true,
    get: function () { return _databuddy; },
    // Only wrap if this is a different object from window.db
    set: function (t) { _databuddy = t; if (t && t !== _db) wrap(t); },
  });
})();`;

export default defineNuxtConfig({
	modules: ["../src/module"],

	app: {
		head: {
			script: [{ innerHTML: DEBUG_SETUP_SCRIPT, type: "text/javascript" }],
		},
	},

	// Module options — uses a fake clientId so requests fail gracefully.
	// All events are still visible in the DebugPanel via the intercept above.
	databuddy: {
		clientId: "playground-test-id",
		debug: true,
		trackErrors: true,
		trackWebVitals: true,
		trackOutgoingLinks: true,
		trackInteractions: true,
		// clientId is inherited from the top-level value; no need to repeat it.
		flags: {},
	},

	devtools: { enabled: true },
});
