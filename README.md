# MTP-1302 AI

A parody "AI product launch" page for the **Casio MTP-1302**, a quartz dress watch, presented as a
frontier model for temporal inference: Multi-Tick Prediction, a three-year context window, 105 g of
open weights, state of the art on WristBench. It ends by admitting that it's a watch.

The format is an homage to [ORYZO](https://oryzo.ai) by Lusion, which launched a cork coaster the same
way. The look is deliberately its own: navy ink, bone white and a lume-green accent; a blueprint on a
concrete desk under window-blind shadows; a paper hang-tag; and minute-track tick rules.

**Live site:** https://relentlessyunn.github.io/casio/

## What's in it

- **Real-time 3D watch.** Built procedurally in three.js and modelled on the real MTP-1302:
  - a polished case and bezel, lugs with spring-bar holes, and a knurled crown;
  - a lacquered sunburst dial (anisotropic, clear-coated) with printed CASIO and WATER RESIST,
    faceted applied indices and a framed date window showing today's date;
  - bevelled hands with lume strips, and an engraved caseback;
  - a tapered three-link bracelet (domed polished centre row, brushed outer rows, pins, fitted end
    links) with a fold-over clasp.

  It is lit by a photographed studio HDRI (Poly Haven, CC0, in `docs/assets/hdri/`) and one
  shadow-casting light, with screen-space ambient occlusion (GTAO) on larger screens. Every part
  shadows the others and the desk. Polished steel carries fine hairline scratches; hands have recessed
  lume, indices have lacquered grooves, the case has a brushed mid-band, an inner minute flange and
  a crown gasket, and the clasp is engraved. The hands show your local time, and the seconds hand
  ticks like a quartz movement.
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
