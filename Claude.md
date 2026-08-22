# Finance Calculator — Project Context

This file summarizes the design system, structure, and logic behind the Finance Calculator
site, so a fresh Claude session (e.g. in Cowork) has the same context without re-explaining
everything from scratch.

## File structure

```
/index.html    — markup only, links to the two files below
/styles.css    — all styling
/script.js     — all calculator + recommendation logic
```
All three files must stay in the same folder — `index.html` references the other two by
relative path (`href="styles.css"`, `src="script.js"`).

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
- **Light mode / dark mode toggle**, top of sidebar. Dark mode uses the original dark navy
  palette; light mode swaps to light backgrounds with dark text. A themed `--accent-text`
  CSS variable keeps light-blue accent text readable in both modes (light blue in dark mode,
  dark navy in light mode) instead of staying a fixed light blue that washes out on white.
- **Collapsible sidebar** on desktop (icon-only rail when collapsed).
- **Mobile (<860px):** sidebar is replaced entirely by a fixed bottom nav bar (not just
  resized) — the sidebar previously had `height:100vh` unconditionally, which broke mobile
  layout; this is now handled by hiding it and showing `.bottom-nav` instead.
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

## Known intentional decisions worth knowing before changing anything

- Number formatting uses standard 3-digit commas (`1,500,000`), not Indian lakh/crore
  grouping (`15,00,000`) — this was flagged as an open question, not yet changed.
- The AI formula's Safe Savings term is `max(0, S − 6E)`, floored at zero, matching the
  recommendation engine's `affordability_ratio` — someone with savings below their 6-month
  emergency-fund target has zero (not negative) available for the purchase.
