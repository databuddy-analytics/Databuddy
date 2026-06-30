# Databuddy Swift SDK

Native Swift package for sending Databuddy analytics events from Apple apps.

```swift
import Databuddy

Databuddy.configure(clientId: "YOUR_CLIENT_ID")

Databuddy.track("app_launched", properties: [
    "surface": "menubar",
])

Databuddy.trackScreen("settings")

await Databuddy.trackAsync("extension_completed")
await Databuddy.flush()
```

The Swift SDK uses the public Databuddy client ID and sends events to `https://basket.databuddy.cc/track`. Do not put a Databuddy API key in a client app.

Events are queued and flushed automatically. Call `flush()` when an app extension or other short-lived process needs delivery before exit.

## Install

Until the first tagged Swift SDK release, add the package from the Databuddy repository's `main` branch:

```swift
.package(url: "https://github.com/databuddy-analytics/databuddy.git", branch: "main")
```

Then add `Databuddy` to your app target dependencies.

## Privacy

Track product events and milestones, not sensitive content. Avoid PII, secrets, tokens, raw search queries, full error stacks, and large payloads.
