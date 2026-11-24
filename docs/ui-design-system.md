# UI Design System — Zed IT Anti Browser

Rules for keeping the renderer polished. coss UI components are already well-built;
the visual quality comes from **how they are composed**. Everything below is enforced
by tokens in `apps/desktop/src/styles/globals.css` and the shell in
`apps/desktop/src/components/ui/page.tsx`.

## 1. Typography

One ramp, four roles. Never hardcode `text-[15px]`, `text-[11px]`, `tracking-wider`.

| Role | Utility | Size / line | Weight | Use |
|---|---|---|---|---|
| Page title | `type-page-title` | 17 / 23 | 600 | One per route, in `PageTitle` |
| Section / card title | `type-section-title` (`text-base`) | 15 / 22 | 600 | Card titles, settings groups |
| Body / UI | `text-sm` (default) | 13 / 20 | 400/500 | Everything interactive |
| Meta | `text-xs` | 11 / 15 | 400 | IDs, timestamps, helper text, badges |
| Micro label | `type-micro` | 11 / 16 | 600, `+0.06em`, uppercase | Sidebar groups, rail headers |
| Numeric | `type-numeric` | — | — | Counts and aligned figures (tabular) |

Notes:

- Body is 13px (`--text-sm`) — the Tailwind scale is overridden so primitives and app
  code land on the same pixel values.
- Sentence case for table headers and buttons. Uppercase is reserved for `type-micro`.
- Only one weight step between body and title: use 600 for titles, 500 for emphasis,
  400 for content. No `font-bold` outside badges/avatars.
- Numbers that sit in columns get `type-numeric`; machine strings (paths, hashes,
  versions) get `font-mono-tabular`.

## 2. Shape

Single radius ramp derived from `--radius: 8px`:

```
xs 4 · sm 5 · md 7 · lg 8 · xl 12 · 2xl 16
```

Nesting rule: **inner radius = outer radius − inset**. `Frame` (2xl = 16) has `p-1`
(4px) so `FramePanel` is `xl` (12). Never put a square-cornered child inside a rounded
parent — add `overflow-hidden` to the parent (`FramePanel`, `CardPanel`).

| Surface | Radius |
|---|---|
| Frame / Card / Dialog | `rounded-2xl` (16) |
| FramePanel / Popover / Menu / Table body | `rounded-xl` (12) |
| Button / Input / Select / sidebar item | `rounded-lg` (8) |
| Icon button (`icon-xs`), code chip | `rounded-md` (7) |
| Badge / count pill | `rounded-sm` (5) |

## 3. Spacing & bands

4px base grid. Fixed chrome heights so columns line up across the app:

| Band | Height | Padding |
|---|---|---|
| Sidebar header | 52 (`h-13`) | `px-2.5` |
| Page header (`PageHeader`) | 52 (`min-h-13`) | `px-5 py-2` |
| Page body (`PageBody`) | — | `px-5 py-4` |
| Card / FramePanel content | — | `p-5` (override to `p-4` only for dense lists) |
| Table cell | 40 comfortable / 32 compact | `px-3` |
| Status bar | 36 (`h-9`) | `px-2` |

Sidebar is 256px (`16rem`). Content max-widths: `max-w-4xl` (settings),
`max-w-5xl` (lab), `max-w-2xl` (editor form).

## 4. Color

- **One brand red**: `--primary` = `#d90000`, reused by `--sidebar-primary`. Never
  introduce a second red (`#fd0100` was removed).
- Filled `primary` is for exactly **one** primary CTA per surface. Row actions are
  `secondary` (start) or `destructive-outline` (stop/clear/remove). Filled
  `destructive` is reserved for irreversible confirmations in dialogs.
- Surfaces ladder (light): `background` white → `sidebar`/`muted` neutral-50 →
  `card` white + border. (dark): `background` #12 → `sidebar` #10 → `card` +2%.
  Cards must be visibly lighter than the canvas in dark mode.
- Borders are `9%` black / `8%` white. Use `border-border/80` for chrome dividers so
  the band edge stays quieter than component outlines.
- Charts use `chart-1..5` in the same hue order in both themes (brand red, teal,
  indigo, amber, sky).

## 5. Composition recipes

**Route**

```tsx
<Page>
  <PageHeader>
    <PageHeading>
      <PageTitle>Proxies</PageTitle>
      <Badge variant="secondary" className="type-numeric">{n}</Badge>
    </PageHeading>
    <PageActions>{/* search, then one primary button last */}</PageActions>
  </PageHeader>
  <ScrollArea className="min-h-0 flex-1">
    <PageBody>{/* Frame + FramePanel, or Empty */}</PageBody>
  </ScrollArea>
</Page>
```

Header action order: search → filters → secondary → primary. Icon only when the
label is obvious; otherwise icon + label at `size="sm"`.

**Table** — `Frame > FramePanel.overflow-hidden.p-0 > Table`, cells `px-3`.
Sortable headers are ghost buttons with the same 40px height and 13px muted text;
no uppercase.

**Nav rail** (profile editor): tinted rail (`bg-muted/30`), items are ghost buttons,
the active item is `bg-background font-medium shadow-xs/5`. No left border bars.

**Bulk bar**: `rounded-xl border-border/80 bg-popover/95 backdrop-blur-xl shadow-lg`,
sits `bottom-11` so it clears the status bar.

## 6. Anti-patterns to grep for

```bash
rg 'text-\[[0-9]+px\]' apps/desktop/src        # ad-hoc sizes
rg 'tracking-wider|tracking-wide' apps/desktop/src  # header casing hacks
rg 'bg-card.*px-4 py-2\.5' apps/desktop/src    # hand-rolled page headers
rg 'FramePanel className="p-0"' apps/desktop/src    # unclipped table corners
rg '#fd0100|#d90000' apps/desktop/src          # colours outside globals.css
```

## 7. Known follow-ups

- `ProxiesPage` / `ProfilesPage` row actions still use five separate icon buttons;
  collapse into coss `Menu` on the row to cut visual noise.
- Settings `Tabs` should become a vertical rail on wide windows (≥1100px).
- Add `Empty` illustrations per route instead of a single icon tile.
- Onboarding dialog could use the display size (24px) for its title.
