# Finance Calculator — Project Context

This file summarizes the design system, structure, and logic behind the Finance Calculator
site, so a fresh Claude session (e.g. in Cowork) has the same context without re-explaining
everything from scratch.

## File structure

```
/index.html         — landing page (hero + CTA into the calculator)
/calculators.html   — the calculator app (formula switcher + Affordability Index today;
                       future formulas join the same page/nav, per the design language below)
/login.html         — sign in / sign up (Firebase Auth, Google + email/password)
/profile.html       — "My details": saved S/E/I/D/M reused across calculators
/styles.css         — all styling, shared by every page
/script.js          — all calculator + recommendation + profile logic, shared by every page
/firebase-auth.js   — Firebase init, auth flows, and the shared applyAuthUI()
/room-scene.js      — Three.js diorama on the login page only
/ff-logo.svg        — favicon / brand mark
/og-image.png       — 1200x630 social share card (referenced by og:image on the two
                       indexable pages; regenerate if the brand or headline changes)
/robots.txt, /sitemap.xml, /CNAME, /.nojekyll  — SEO + GitHub Pages hosting
```
All files must stay in the same folder — every page references `styles.css`/`script.js`
by relative path. `script.js` is written to be safe to include on pages that don't have every
element it looks for (e.g. `index.html` has no calculator form), so it no-ops harmlessly
where markup is missing rather than erroring.

## Brand identity

- **Dark shade:** `#132135`
- **Light shade:** `#5cb6f9`
- **Font:** League Spartan, used throughout (headings, body, labels, formula, inputs — no
  secondary/mono font)
- **Logo mark:** a stylized "Ff" — bold dark-navy "F" with a light-blue offset shadow, paired
  with a lighter-blue "f"

## Design language

- **Flat design** — no raised/offset drop-shadows on cards or buttons (this was explicitly
  requested; earlier iterations had a "duplicate offset shadow" look that was rejected).
- Active/highlighted states (active nav item, the featured formula card) use a **solid accent
  fill** (`#5cb6f9` background with dark navy text), not just a border or shadow.
- **Light mode / dark mode toggle**, in the top nav on every page. Dark mode uses the original
  dark navy palette; light mode swaps to light backgrounds with dark text. A themed
  `--accent-text` CSS variable keeps light-blue accent text readable in both modes (light blue
  in dark mode, dark navy in light mode) instead of staying a fixed light blue that washes out
  on white. Theme choice persists via `localStorage` (see `applyThemeUI`/`toggleTheme` in
  `script.js`), restored via an inline pre-paint `<script>` in each page's `<head>` so there's
  no flash of the wrong theme on load.
- **Horizontal top nav** (`.topnav`), shared markup/CSS across both pages: brand mark left,
  site-level links (Home / Finance Calculator) center, theme toggle right. On
  `calculators.html`, a second horizontal bar below it (`.formula-bar`) switches between
  calculator formulas — this replaced an earlier collapsible left sidebar, dropped in favor of
  consistent horizontal nav across the whole site.
- **Mobile (<860px):** `.formula-bar` hides; a fixed bottom nav bar (`.bottom-nav`) takes over
  formula-switching + theme toggle instead. The top nav itself stays visible at all sizes.
- All theme-driven colors (backgrounds, borders, text) transition smoothly (~0.3s) when
  toggling light/dark, via a universal CSS transition rule.

## Calculator: Affordability Index

Formula:
```
AI = [max(0, S − 6E) + (I − E − D − M) × T] / P
```
Where `P` = purchase price, `S` = liquid savings, `E` = essential monthly expenses,
`I` = monthly take-home income, `D` = existing monthly debt payments, `M` = monthly
savings/investment target, `T` = purchase horizon in months. The `max(0, S − 6E)` term
("Safe Savings") is floored at zero — savings below the 6-month emergency-fund target
count as zero toward the purchase, not negative. This matches the recommendation engine's
own `affordability_ratio` below, so the two numbers no longer diverge.

Classification:
| AI range | Meaning |
|---|---|
| < 0 | Cannot afford |
| 0–1 | Not comfortably affordable |
| 1–2 | Barely / moderately affordable |
| 2–3 | Affordable |
| 3–5 | Comfortable |
| 5+ | Very comfortable |

`AI ≥ 2` is the working threshold for "financially affordable." The big AI number is colored
to match its badge (red/orange/yellow/green).

Inputs live-recalculate as you type (no need to click Calculate every time), once the first
Calculate click has happened. All inputs: no negative values, comma-formatted as you type,
required (red border + inline error message if empty on Calculate click).

