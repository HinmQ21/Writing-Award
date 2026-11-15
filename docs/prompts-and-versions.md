# Daily prompts and writing versions

Added 2026-11-15. The daily practice form requires a new question or a saved prompt. One prompt owns many immutable saved versions; writing and uploading use the same save path. The English interface and existing Capy visual system are preserved.

## Storage and migration

The existing `writing-award:v1` storage key is retained so installed data is found. Its payload is now `version: 2`, with `prompts: WritingPrompt[]`. A prompt records `id`, full `question`, Task 1/2 and creation date. Each linked essay records `promptId` and a positive `versionNumber`; its original ID, text, date, word count, reward and sample flag remain independent.

`parseProgress` accepts old version-1 backups, validates them and upgrades to version 2 with no invented prompt assignments. Older essays remain visible under **Older entries without a prompt** and can be linked through **Add a prompt**. Linking preserves their original content/date/reward and assigns the next available version number. Already linked entries are not silently reassigned. Version numbers are stable append order, not a renumbering of historical dates.

Version-2 validation rejects missing prompt references, task mismatches, duplicate IDs and duplicate version numbers. Unreadable progress follows the existing protected backup flow; it is not overwritten with a fresh demo. Older application tabs must be refreshed before saving against version-2 data.

## Daily saving and rewards

- New prompts retain their complete question/instructions and create a distinct record. Select **Saved prompt** to join another version to an existing question. Text equality alone never merges records: identical Task 1 captions can refer to different charts.
- Selecting a saved prompt fixes its Task type. Use a new prompt to change the task/question. Each save appends a version and preserves all earlier versions.
- The commit re-reads current browser progress before selecting the next version number and calculating daily reward eligibility.
- Existing minimum word counts, timezone, one reward per day, streaks, freezes and 63-piece cap remain unchanged. Saving another version on the same day adds no extra piece.
- **Save & continue grading** still saves locally and rewards first. It carries the exact saved version and its prompt to the scoring form. No Gemini request occurs until the user explicitly requests grading.

## Journal and AI handoff

The journal groups versions under their prompt, with question/content/version search and Task filters. The newest group opens first; the first three versions are visible, with older ones available through disclosure. Each version can be opened or scored independently. **Write another version** restores that prompt's unfinished draft or starts a blank one.

Scoring entry from a journal version, the journal picker, Home opt-in or the active practice draft fills the available question automatically. Older unlinked entries still need the question. Task 1/2 practice metadata does not infer Academic versus General Training or retain a chart image: learners must check the exam type and provide the required Academic Task 1 image in the scoring form. Grading/correction engines and their rubrics are unchanged.

## Drafts and backups

`writing-award:draft:v1` remains the active draft for compatibility with the scoring draft picker. `writing-award:prompt-drafts:v1` additionally retains a draft per saved prompt plus a new composition and pending saved-prompt choices. Switching saves the old draft before restoring the target. New-prompt Task changes preserve the active text. Drafts flush on navigation; explicit reset prevents an unmount from restoring discarded data.

A version is committed before its draft is cleared. Draft-cleanup failure reports that the version was saved and asks the learner to check the journal, rather than treating the save as failed. Corrupt draft banks are not overwritten during a switch. Data exports now include prompts, versions, progress and raw active/scoped draft snapshots. Storage remains local to the browser; this feature adds no account or server history.

## Verification

Unit coverage checks immutable versions, daily rewards, prompt reuse/task separation, migration, legacy linking, invalid relationships, per-prompt draft restoration and corrupt draft protection. Browser coverage checks required questions, multiple versions, upload/save, separate drafts, journal grouping/search, legacy linking and AI prefill without automatic calls. Existing appearance/upload/scoring/correction suites remain part of the regression run. Inspect Home and Journal in both themes at desktop/mobile and run reflow/accessibility checks before deployment.

Verification on 2026-11-15: **96 unit tests passed** and the TypeScript/Vite build passed. The 98-scenario browser run passed 96, intentionally skipped the desktop-only synthetic touch case, and exceeded the harness's 45-second budget in the broad desktop theme/accessibility matrix. That matrix received a targeted 90-second budget for its eight route/theme audits and software 3D rendering. The final **14-scenario prompt/theme rerun passed**, bringing unique verified scenarios to 97 plus the intentional skip. This rerun also covers final explicit-New/saved-ID semantics and copy refinements. An additional 12-state capture/accessibility run passed for saved-prompt search, selected prompt and legacy-link dialog in both themes at desktop/mobile. No per-error numerical band logic, AI provider configuration or backend grading/correction rules changed.

The independent interface review requested one fix: dark-theme prompt placeholders needed stronger contrast. Both question and search placeholders now use the existing muted-text token at full opacity (approximately 7.60:1 on the dark surface). The affected two browser scenarios, 12-state capture/accessibility checks and build were repeated after the fix; the reviewer confirmed it resolved and approved shipping. All 20 final Home, Journal, picker, selected-prompt and legacy-link captures preserve the existing design system.
