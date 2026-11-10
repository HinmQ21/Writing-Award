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
- Phase 1 demo: localStorage, no authentication, no AI grading, no server date validation. Sample progress is explicitly labeled and can advance chapters independently from real writing.
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
