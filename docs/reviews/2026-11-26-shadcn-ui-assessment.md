# shadcn/ui adoption assessment

Broad adoption is a good fit for Codenames Digital's visual direction. Use shadcn/ui for shared controls, forms, dialogs, and panel surfaces across phone and TV screens. Keep board rendering and game behavior in domain components, with the same theme applied to them.

The return is consistent appearance, interaction, and component APIs. The application is small and already shares CSS, so adoption may increase total source size while reducing the control styling and interaction behavior designed from scratch. shadcn distributes editable component source that becomes part of this repository. [Official introduction](https://ui.shadcn.com/docs)

## Scope and coverage

Review date: November 26, 2026. Branch: `audit/shadcn-ui`. Worktree: `.cache/worktrees/shadcn-ui-audit`, based on `6d61d3a` from `team-tools`.

At capture, the reviewed main checkout included uncommitted UI changes. Those changes were read, not copied into this branch. The main branch subsequently advanced to 2875250; this audit worktree retains its original base. In particular, `ConfirmDialog.tsx`, its tests, and `dialog.css` are present in the main checkout but absent from the worktree's base commit. Integrate the finished upstream UI changes before implementation.

[The inventory](2026-11-26-shadcn-ui-inventory.json) records both versions, file hashes, and counting rules. Counts are JSX source locations, not rendered elements: one location can generate several team buttons or 25 word cards.

| Measure | Worktree base | Main checkout reviewed |
| --- | ---: | ---: |
| Non-test TSX files | 15 | 16 |
| TSX lines | 957 | 997 |
| CSS files | 6 | 7 |
| CSS lines | 958 | 1,001 |
| Native button locations | 27 | 23 |
| Input locations | 2 | 2 |
| Select locations | 1 | 1 |
| Shared confirmation call sites | 0 | 3 |

**22 of 23 button locations** are reasonable Button or Toggle candidates. The remaining location generates custom word-board buttons. Both inputs and the number select can migrate: **25 of 26 native control locations, approximately 96%**, are candidates. This measures control coverage, not project code eliminated.

All eight screen types can adopt the theme and shared components: phone join, lobby, clue giver, guesser, and game over; TV lobby, board, and game over. Rules, protocol, connections, QR generation, and wake lock logic receive little direct benefit from UI component replacement.

## Component mapping

These choices use the official [component catalog](https://ui.shadcn.com/docs/components). Priority reflects this project's needs.

| Existing UI | Proposed components | Benefit and retained behavior |
| --- | --- | --- |
| `.btn`, roster move buttons, timeline actions | `Button` | High: shared variants, focus, disabled states, sizes, and icon spacing. Add team-red, team-blue, phone, and TV variants. |
| `JoinForm` | `Card`, `Input`, `Label`, `Button`, optional `Badge` | High visual impact. Preserve trimming, 20-character limit, nickname autocomplete, team counts, and wake lock activation inside the tap. |
| `ClueForm` | `Input`, `Label`, `NativeSelect`, `Button` | High: match the join screen. Keep controlled values, form submission, keyboard hints, and remounting for each clue. |
| `ConfirmDialog` for undo, rewind, removal | `Dialog` inside the existing wrapper | Highest interaction benefit. Preserve Cancel-first focus, Escape, and outside-tap cancellation. |
| Host tools panel | Controlled `Popover`, `Button`, `Separator` | High: standard overlay behavior. Keep forced opening when a clue giver is missing; bound height and allow scrolling. |
| Clue-giver selection chips | Single-selection `ToggleGroup` | Medium: unify selection appearance and keyboard operation. Ignore empty values and derive selection from the server. Keep move/remove actions as Buttons. |
| VS/Coop selector | `ToggleGroup`, `Badge` | Medium visual benefit. Preserve VS selection and disabled Coop; replacing the control does not implement Coop. |
| Phone and TV rosters | `Card`, `Badge`, `Separator` | High visual consistency. Keep semantic lists, player status, host permissions, and separate screen densities. |
| Connection and error `Banner` | `Alert` in a fixed overlay wrapper | Medium: shared status styling. Preserve reconnecting `role="status"`, error `role="alert"`, and persistent visibility. |
| Turn status, remaining counts, clue history | `Card`, `Badge`, shared typography | Medium: consistent surfaces. Keep large scores, team colors, clue order, and reserved status height. |
| End-turn vote | `Button` with `aria-pressed`, or controlled `Toggle`; count `Badge` | Medium: preserve server-driven vote state and eligibility. |
| Word grid, word fitting, voting pips | Custom `WordGrid` and `Pips`, shared theme tokens | Keep five columns, specialized sizing, hidden information, reveal states, and vote visualization. A custom Button variant is possible but retains almost all board styling. |

Use `NativeSelect` for the 1-9 clue count to retain the phone's native picker. Broad adoption does not require replacing that interaction. [Native Select](https://ui.shadcn.com/docs/components/radix/native-select)

Prefer Popover to DropdownMenu for the host tools: the panel contains sections, player controls, and history rather than a short command menu. [Popover](https://ui.shadcn.com/docs/components/radix/popover)

## What becomes simpler

The current `ConfirmDialog` focuses Cancel and listens for Escape, but has no focus trap, explicit focus restoration, or background keyboard isolation. Inline callback dependencies can also rerun its focus effect during parent updates. A Radix-backed Dialog supplies modal focus handling and opening/closing focus hooks. Keep a trigger reference or explicit restoration target with the existing conditional wrapper. [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog)

Use ordinary Dialog to preserve the tested outside-click dismissal contract. AlertDialog is an alternative if confirmations intentionally require an explicit response; do not silently change that interaction during the visual migration. [Alert Dialog](https://ui.shadcn.com/docs/components/radix/alert-dialog)

Button styling spans `.btn`, `.chip`, `.mode`, `.roster__move`, `.host-menu__move`, and `.end-turn`. Consolidating their common treatment into variants provides more value than replacing tags. Existing CSS already prevents some duplication; the gain is a reusable React API and consistent states. [Button](https://ui.shadcn.com/docs/components/radix/button)

A planning estimate is that **roughly 200-350 of the existing 1,001 CSS lines** could move into shared components and theme utilities. This comes from buttons/chips, fields, modal chrome, mode controls, banners, and parts of panel styling. It is not a measured deletion count: generated source, utility classes, and TV overrides replace some code. Most layout and board rules still have a purpose.

## Integration and visual constraints

The project uses React 19, Vite 8, TypeScript 6, and plain CSS. There is no Tailwind setup, `components.json`, UI primitive dependency, or `@/` alias. The existing-Vite workflow adds Tailwind and its Vite plugin, aliases, and shadcn configuration. Adapt the steps to this project, preserving entry files and the WebSocket proxy. [Vite installation](https://ui.shadcn.com/docs/installation/vite)

Choose one primitive family consistently. Radix is a reasonable initial choice for the Dialog and Popover behavior reviewed here. Record the preset and dependency versions. Let the selected registry components determine utility, animation, and icon dependencies, then review the lockfile and production output. Actual installation and build are needed to verify compatibility and bundle cost.

| Constraint | Migration requirement |
| --- | --- |
| Token collisions | Current `--muted` means text color; shadcn uses it for a surface. Current `--accent` is action blue. Deliberately migrate references to `--muted-foreground` and `--primary`; retain separate team and card tokens. |
| Dark appearance | Use a coherent dark neutral preset with red/blue accents. Put colors and font defaults on the document so portaled content inherits them. |
| TV viewing distance | Preserve viewport-scaled type, large controls, and the 16:9 board composition. Default desktop sizes are insufficient. |
| Phone interaction | Preserve 48px primary controls, 72px join targets, 16px inputs, and the compact five-column board. |
| Portaled overlays | `.tv` and `.phone` ancestor selectors cannot reach body portals. Pass display sizing explicitly or use an appropriately themed portal root. |
| Stable board position | Preserve `.turn-slot`, reserved status height, fixed banners, and overlay confirmations. Avoid layout-affecting animations. |
| CSS migration | Tailwind's reset and utility layers can affect margins, borders, and controls. Migrate old control classes completely; check competing unlayered CSS. |
| Server authority | Preserve command payloads, permissions, disconnected disabling, and server-driven selection. Local component state must not independently decide votes or roles. |

The token mapping follows shadcn's semantic background/foreground convention. [Theming](https://ui.shadcn.com/docs/theming)

## Proposed migration order

1. **Foundation and join screen:** reconcile upstream changes; configure Tailwind, aliases, and preset; add Button, Input, Label, NativeSelect, Card, and Badge. Establish team variants and phone/TV sizing. Convert JoinForm as the visual reference.
2. **Phone controls and confirmations:** migrate ClueForm, PhoneLobby, end-turn controls, and ConfirmDialog. Keep the confirmation wrapper API to limit caller changes.
3. **TV and host controls:** migrate lobby actions and rosters, host Popover and selection controls, game-over actions, score panels, and clue history. Check overlays on TV and laptop sizes.
4. **Shared finish:** migrate Banner, align typography and board tokens, and remove CSS after its consumers migrate. Retain specialized board rules.

This establishes shadcn as the default for future general UI. Avoid adding form frameworks for two small forms or replacing simple lists with Data Table. Keep status information persistent instead of turning it into disappearing toasts.

## Implementation verification

Use existing `?mock=` fixtures to compare phone join/lobby/clue/guess/game-over and TV lobby/guess/host/clue-giver-recovery states. Check phones at 360px and 390px widths and TV at 1920x1080, including long names and words, disconnected controls, and overlays.

Run `npm run build`, `npm run lint`, `npm test`, and `npm run e2e` after migration. Preserve the current checkout's `e2e/layout.e2e.ts` board-position checks when integrating upstream changes. Add browser coverage for Tab/Shift+Tab containment, Cancel-first focus, focus restoration, outside dismissal, and nested host/confirmation overlays. Preserve existing confirmation tests unless a behavior change is intentional.

At the assessment stage, this branch contained only the assessment and inventory. The subsequent requested preview implements phone join, phone lobby, and TV lobby using shadcn components, with a --lobby-preview option in scripts/playtest.ts. The preview is based on 5abb931; the inventory above preserves the earlier audit snapshot. Control coverage is from source inspection; visual quality and runtime compatibility remain implementation checks.


