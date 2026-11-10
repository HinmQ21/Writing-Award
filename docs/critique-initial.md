Method: isolated Assessment A design review (`/root/impeccable_critique`); detector and audit evidence intentionally excluded.

# Writing Award — initial design critique

Target: `src/App.tsx`, `src/styles.css`, and `src/Scene.tsx`; dashboard, collection, journal, settings. The supplied design v2 document and concept image govern this assessment. This is the Phase 1 demo, so production GLB artwork and visual parity with the aspirational concept are not acceptance requirements.

Evidence: visually inspected rendered captures at 1440, 768, 390, and 320 pixels, the three secondary-screen captures, the supplied concept PNG, and implementation source. Browser inventory supplied to this review was empty; no interactive browser verification was performed. Behavioral comments below describe source-supported design intent, not completed interaction tests. No audit reports, detector output, or test results were read.

## Design specificity verdict

The interface feels authored for Writing Award. The cottage is the visual subject, the writing panel turns practice into construction, and the segmented 21-piece progression gives the metaphor a concrete duration. Warm ivory, lavender selection, mint achievements, rounded type, and restrained Vietnamese encouragement carry consistently into the journal and settings. The desktop composition follows the brief rather than a generic analytics dashboard.

The biggest remaining gap is the strength of the ritual. At phone widths, the welcoming scene arrives well before any writing action becomes discoverable. The model is recognizably a pastel toy cottage, but excessive brightness weakens the material and color separation that would make it feel precious. The reward dialog's generic house icon also misses the chance to show the particular object earned. Improve those existing ideas; do not replace this with more cards, more metrics, or a darker productivity interface.

## Design health score

All ten Nielsen heuristics apply to this Operate surface. Scores are provisional where only source, rather than an observed interaction, supports the behavior.

| # | Heuristic | Score / 4 | Key evidence or issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Piece count, word count, task selection, draft status, and reward status are explicit; several are physically too small to scan comfortably. |
| 2 | Match between system and real world | 4 | Natural Vietnamese, concrete building pieces, and familiar essay task terminology connect effort with a visible home. |
| 3 | User control and freedom | 3 | Source provides dialog exits, cancellation, export, camera reset, and preserved drafts; personal practice begins through a reset-oriented settings flow. |
| 4 | Consistency and standards | 3 | Palette, typography, navigation states, and control treatments are coherent. Tablet navigation drops text labels and hides the sidebar's lower destinations. |
| 5 | Error prevention | 3 | Task thresholds and file constraints are explained; reset requires confirmation. Sample progress and real submissions remain easy to conflate. |
| 6 | Recognition rather than recall | 2 | Desktop primary action is clear; mobile users must discover the writing panel below the scene and statistics. |
| 7 | Flexibility and efficiency | 2 | Paste/upload, journal search/filter, and direct model controls provide useful alternatives; mobile lacks a direct route to today's writing section. |
| 8 | Aesthetic and minimalist design | 3 | Calm hierarchy and a purposeful subject; miniature text and washed-out rendering reduce finish quality. |
| 9 | Error recognition and recovery | 3 | Source gives specific word deficits, upload guidance, retained draft text, and draft download on errors. These states were not captured interactively. |
| 10 | Help and documentation | 3 | Contextual reward help and a concise rules dialog exist; the mobile first viewport offers little guidance toward the primary task. |
| **Total** | | **29 / 40** | **Good foundation; resolve discovery and reading comfort before release.** |

## Overall impression

The desktop screen is warm, coherent, and immediately understandable. The scene and form deserve their shared prominence. Mobile preserves the requested scene-first order, but treats that order too literally: the initial experience resembles a model viewer rather than a writing ritual. The strongest next step is a visible invitation to write, followed by larger supporting text and a more tangible reward.

## What is working

1. **The scene and the action explain each other.** The desktop's wide cottage, adjacent essay form, and 12/21 track make the core proposition legible without onboarding. The 21 discrete marks express construction more usefully than an abstract ring or percentage.
2. **Encouragement avoids performance anxiety.** “Không cần hoàn hảo,” the absence of an IELTS score, and the journal's preserved entries support the stated audience and product purpose. The mint, peach, and lavender surfaces feel gentle rather than competitive.
3. **Secondary screens retain the same world.** The collection makes the unlocking sequence visible, the journal prioritizes saved essays, and settings clearly states browser-only storage and backup. The Phase 1 scene is a real, recognizable toy diorama with an identifiable capybara and cottage; it is a valid implementation of the demo brief.

## Priority issues

### [P1] Today's writing action disappears below the mobile first viewport

**Evidence:** In the 390-pixel capture, the writing panel begins around page y=960; at 320 pixels it begins around y=930. The header, introduction, full scene, progress, and three statistics all precede it. The bottom navigation has no writing action. In the initial visible viewport, users can rotate a house and change destinations but cannot see how to begin writing.

