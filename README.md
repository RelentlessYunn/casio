# MTP-1302 AI

A parody "AI product launch" page for the **Casio MTP-1302**, a quartz dress watch, presented as a
frontier model for temporal inference: Multi-Tick Prediction, a three-year context window, 105 g of
open weights, state of the art on WristBench. It ends by admitting that it's a watch.

The format is an homage to [ORYZO](https://oryzo.ai) by Lusion, which launched a cork coaster the same
way. The look is deliberately its own: navy ink, bone white and a lume-green accent; a blueprint on a
concrete desk under window-blind shadows; a paper hang-tag; and minute-track tick rules.

**Live site:** https://relentlessyunn.github.io/casio/

## What's in it

- **Real-time 3D watch.** Built procedurally in three.js: case, lugs, crown, applied indices, a date
  window showing today's date, a three-link bracelet and a sunburst-dial shader. The hands show your
  local time, and the seconds hand ticks like a quartz movement.
- **The intro.** The watch lies on the blueprint and casts a real shadow. As you scroll, the desk dims,
  the watch lifts off, closes its bracelet and spins while the statement types in.
- **The giant wordmark** shrinks and docks into the header as you scroll.
- **3D in the layout.** The watch docks into the Features frame and the Product card.
- **Exploded view.** A scroll-driven "architecture" breakdown with leader-line labels.
- **The rest of the page.** A WristBench chart (with tooltips and a table view), a paper, an open-weights
  table, a model card, testimonials, and a dial picker that recolours the 3D dial.
- Works without WebGL (falls back to an SVG clock), respects `prefers-reduced-motion`, and is responsive
  down to phone widths.

## Deploying (GitHub Pages)

The site lives in `docs/` and has no build step. Pages is set to **Deploy from a branch → `/docs`**, so
every push to the branch republishes it. `docs/.nojekyll` makes GitHub serve the files as-is.

## Run it locally

```sh
npx serve docs
# or
python3 -m http.server 8000 --directory docs
```

Opening `docs/index.html` straight from disk won't work, because ES modules need HTTP.

## Files

| Path | What |
| --- | --- |
| `docs/index.html` | Page markup and copy |
| `docs/styles.css` | All styles |
| `docs/js/main.js` | Scroll choreography, intro timeline, chart, dial picker, preloader |
| `docs/js/watch.js` | The 3D watch: geometry, materials, dial shader, desk shadow, exploded view |
| `docs/js/desk.js` | Procedural concrete desk and blueprint drawn on a canvas |
| `docs/vendor/three.min.js` | Trimmed, minified three.js r186 bundle (MIT, see `docs/vendor/three.LICENSE`) |

`docs/vendor/three.min.js` only exports the classes `docs/js/watch.js` uses, plus `RoundedBoxGeometry`.
If you use a new three.js class, rebuild the bundle with esbuild from an entry file that re-exports the
names you need from `three`.

Add `?snap` to the URL to make the 3D state settle instantly (useful for screenshots on slow software
renderers).

## Disclaimer

A fan-made parody. Not affiliated with, sponsored or endorsed by CASIO Computer Co., Ltd. CASIO and
MTP-1302 belong to their respective owners. Specs come from public product listings. The watch is real;
the AI is not.