## Recommendation engine

Only triggers when category is **"Barely / Moderately Affordable"** or **"Not Affordable"**.
No recommendation shown for Affordable / Comfortable / Very Comfortable.

Computes its own affordability check, using the same `max(0, S − 6E)` floor as the AI formula
above:
```
affordability_ratio = [max(0, S − 6E) + (I − E − D − M) × T] / P
```

Five health checks, in priority order:
1. Emergency fund: `liquid_savings / monthly_expenses < 6` months → unhealthy
2. Debt-to-income: `monthly_debt_payments / income > 30%` → unhealthy
3. Essential expenses: `monthly_expenses / income > 60%` → unhealthy
4. Savings rate: `monthly_savings / income < 20%` → unhealthy
5. Free cash flow: `(income − expenses − debt − savings) / income < 20%` → unhealthy

The recommendation message matches the **first** unhealthy check in that priority order. If
all five pass but the purchase still isn't affordable (fallback case — usually means the
purchase price/horizon itself is the issue, not the person's financial habits): "Consider a
lower-cost option or delay the purchase."

The recommendation panel shows all 5 checks (a "Financial Health Snapshot"), not just the one
that triggered it, with pass/fail icons and current value vs. healthy benchmark.

**Tile color** (of the whole recommendation panel) is driven by the pass/fail count:
- All 5 pass → green
- More red (fail) than green (pass) → red
- At least 1 red, but not a majority → orange

## The 3D scenes

Both are compact corner-cut rooms on a floating plinth, seen from outside on a long lens:
`room-scene.js` (sign-in) is the games corner, `details-scene.js` (My details) is the
study. They share a visual language — brand palette, clay materials, `RoundedBoxGeometry`
bevels, `RoomEnvironment` image-based lighting, and a `GTAOPass` for corner occlusion —
and both need the `three/addons/` importmap in their page.

Two interior treatments were tried for My details and rejected: a close view of a desk
read as "a table" rather than a room, and a full-length room interior needed heavy fog for
depth, which in light mode repainted every surface near-white. **A diorama needs no fog** —
don't add it back.

The details room's one narrative object is the cupboard with a money tree on top — coins
for leaves, and stacks climbing beside it. It replaced a standalone floor plant, and the
desk's coin stack was removed when it arrived, so the money reads as one idea in one place
rather than scattered decoration. Keep that discipline when adding props: the room is 9x9
and reads as clutter quickly.

**Both split panels — sign-in and My details — are transparent**, canvas included, so the
page background runs unbroken across the split. Giving a panel its own colour puts a hard
seam down the middle and the page reads as two unrelated halves rather than one screen.

**Both cameras fit the model to the panel** rather than sitting at a fixed distance
(`fitDistance()` in `room-scene.js`, `frameCamera()` in `details-scene.js`). A fixed
distance crops the diorama on a narrow panel and leaves it floating small on a wide one.
Both orbit around the model's measured bounding-box centre — a hand-set target leaves the
model off-centre once the fit frames around it.

**Two objects in the details room are clickable**: the floor lamp toggles the site theme,
and the cupboard focuses the Liquid savings field and flashes it. Both are deliberately
*redundant* — the theme toggle is in the nav and the field is right there on the page — so
the panel can keep `aria-hidden="true"` without hiding any unique function, which matters
because it is also `display:none` below 860px. **Never make the canvas the only route to
something.** Thin objects need an invisible hit proxy (see `lampHit`); the lamp pole is
0.05 units across and is otherwise almost unclickable.

The idle drift must stay **bounded** (the sign-in scene oscillates between limits; the
details scene uses a clamped sine). Both rooms are open on only two sides, so a full orbit
swings the solid walls to the front and hides everything inside.

Three things that bite if you change them:

- **Size the canvas from a `ResizeObserver` on its host, never from a one-shot call.**
  Both modules run while the page is still `auth-pending`, so the panel measures 0x0 and
  the sizing call bails. Without the observer the canvas keeps its 300x150 HTML default
  and gets stretched across the panel — which reads as a badly blurred render, not as a
  sizing bug. `room-scene.js` had this right; `details-scene.js` was written without it
  and shipped blurred until someone looked at the drawing buffer.

- **Lighting is set in two places.** `applyTheme()` writes `ambient`/`hemi` intensities on
  every theme change, so editing the values at light-creation time alone does nothing —
  `applyTheme` silently overwrites them. Change both.
