# MTP-1302 — Time, solved.

A parody "AI product launch" page for the **Casio MTP-1302**, a quartz dress watch. It's an homage to
[ORYZO](https://oryzo.ai) by Lusion, which launched a cork coaster as if it were a frontier AI model.

The watch is presented as a frontier model for temporal inference: Multi-Tick Prediction, a 3-year context
window, 105 g of open weights, state of the art on TimeBench. The page ends by admitting that it's a watch.

## What's in it

- **Real-time 3D watch.** The model is built procedurally in three.js: lathe-turned case, lugs, crown,
  applied indices, a date window that shows today's date, a three-link bracelet, and a custom sunburst-dial
  shader. The hands show your actual local time and the seconds hand ticks like a quartz movement.
- **Scroll choreography.** The watch moves between poses as you scroll: hero, profile, face-on, an exploded
  "architecture" view with leader-line labels, a configurator, then the ending.
- **Drag to inspect** in the hero (mouse/pen), with spring-back inertia.
- **Choose your checkpoint.** Switches the dial between black, blue, green and silver-white. The page accent
  colour follows the dial.
- Live inference console, word-by-word statement reveal, benchmark chart (with tooltip and table view),
  model card, testimonials marquee and pricing tiers.
- Works without WebGL (falls back to an SVG clock), respects `prefers-reduced-motion`, and is responsive
  down to phone widths.

## Run it

It's a static site with no build step. Serve the folder with any static server:

```sh
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed URL. Opening `index.html` straight from disk won't work, because ES modules need HTTP.

## Files

| Path | What |
| --- | --- |
| `index.html` | Page markup and copy |
| `styles.css` | All styles |
| `js/main.js` | Scroll scenes, UI, chart, configurator, preloader |
| `js/watch.js` | The 3D watch: geometry, materials, dial shader, exploded view |
| `vendor/three.min.js` | Trimmed, minified three.js r186 bundle (MIT, see `vendor/three.LICENSE`) |

`vendor/three.min.js` only exports the classes `js/watch.js` uses, plus `RoomEnvironment` and
`RoundedBoxGeometry`. If you use a new three.js class, rebuild the bundle with esbuild from an entry file
that re-exports the names you need from `three`.

Add `?snap` to the URL to make the 3D state settle instantly (useful for screenshots on slow software
renderers).

## Disclaimer

A fan-made parody. Not affiliated with, sponsored or endorsed by CASIO Computer Co., Ltd. CASIO and MTP-1302
belong to their respective owners. Specs come from public product listings. The watch is real; the AI is not.
