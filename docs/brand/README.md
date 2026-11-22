# KTRDiff brand assets

The KTRDiff mark is the **KTR cycle**: four Spoon-style steps — `K`, `T`, `R` and `±` (the diff) —
read clockwise from the top and linked by four diagonal arrows that turn like the arrows of the
Pentaho job icon. Read in order it says "KTR, then diff".

The arrows and letters are drawn from scratch on a 64 × 64 grid; no Pentaho artwork is copied.
The official Pentaho icons used by the web app live in `apps/web/src/resources/pentaho/` under their
own Apache-2.0 license and are unrelated to these files.

## Files

| File | Use |
| --- | --- |
| `svg/ktrdiff-logo.svg` | Primary mark, transparent, for light backgrounds |
| `svg/ktrdiff-logo-on-dark.svg` | Same mark with white arrows, for dark backgrounds |
| `svg/ktrdiff-icon.svg` | App icon: the mark on a dark rounded tile |
| `svg/ktrdiff-logo-mono.svg` | One colour (ink), letters knocked out — print, stamps, embossing |
| `svg/ktrdiff-logo-mono-white.svg` | One colour (white), letters knocked out — on photos or brand colours |
| `svg/ktrdiff-flow.svg` | Horizontal lockup `K → T → R → ±` for README headers and banners |
| `svg/ktrdiff-flow-on-dark.svg` | Same lockup with white arrows |
| `png/` | Raster exports of the above at 256, 512 and 1024 px (flow at 1200 px wide) |
| `favicon/` | `favicon.svg` (transparent; the arrows turn white on a dark tab strip through `prefers-color-scheme`), `favicon.ico` (16/32/48, dark tile, for browsers without SVG icons), 16 and 32 px PNGs, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` |
| `social/ktrdiff-social-preview.png` | 1280 × 640 GitHub social preview |

## Colours

| Role | Hex |
| --- | --- |
| Added / `R` step | `#2DA44E` |
| Deleted / `±` step | `#E5484D` |
| Modified / `K` step | `#F5B400` |
| `T` step | `#2563EB` |
| Ink (arrows, dark backgrounds) | `#0F172A` |
| Letters | `#FFFFFF` |

Green, red and yellow are the diff colours and come first; blue is the supporting colour.

## Rules

- Keep the four steps in this order and the arrows turning clockwise: the order is the meaning.
- Do not recolour single steps, add effects, gradients or shadows, or rotate the mark.
- Clear space around the mark: at least one step width (20 units on the 64 grid, about 1/3 of the mark).
- Minimum sizes: the letters stay readable from 32 px; at 16 px (favicon) the mark reads as four
  coloured steps, which is intended. Use the app icon on a dark tile for favicons and small UI.
- Use `ktrdiff-logo-on-dark.svg` or `ktrdiff-icon.svg` on dark backgrounds, never the ink arrows.

## Using them

README header:

```markdown
<p align="center"><img src="docs/brand/svg/ktrdiff-logo.svg" width="96" alt="KTRDiff"></p>
```

Favicon tags for a static page (copy the files next to the page):

```html
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="icon" href="favicon.ico" sizes="16x16 32x32 48x48">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
```

The social preview is set by hand in the GitHub repository settings (Settings → General → Social preview).
