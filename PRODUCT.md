# Writing Award

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
React + TypeScript + Vite, explicitly selected by the user. Three.js renders an interactive procedural toy diorama; no claim of Blender/GLB artwork.

## Users
IELTS learners who want a gentle daily writing ritual. The interface is Vietnamese; essays may be in English.

## Product Purpose
One essay. One little piece of happiness. Daily practice builds a permanent, visible world instead of a stressful score dashboard.

## Operating Context
Paste or upload text, choose Writing Task 1 or 2, submit, receive a building piece, revisit the scene, and review saved essays. Desktop has scene and writing side by side; mobile places the scene first.

## Capabilities and Constraints
- Appearance: light, dark and live system preference, requested by the user on 2026-11-10. Preference is local, independent of writing progress, and synchronized across tabs.
- Source of truth: docs/Writing_Award_UX_Design_v2.md and its supplied concept image.
- Three consecutive 21-piece worlds: Capy's Dream Cottage, Cây Thần Kỳ, Lego Capybara. Completed worlds remain in the collection.
- Task 1 requires 150 words; Task 2 requires 250. Only one piece per account calendar day. Extra essays are saved without extra rewards.
- Every 7 streak days awards a freeze, capped at 2. One missed day consumes one freeze without awarding a piece. A longer gap or no freeze resets the streak, removes one decorative star, and temporarily shows rain; progress and writing remain intact.
- Day 21 completes a world and unlocks the next immediately. The next valid submission builds the next world.
- Practice progress remains a localStorage demo: no authentication or server date validation. Sample progress is explicitly labeled and can advance chapters independently from real writing.
- IELTS scoring (authorized 2026-11-12): a separate optional `#scoring` workspace follows docs/IELTS_Writing_Scoring_Module_v1_1.md. Gemini Flash-Lite analyzes the original question; Gemini Flash assesses the original essay against pinned official Task 1/2 descriptors. The API key stays on the server. Scoring sends the question, essay and optional chart image to Gemini and returns estimated bands, explanations, exact evidence and next-band gaps; these are not official IELTS scores.
- User-authorized overload fallback (2026-11-12): `GEMINI_EXAMINER_FALLBACK_MODEL` can route an examiner HTTP 429/503 to Gemini 3.5 Flash-Lite once. The fallback performs the examiner role with the same rubric and validators; the actual examiner model is recorded. `GEMINI_EXAMINER_MODEL` can also select Flash-Lite directly. This explicit extension supersedes the original v1.1 restriction on Flash-Lite assigning bands when fallback/direct configuration selects it.
- Scoring supports all four Academic/General Task 1/2 types. Missing Academic Task 1 image yields incomplete Task Achievement and no aggregate band. Unverified or inconsistent output is labeled partial, needs_input or review_required. Original essays, daily reward eligibility and existing pieces are unaffected by scoring. No score threshold is used for rewards.
- Scoring entry points: the scoring workspace offers a searchable journal picker with Task filters; journal entries also have a separate scoring action. Home optionally continues to scoring after local saving/reward. The learner completes the original prompt, task/category and optional chart in the scoring workspace before explicitly submitting to Gemini. No grading API call is made by selecting an essay, opting in or saving it. Task/category menus use themed keyboard-accessible listboxes.
- Scoring draft text/question stay in the tab's sessionStorage; image and result are held in memory. Results can be downloaded as JSON; separate grading history/accounts remain outside scope. Server logs include scoring evidence and metadata; they do not include keys or image data. Human-reference benchmark data has not been supplied, so band accuracy is not yet calibrated.
- Upload accepts Word `.docx`, TXT and Markdown, up to 5 MB and 100,000 extracted characters. Word text is extracted locally in an on-demand worker, with editable preview, Unicode/paragraph preservation and error recovery that keeps the existing draft. Legacy `.doc` requires saving as `.docx`; PDF parsing remains deferred. No Word formatting, images or embedded HTML are rendered.
- Timezone: Asia/Ho_Chi_Minh, visibly disclosed in settings. Production authentication, database, anti-spam and server idempotency remain outside this demo.

## Brand Commitments
Use the source document's ivory, peach, lavender, mint and warm brown palette; rounded legible typography; a pastel toy/diorama cottage; friendly, unpressured Vietnamese copy. The source document wins over either skill's suggestions.

## Evidence on Hand
The documentation and concept image in docs are the supplied authority. No existing application, backend, customer claims, or production 3D assets exist.

## Product Principles
1. Reward showing up, not a grade.
2. Keep every earned piece and saved essay.
3. Make today's writing action obvious.
4. Label demonstration state and local storage limitations honestly.
5. Preserve drafts and provide recoverable validation.
