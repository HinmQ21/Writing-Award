# IELTS writing scoring

Entry-point extension (2026-11-13): a searchable, Task-filtered journal picker in the scoring form reuses original saved essays and clears mismatched old prompts. Journal rows expose a separate scoring action. Home offers an optional assessment checkbox, saves/rewards first and then transfers the original text to a complete scoring form; no AI request occurs until explicit scoring submission. Type/category choices use themed portal listboxes with explanatory option text, visible selection, keyboard navigation and viewport-aware placement, inheriting the existing palette.

Mode: Operate. Scope: `#scoring`, optional entry from practice draft and journal reading dialog. Established-world extension; preserve DESIGN.md and existing tokens. The user asked to design this interface independently. No new identity, concept seed, approved comp or raster is required.

## Direction contract

THESIS: Understand why an original IELTS essay receives an estimated band and what limits the next band, with evidence the learner can inspect.

OWN-WORLD: Inherit Writing Award's ivory paper, warm brown reading text, deep lavender actions, mint evidence highlight, Nunito/Nunito Sans, Lucide outlines, 12–16px corners and reused scholarly Capy artwork. Dark mode remaps semantic colors to the established warm plum system.

STORY: Choose Academic/General Task 1/2, add the complete original prompt and essay, attach the Academic Task 1 chart, submit, inspect the four criteria, select exact quoted evidence to highlight it in the original, then edit/reassess or export the JSON. A missing chart or inconsistent result must remain visibly incomplete; no aggregate band is invented.

FIRST VIEWPORT: Existing navigation and a concise heading lead to a writing-paper form on the left and a quiet Capy explanation on the right. Results replace that explanation, while the original essay occupies the left for comparison. Mobile stacks the editor first initially and results first after scoring, with five navigation destinations. Long essays remain readable without horizontal scrolling.

FORM: Code-led task workspace; seed: none (brief-pinned established-world extension). Explicit labels, native selects and textareas, live code word count, local draft recovery and optional upload. A single submit action makes the Gemini data transfer clear. Busy state reports elapsed waiting without inventing stage progress and provides cancellation; errors preserve the draft and move focus to an error summary. Results expose rubric/model provenance, keyboard-operable criterion tabs and evidence links. Partial/needs_input lead to “Bổ sung thông tin”; review_required leads to “Kiểm tra & chấm lại”, both restoring focus to the editable form. Estimated scores do not affect daily writing rewards.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. Review desktop/mobile and both themes, run reflow/a11y/interaction checks, preserve inherited DESIGN.md and token files, record reviewer disposition and scope in docs/scoring-verification.md.