**Why it matters:** Daily use depends on beginning a small task with little effort. A new learner can infer that this is a collection viewer; a returning learner must scroll through the same decorative prelude every day.

**Fix:** Keep the mandated scene-first content order. Add a prominent mobile “Viết hôm nay” anchor or button in the first viewport that scrolls to and focuses the form heading/editor. A small persistent action above the bottom navigation can work while the form is offscreen; hide it when the form enters view. Recheck bottom-navigation clearance and the keyboard-open state. Do not remove the scene to solve this.

**Suggested command:** `$impeccable adapt` / `$impeccable clarify`.

### [P1] Essential supporting text is rendered as miniature metadata

**Evidence:** `src/styles.css` sets the desktop editor to 13px, editor footer to 9px, task labels to 12px, task minima to 10px, writing rule to 10px, scene hint to 9px, and stat descriptions to 9px. Tablet overrides make some stat copy 8px. Small-phone overrides repeat 8–10px text. In the renders, the central headings are clear while thresholds, draft status, remaining days, and explanatory copy require much closer attention.

**Why it matters:** These labels tell learners whether their work will count and whether it has been kept. They are task-critical information, especially with Vietnamese diacritics, and should not read like legal fine print. This is a size and reading-comfort finding; no measured contrast failure is claimed.

**Fix:** Use 16px for editing and ordinary reading, 14px for task labels and meaningful supporting copy, and reserve 12px for genuinely optional metadata. Raise word count/draft status and threshold descriptions together. Allow the panels to grow rather than shrinking type at tablet widths; stack the layout earlier if required. Reduce or remove repeated encouragement before compressing operational text.

**Suggested command:** `$impeccable typeset` / `$impeccable adapt`.

### [P2] The transition from demonstration to personal practice is too indirect

**Evidence:** A small “Dữ liệu demo” badge is the dashboard's main explanation of the initial 12 pieces and 12 saved essays. The explicit personal-start action lives in settings and uses “Bắt đầu mới.” The normal writing form is active within demo state, and the settings description says it removes sample data even though the confirmation correctly says all current essays, drafts, and progress will be deleted.

**Why it matters:** A first-time learner can reasonably begin writing into the sample journey, then later discover that beginning their own journey is framed as clearing that journey. The detailed confirmation is a useful safeguard, but it comes after an expectation has already been formed.

**Fix:** Place a brief contextual note near the dashboard progress: “Bạn đang xem 12 ngày mẫu,” with a clear “Bắt đầu hành trình của mình” path. Make the settings summary match the actual deletion scope when personal essays or drafts exist. Preserve the explicit export and confirmation choices. Keep the sample chapter-advance action visibly secondary and label it as sample exploration.

**Suggested command:** `$impeccable onboard` / `$impeccable clarify`.

### [P2] Strong lighting flattens the scene's pastel materials

**Evidence:** The roof, cream walls, foliage, flowers, and platform approach a similar pale value in the screenshots; the figure and roof tiles lose definition at phone and collection-thumbnail sizes. The source combines exposure 1.35 with strong hemisphere and directional illumination (`src/Scene.tsx:160–172`).

**Why it matters:** The miniature is the product's permanent reward. It should feel warm and tangible even at a small size. The supplied concept earns that feeling through clear roof/wall/plant color separation and soft contact depth; the current scene has the right objects but weaker visual richness.

**Fix:** Tune exposure and key/fill balance using the same camera and 12-piece state. Retain the pastel palette while restoring peach roof saturation, brown trim, leafy greens, and capy facial contrast. Preserve soft contact shadows and a quiet ground. Judge the 390-pixel and collection-thumbnail renders together with desktop. Do not introduce a Phase 2 GLB dependency or claim mockup-level assets are required for Phase 1.

**Suggested command:** `$impeccable colorize` / `$impeccable polish`.

### [P2] The reward art does not represent the piece just earned

**Evidence:** Source at `src/App.tsx:147` displays the same large house icon for each ordinary rewarded submission; the actual piece is represented by its name below it. The supplied concept and brief center the earned roof or building object as the celebratory subject. No reward-state screenshot was available, so this finding is source-based.

**Why it matters:** The emotional peak should make an essay feel like a real addition to the world. A generic house icon confirms success but gives “Ống khói nhỏ” and “Vườn hoa” the same visual identity. The subsequent actual-position drop animation is a good foundation that the dialog should reinforce.

**Fix:** Show a small preview of the earned procedural piece, or a clearly product-specific thumbnail drawn from the same 3D scene. Keep the name, one reassuring sentence, and the existing “Về ngắm công trình” action. Retain the 850ms piece-drop behavior and reduced-motion fallback. If preview scope is too large for this pass, lead with the piece name and next construction location rather than enlarging an unrelated icon.