- **`details-scene.js` solves its camera distance from the model's own bounding-box
  corners** (`frameCamera()` / `distanceFor()`), fitting whichever of width or height is
  tighter and checking the worst case across the drift's full range. Fitting by width
  alone works on a portrait panel and then lets the diorama overflow on a wide screen,
  where it runs over the hint text; a bounding *sphere* fits everywhere but leaves a wide
  flat room looking shrunken. `SPIN_LIMIT` is shared by the fit and the drift so the two
  can't disagree.

A full-bleed immersive backdrop was built for My details and rejected — it competed with
the form. The page uses the same 50/50 split as sign-in.

## Legal pages & account deletion

`privacy.html`, `terms.html` and `disclaimer.html` are indexable trust pages, linked from
the footer on every page. They are **drafts written against the code, not reviewed by a
lawyer**, and they carry a `[CONTACT EMAIL]` placeholder that must be filled before launch.

The privacy policy makes specific factual claims about what is stored — the `history`,
`profiles` and `feedback` collections, their exact fields, the three `localStorage` keys,
and GA4. **If you change what the code collects, update the policy in the same commit**,
or it becomes untrue.

`deleteAccountAndData()` in `script.js` implements the erasure right the policy promises.
Firestore has no cascading delete, so it clears `history` and `profiles/{uid}` explicitly
and deletes the auth user **last** — deleting the credential first would orphan the
documents beyond reach. It handles `auth/requires-recent-login`, which Firebase raises when
the session is not fresh. Feedback documents are deliberately not deleted (they can be
anonymous, and outlive accounts); the policy says so and offers removal by email.

## SEO & hosting

Deploys to GitHub Pages at the custom domain `financefundamentals.app` (`CNAME` in the repo
root). `index.html` and `calculators.html` are the only indexable pages; `login.html` and
`profile.html` carry `robots: noindex,follow` — deliberately *not* a `robots.txt` Disallow,
since a Disallow would stop Google fetching them and therefore ever seeing the noindex.

Structured data is JSON-LD at the end of `<head>`: Organization + WebSite + FAQPage on
`index.html`, WebApplication + BreadcrumbList on `calculators.html`. The FAQPage answer text
must stay **verbatim identical** to the visible `<details>` copy, or the markup is
non-compliant — if you edit an FAQ, edit both.

**The calculator is deliberately open to anonymous visitors.** It has no auth gate: signing
in only adds saved history and My details. This is what makes the page indexable at all —
Googlebot is never signed in, so gating it would leave the page's entire crawlable content
as the words "Sign In Required". Do not reintroduce `#authGate`/`#gatedContent` or the
`auth-pending` class to `calculators.html`. `applyAuthUI()` null-guards every gate reference,
so a page without that markup needs no special-casing. `profile.html` keeps its gate.

Analytics is GA4 via the standard `gtag.js` snippet in each page's `<head>`, using the same
`G-31JDZRNZZJ` measurement ID that already sits in the Firebase config. It is duplicated
across all four heads (as the rest of the head already is) — change it in all four or none.
Note the site has no privacy policy yet; one is needed before this collects traffic at scale,
since the site also stores emails, Google profile data, and financial figures.

## Known intentional decisions worth knowing before changing anything

- **`?v=NN` is a deploy mechanism, not a dev one — do not bump it to see your own edits.**
  Bump it once per release, in **every** HTML file at once, so returning visitors don't get
  a stale stylesheet. Half-doing it produces genuinely confusing bugs where the served file
  and the executing code disagree.

  Locally you never need to touch it: `.claude/devserver.py` (wired into
  `.claude/launch.json`) serves with `Cache-Control: no-store` and strips
  `If-Modified-Since`, so a plain reload always shows the current file. The stock
  `python3 -m http.server` does **not** — it answers 304 Not Modified and the browser keeps
  the old copy, which is how `styles.css` drifted 21 versions in a single session and how
  a stale `script.js` once had a whole debugging session chasing code the browser wasn't
  running.

  If you ever do need to renumber, only ever go **up**. Lowering a version means a browser
  holding the higher one keeps serving it.

- Number formatting uses standard 3-digit commas (`1,500,000`), not Indian lakh/crore
  grouping (`15,00,000`) — this was flagged as an open question, not yet changed.
- The AI formula's Safe Savings term is `max(0, S − 6E)`, floored at zero, matching the
  recommendation engine's `affordability_ratio` — someone with savings below their 6-month
  emergency-fund target has zero (not negative) available for the purchase.
