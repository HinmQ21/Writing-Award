# Verification — IELTS Writing scoring

## Exact evidence regression (2026-11-13)

The supplied university-versus-work essay reproduced `review_required` with no score. The examiner shortened quotes with `...` and capitalized an in-sentence `the`; the audit then incorrectly changed the essay's `believed` to `believe`. Strict validation correctly rejected those quotations, including after reassessment.

The Gemini boundary now constrains evidence selection to IDs of original sentence excerpts, then resolves those IDs into the unchanged public `evidence_quotes` format before the existing validator. No fuzzy matching, essay correction, score adjustment or relaxed evidence check is used. Unknown IDs are rejected; focused reassessment uses the same mechanism, while analyzer/audit responses retain their existing format. Prompt version: `ielts_scoring_v1.2.1_source_evidence`.

`npm test`: **71 passed**, including a regression with the supplied essay, invalid reference rejection, all task types, focused reassessment, Unicode and long excerpts. `npm run build`: passed. Scoring Playwright suite: **24 passed** across desktop/mobile, including evidence highlighting, provider errors and review-required recovery. A live local pipeline with the configured Flash-Lite model returned `scored`, estimated overall **7.0**, four criterion bands, and only exact original quotes in two model calls. This single smoke result does not establish grading calibration or score stability. An earlier live attempt also encountered an external HTTP 503.

## Journal/Home entry and choice-menu extension (2026-11-13)

Build and all 53 unit tests passed. All 22 scoring E2E scenarios passed across desktop/mobile runs (20 on first run, corrected the journal fixture's false assumption that demo contains Task 1 essays, then reran both picker cases successfully). An additional 12-case focused regression run passed: saved drafts/daily rewards, journal reading/search, every original route at 320/390/768/1024/1440, journal picker search/filter/direct actions, Home save-to-scoring opt-in and custom menu keyboard/a11y. Two further journal draft-retention checks passed after separating saved-source IDs from stale parent prefill state. Tests use mock grading endpoints and assert no grading POST while opting in/saving or while the required prompt is missing.

New menu captures cover light/dark desktop/mobile, expanded journal picker and Home opt-in. Chromium mobile fullpage stitching initially produced a floating offscreen skip-link and duplicated content; replaced those QA artifacts with focused native viewport captures from `capture-entry.mjs` under `.impeccable/review/`. No page elements were hidden for the replacement captures. Working UI follows the existing DESIGN.md/token files; no new raster asset. Entry flow and menu strategy are recorded in `.impeccable/surfaces/scoring.md` and the implementation guide.

Independent finish review of all eight replacement captures returned **ship**, with no material fixes for this scoped extension. It confirmed the themed dropdowns, searchable journal picker, explicit Home grading intent and responsive composition against the inherited system.

## Implemented scope

Engine and API follow `IELTS_Writing_Scoring_Module_v1_1.md`, with the user's explicit addition of an environment-configured Flash-Lite fallback for an overloaded examiner. The frontend is an extension of the established Writing Award interface using `impeccable` and `ui-ux-pro-max`; no replacement identity or new raster asset was introduced.

## Automated checks

- `npm test`: **53 tests passed**, including deterministic band rounding, strict schemas, exact evidence, task-specific categories, General Task 1 letters, missing Task 1 image, bounded focused reassessment, provider/key boundaries, benchmark math and examiner overload fallback.
- `npm run build`: TypeScript and Vite production build passed. Existing Three.js vendor chunk remains over Vite's advisory 500 kB threshold; scoring is lazy-loaded into a separate bundle.
- Playwright: **63 unique tests passed across desktop/mobile runs**, one desktop-only touch scenario intentionally skipped. This comprises 16 scoring scenarios, 16 appearance scenarios, 8 upload scenarios and 23 practice/app scenarios. New scoring scenarios cover input validation, draft retention, original payload, evidence highlighting, keyboard tabs, export, missing chart, errors, waiting/cancel, review-required recovery/focus, uploads and journal entry.
- Reflow checked at 320, 390, 768, 1024 and 1440 CSS pixels; axe WCAG 2.2 AA checks passed for scoring input/results in light/dark. Appearance audits now wait for finite transitions to settle before reading contrast; the initial Word-import assertion waits within the worker's existing 15-second deadline.
- One regression runner failed during teardown because a concurrent Playwright invocation cleared its shared trace directory; rerunning the affected mobile drag/drop test alone passed. This was a runner artifact, not an application error. Checks were run in groups, not claimed as a single uninterrupted all-tests run.
- Netlify function bundled with esbuild and its imported handler returned HTTP 200 for a health request with no configured key. Deployment was not performed.
- Secret check: the actual `.env` API key was absent from every built client file; `.env` remains untracked/ignored. `.env.example` contains only placeholders/model IDs.

## Visual review

Captures are under `.impeccable/review/` (ignored runtime artifacts):

- `scoring-input-desktop.png`, `scoring-input-mobile.png`.
- `scoring-result-light-desktop.png`, `scoring-result-dark-desktop.png`.
- `scoring-result-light-mobile.png`, `scoring-result-dark-mobile.png`.
- `scoring-review-required-desktop.png`, `scoring-review-required-mobile.png`.

These renders use mock assessment fixtures to inspect the UI, not to demonstrate band accuracy. Mobile captures use Chromium with an iPhone emulation profile, not physical Safari/iPhone hardware.

The independent Impeccable finish reviewer returned `fix`, then `ship` after scoring all five listed fixes **resolved**: accurate Gemini-transfer footer, persisted product context, scoring direction contract, status-specific reassessment recovery/focus, and learner-readable validation feedback. The verdict pass covers those five fixes; it is not a claim of a new unrestricted whole-surface audit. Existing `DESIGN.md` and `.impeccable/design.json` were preserved. The scoring strategy is recorded in `.impeccable/surfaces/scoring.md`.

## Live Gemini check and limits

The configured key successfully listed both requested model IDs, and small standalone Flash-Lite generation requests returned HTTP 200. Gemini 3.8 Flash returned HTTP 503 high-demand even for a minimal request. Full pipeline smoke attempts also encountered intermittent HTTP 503, including at the Flash-Lite analyzer, so **a successful live full-pipeline grading result has not been verified**. No result/band has been fabricated to replace the failed calls.

The local environment now keeps Gemini 3.8 Flash as primary and configures Gemini 3.5 Flash-Lite as the examiner fallback on HTTP 429/503. Unit tests verify fallback attempt bounds, actual model provenance, subsequent focused reassessment and the case where both models fail. If the analyzer itself is overloaded, the request reports a recoverable provider error and retains the draft.

No teacher/examiner reference dataset was supplied. Actual grading MAE, half-band agreement and repeat stability are unmeasured; `npm run benchmark:scoring -- dataset.json` provides the calculation once real reference scores and saved repeated results are available. No official-score or examiner-equivalence claim is made.
