# Writing Award — verified design decisions

Authority: `docs/Writing_Award_UX_Design_v2.md` → supplied concept image → `DESIGN.md`/implemented semantic tokens → skill recommendations. `PRODUCT.md` records scope; `.impeccable/surfaces/dashboard.md` records the route strategy.

## ui-ux-pro-max research

Commands used:

```sh
python .agents/skills/ui-ux-pro-max/scripts/search.py "education gamification cozy playful" --design-system -p "Writing Award"
python .agents/skills/ui-ux-pro-max/scripts/search.py "rounded friendly education" --domain typography -n 2
python .agents/skills/ui-ux-pro-max/scripts/search.py "claymorphism education" --domain style -n 2
python .agents/skills/ui-ux-pro-max/scripts/search.py "dragging movements" --domain ux -n 2
python .agents/skills/ui-ux-pro-max/scripts/search.py "spacing scale mobile" --domain ux -n 2
python .agents/skills/ui-ux-pro-max/scripts/search.py "form state validation" --stack react -n 3
```

The broad design-system search returned a marketing hero/Swiss composition and orange/blue palette. Those are a mismatch for the documented working dashboard and were **rejected**. The narrower style search verified Claymorphism as appropriate for toy-like educational objects; apply that material to the 3D diorama, without importing thick borders or double shadows into the working interface.

## Selected system

- **Colors:** preserve ivory `#FFF9F2`, peach `#F3A18C`, lavender `#B0A0E8`, mint `#DCEEDB`, warm brown `#453A33`. Derive darker semantic lavender foreground/CTA `#70588F` and muted brown `#6C6259` to meet AA on pastel surfaces. Never place pale lavender text on ivory as operational copy.
- **Fonts:** self-hosted Nunito 700/800 for rounded headings and Nunito Sans 400/600 for reading/controls, with both Vietnamese and Latin subsets. This combines the broad search's verified rounded Nunito with the targeted Soft Rounded pairing's Nunito Sans. Avoid the children's handwriting recommendation: IELTS essays need clear adult reading text.
- **Spacing:** 4/8px rhythm with shared 4, 8, 12, 16, 24, 32, 48px steps. Use 24px desktop columns, 20px mobile gutters, 12–16px component radii, with pills limited to compact controls.
- **Interactions:** native radio Task selection, keyboard-operable tabs, explicit field labels, recoverable inline errors, visible focus, busy/disabled submission, native dialog with explicit Tab wrap, 44px-high scene controls, reduced-motion alternatives.
- **Input alternatives:** dragging is optional. Rotation, zoom and reset all have labeled buttons. Mobile keeps vertical page scrolling and native pinch zoom; tested touch scroll with Chromium CDP, not physical hardware.
- **React:** lazy storage initialization, typed props and local component form state. Scene code loads separately; render only on state/control/resize changes or the bounded earned-piece animation.

## Impeccable application

Operate mode, code-led, following the user-pinned composition. The source document settles aesthetic decisions; no alternative identity or comp-approval round is needed. `context` ran once; new-work, mode-operate, craft-floor, critique, audit and polish references were read. Automatic design hooks reported zero deterministic findings on changed UI files. Independent critique and measured technical audit feed one repair batch and a finishing review. The final extracted token system belongs in `DESIGN.md`, with extensions in `.impeccable/design.json`.
