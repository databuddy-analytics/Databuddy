# Databuddy product video

This workspace renders a 16-second, 16:9 Databuddy Intelligence release video.
It is an energetic launch sting: bright signal bubbles, elastic product cards,
and a single short crop of the real Insights screen as product proof. It does
not make up a voiceover, customer metric, or product screen.

## Render

```sh
bun run --cwd apps/video studio
bun run --cwd apps/video video:render
```

The finished file is written to `apps/video/out/intelligence-platform.mp4`.

## Story

1. **Arrival** — meet Databuddy Intelligence with a bouncing signal / bunny
   motif.
2. **Movement** — traffic, funnels, errors, and goals enter as signal bubbles.
3. **Signal** — filter noise and find meaningful change.
4. **Insight** — show impact, evidence, and a known cause only when one exists.
5. **Investigation** — promote material work into a persistent case with its
   evidence and recheck history.
6. **Proof** — use a short circular crop of the genuine Insights dashboard.
7. **Promise + close** — land the product promise, the brand, and `databuddy.cc`.

## Source assets

All source visuals are copied from the existing Databuddy brand library into
`public/` to keep Remotion rendering self-contained. The dashboard capture is
an existing marketing asset; it is not a fabricated product screen.

`public/intelligence-launch.m4a` is an original, generated sound bed. It is
not stock music and does not carry a third-party sync license.