**Suggested command:** `$impeccable delight` / `$impeccable polish`.

No P0 task-blocking design issue is established by the supplied visual evidence. P3 refinements are listed below.

## Cognitive load

Desktop load is low to moderate: the essay task is intrinsically demanding, but task selection, input mode, content, threshold, and submit are placed in a sensible order. The two task choices and two input methods are manageable. The collection has three world choices and the mobile navigation has four destinations.

| Checklist | Assessment |
|---|---|
| Single focus | Pass on desktop; partial on mobile because model interaction precedes writing discovery. |
| Chunking | Pass: three statistics, three worlds, and two input methods form clear groups. |
| Grouping | Pass: task, input, validation, and save belong to one form. |
| Visual hierarchy | **Fail on mobile:** the primary task has no initial-screen entry. |
| One thing at a time | Pass: the writing form sequences small choices before submission. |
| Minimal choices | Pass for the main task; the five-button camera toolbar exceeds four visible actions but is reasonably divided into rotation, zoom, and reset. |
| Working memory | Pass: thresholds and word count remain beside the essay. |
| Progressive disclosure | **Fail in the demo journey:** chapter skipping is available while starting a personal journey is hidden in settings. |

Two clear checklist failures indicate **moderate extraneous load**, concentrated in mobile orientation and sample-data interpretation. There is no evidence of a general wall-of-options problem. Do not collapse useful writing controls simply to reduce the visible count.

## Emotional journey

- **Arrival:** Warm, accepting, and personal. The cottage and rounded headline produce the right first impression.
- **Orientation valley:** Phone users can admire the scene without knowing where the writing task is. Sample progress is also insufficiently explained near that scene.
- **Composition:** Supportive copy, a threshold counter, and source-supported draft saving lower anxiety. Tiny status text weakens this reassurance.
- **Validation:** Source uses specific missing-word counts and recovery suggestions while keeping the draft. That is the right tone; actual error and focus behavior still needs browser verification.
- **Peak:** A named reward and piece-drop animation fit the product. Generic dialog artwork leaves that peak less tangible than it could be.
- **End:** “Về ngắm công trình,” persistent entries, and permanent collection support pride and return visits. Keep the final moment focused on what grew today; avoid adding comparison scores or urgency.

## Persona red flags

**Jordan — first-time learner.** Jordan opens the 390-pixel home screen and sees 12 days of progress plus camera controls. The writing entry is below the initial viewport, the demonstration explanation is tiny, and “start my own journey” is in settings. Jordan can understand the aesthetic before understanding what to do. Add the visible writing entry and contextual sample-start path.

**Sam — learner who depends on readable text and explicit controls.** Sam can read the headings but must magnify 8–11px status and metadata. At 768 pixels the sidebar becomes three unlabeled icons and the lower help/settings group disappears; settings remains reachable through the avatar, but that route is less recognizable. Preserve labels or explicit accessible naming in compact navigation and enlarge operational copy. Focus and screen-reader behavior are not certified by this screenshot review.

**Casey — distracted mobile learner.** Casey wants to paste an essay one-handed and continue their day. A full scene, progress, and statistics stand between arrival and the form; the bottom navigation provides no writing shortcut. Casey also encounters narrow model-control buttons near the scene's bottom edge. Give the form a direct visible entry, use comfortable touch targets, and verify the anchored action and fixed navigation with the phone keyboard open. Source-supported draft persistence is a strong protection against interruptions.

No project-specific persona was added because no supplied `AGENTS.md` Design Context was found.

## Minor observations

- **[P2] Tablet navigation:** At 768 pixels, retain explicit recognition for home, collection, journal, help, and settings. Text may be visually compact, but an avatar should not be the only recognizable settings route.
- **[P2] Conditional freeze reassurance:** “Một ngày nghỉ cũng ổn” should account for zero available freezes. Use copy such as “Tích lũy lượt bảo vệ khi đủ 7 ngày” when none remain; otherwise the gentle promise can mislead.
- **[P3] Repeated encouragement:** Sidebar, form, below-grid note, and footer repeat the same emotional message. Keep the best instances and spend recovered space on readable status.
- **[P3] Scene toolbar hierarchy:** The five equal-weight camera buttons are understandable but visually compete on mobile. Keep reset quieter and preserve a clear separation between rotation and zoom.
- **[P3] Secondary-world piece names:** “Mảnh 1,” “Mảnh 2,” and so on lose the concrete charm of the cottage's named parts. Descriptive names would make later chapters feel equally authored.

## Questions to consider

1. What should a returning learner be able to do in their first five seconds on a phone?
2. Can a learner name the particular thing that grew today without opening the collection?
3. Does the first session make it obvious which effort belongs to the sample journey and which belongs to the learner?

Questions skipped as a user prompt: this isolated review feeds the parent implementation pass; these questions are design prompts, not a request to pause authorized work.
