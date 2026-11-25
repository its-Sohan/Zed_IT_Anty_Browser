# Zed IT Anti Browser

**Product & Build Plan**

| | |
|---|---|
| Document | Product & Build Plan |
| Version | 1.0 — Draft |
| Date | 25 November 2026 |
| Owner | ZED IT |
| Product | Zed IT Anti Browser |
| Platforms | Windows (v1), Linux (development / internal). Profile OS options: Windows, macOS, Linux, Android (partial spoof) |
| Business model | Paid license keys |
| Status | Planning — pending build approval |

> **One-line pitch:** A fast, honest anti-detect browser for people who manage many accounts — built by ZED IT, priced for operators, and backed by real support.
>
> **Brand line:** *Blend in. Scale out.*
>
> **Secondary line:** *One browser. Many identities.*

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Product strategy](#2-product-strategy)
3. [Brand identity](#3-brand-identity)
4. [Users and use cases](#4-users-and-use-cases)
5. [Market and competition](#5-market-and-competition)
6. [Scope](#6-scope)
7. [Functional requirements](#7-functional-requirements)
8. [UX and UI](#8-ux-and-ui)
9. [Technical architecture](#9-technical-architecture)
10. [Data model](#10-data-model)
11. [Licensing and monetization](#11-licensing-and-monetization)
12. [Security and privacy](#12-security-and-privacy)
13. [Delivery plan](#13-delivery-plan)
14. [Business and go-to-market](#14-business-and-go-to-market)
15. [Risks and mitigations](#15-risks-and-mitigations)
16. [Success metrics](#16-success-metrics)
17. [Launch checklist](#17-launch-checklist)
18. [Open decisions](#18-open-decisions)
19. [Appendices](#19-appendices)

---

## 1. Executive summary

Zed IT Anti Browser is a desktop application that creates isolated browser profiles, gives each one a coherent fingerprint, routes it through its own proxy, and launches it as an independent browser window. It follows the proven Dolphin Anty model: the product is not a browser built from scratch, but a specialist manager and launcher around a patched Chromium.

**What v1 is:**

- Windows desktop app built with Electron, Vite, React, Tailwind CSS v4, and Microsoft Fluent UI v9.
- Profile manager with folders, tags, statuses, notes, search, bulk actions, copy, and CSV import.
- Deterministic fingerprint generation built on `fingerprint-chromium` (BSD-3, Chromium 150 base).
- Local proxy bridge supporting authenticated HTTP and SOCKS5 proxies, traffic counters, and leak-safe defaults.
- Cookie import (Netscape and JSON), start pages, and basic bookmarks.
- Built-in Fingerprint Lab for verifying what test sites actually see.
- Signed license-key activation with plans, device limits, trial mode, and offline grace.
- No public API, team accounts, cloud sync, script builder, or native mobile profiles in v1. Android is available only as a partial OS spoof (see §6.3).

**Why it can win:**

- Dolphin Anty charges $89/month for 100 profiles. GoLogin lists $99/month for 300 but discounts heavily. There is room for a focused 10–200 profile product with clean UX and better local support.
- ZED IT already has the brand discipline, engineering stack, and audience to ship and support it.
- Fluent UI gives the app a modern, dense Windows 11-style interface that looks more expensive than the competition without a large design team.
- License-key sales remove account-system complexity from v1 and let the product launch through affiliate and proxy-provider channels quickly.

**The honest risk:** the prebuilt engine does not support every Dolphin fingerprint field. Manual screen resolution, media-device counts, manual font lists, and manual GPU strings are gaps in v1. Week 0 is a validation gate: if the engine cannot produce credible fingerprints for our target sites, the roadmap shifts to an owned patch build before the UI scales.

---

## 2. Product strategy

### 2.1 Problem

People who operate multiple accounts need each account to look like it belongs to a different, ordinary person on a different device and network. Cookies, passwords, and history must stay isolated. The proxy must not leak. The fingerprint must be coherent enough that the account is not flagged or banned.

Existing tools solve this but are expensive at scale, visually dated, slow to support new markets, and opaque about what is actually being spoofed. Users distrust marketing claims and want to verify results themselves.

### 2.2 Solution

A local-first desktop manager that:

1. Makes profile creation and bulk operations fast.
2. Generates a credible, deterministic fingerprint within real hardware combinations.
3. Keeps network identity consistent (IP, DNS, timezone, locale, WebRTC).
4. Shows the truth: a lab that compares expected versus observed values.
5. Charges a fair price with a license key, not a mandatory cloud account.

### 2.3 Positioning

> **For** solo operators and small agencies running 10–200 accounts  
> **Who** need isolated browser identities without enterprise complexity  
> **Zed IT Anti Browser** is an anti-detect browser manager  
> **That** makes profiles, fingerprints, and proxies fast to create and easy to verify  
> **Unlike** Dolphin Anty and GoLogin  
> **We** focus on the 10–200 profile tier, local-language support, and transparent fingerprint reporting.

### 2.4 Product principles

- **Local-first.** Browsing data stays on the user's machine. The license server knows a key and a machine hash, nothing about browsing.
- **Coherence over uniqueness.** A fingerprint should look like a real device, not a one-of-a-kind snowflake.
- **Show, don't claim.** The Fingerprint Lab is part of the product, not a marketing page.
- **Dense, fast UI.** Operators work in this app for hours. No oversized cards, no unnecessary clicks.
- **No dead ends.** Every error explains what failed, what to try, and where the logs are.
- **Honest limits.** If the engine cannot spoof a field in v1, the UI says so instead of faking it.

### 2.5 What we are not building in v1

- Not a VPN or a proxy provider.
- Not an automation platform (no public API, MCP, Selenium helpers yet).
- Not a team collaboration tool (no cloud accounts, sharing, roles).
- Not a script builder, cookie robot, or RPA product.
- Not a tool for fraud, stolen accounts, payment abuse, or evading lawful enforcement. The acceptable-use policy is part of the product.

---

## 3. Brand identity

### 3.1 Brand architecture

Zed IT Anti Browser is a **product sub-brand of ZED IT Bangladesh**, not a separate company. It uses the **existing ZED IT mark** — the red ZD monogram and the ITBD / IT BANGLADESH wordmark — rather than a new symbol. The product adds a descriptor and a dark-surface treatment; it does not redraw the parent identity.

| Layer | Treatment |
|---|---|
| Parent brand | ZED IT / ZED IT Bangladesh |
| Product name | Zed IT Anti Browser |
| Short name | Anti Browser (in-app, installer, docs) |
| Product mark | Existing ZED IT “ZD” monogram |
| Wordmark | Existing “ITBD” compact / “IT BANGLADESH” full |
| Product descriptor | “ANTI BROWSER” set in Inter SemiBold |
| Parent endorsement | “by ZED IT” line where needed |
| Primary tagline | Blend in. Scale out. |
| Secondary tagline | One browser. Many identities. |

**Source assets**

- `logo.png` in this folder — 64×64 raster supplied with the project. Reference only; too small for production.
- `~/ZED-IT-BANGLADESH/apps/web/public/logo.png` — 2591×345 raster master with black wordmark, for light surfaces.
- `~/ZED-IT-BANGLADESH/apps/admin/public/brand/logo-dark.png` — 2000×266 raster master with white wordmark, for dark surfaces.
- The 64×64 file combines the red mark with the compact “ITBD” wordmark. It is a **lockup**, not an app icon.
- Rebuild the ZD monogram and wordmark as SVG before the installer, website, and icon work. Trace from the high-resolution masters, do not auto-vectorize a screenshot.

The existing ZED IT identity is red and black, heavy italic, high-contrast, and direct. The product inherits that DNA but uses it more sparingly: a dark operator interface with red reserved for action and identity, not decoration.

### 3.2 Logo — the existing ZD mark

The mark is a red ZD ligature: a bold angular Z interlocked with a D built from three horizontal bars and a thick right-hand curve. It is flat, high-contrast, and has no outline or gradient. The wordmark is an italic, wide-tracked uppercase — “ITBD” in the compact file and “IT BANGLADESH” in the web master.

The product lockup adds **ANTI BROWSER** after a short vertical divider. The parent mark is never altered, re-spaced, or given a new container.

**Why no new symbol**

- The ZD mark is already recognized by ZED IT's audience; a new shield adds learning cost for no gain.
- The product is sold by ZED IT; the parent mark carries the trust.
- The existing mark is distinctive and bold enough to work on a dark app surface.
- One mark, one system: fewer assets to maintain, fewer places to drift.

**App icon**

- Square 1024×1024 master, near-black `#08080A` background, red ZD glyph centered.
- Glyph width ~80% of the canvas, optically centered. Keep the black counters open; do not fill them.
- Export Windows `.ico` at 16, 24, 32, 48, 64, 128, 256 px, plus 1024 and 512 PNG for the website and store listings.
- The ZD mark is wide (about 2.74:1). At 16–24 px it reduces to a compact red bar. Check it on the Windows taskbar and in the tray before approving.
- If 16 px recognition fails, use a red rounded-square tile with a white **Z** taken from the same geometry **for the smallest sizes only**. The full ZD mark remains the app icon at 32 px and above.
- Do not upscale the 64×64 `logo.png` — its glyph is only ~10 px tall. Extract from the 2591 px master or the rebuilt SVG.

### 3.3 Lockups

| Variant | Use |
|---|---|
| Horizontal product lockup | ZD mark + ITBD wordmark + divider + “ANTI BROWSER”. Website header, installer, About screen. |
| Stacked product lockup | ZD mark above “ITBD / ANTI BROWSER”. Splash screen, square placements, merchandise. |
| Icon only | App icon, taskbar, tray, favicon, social avatar. |
| Wordmark only | Document headers, invoices, legal pages. |
| Monochrome | White or black single-color version for print, embroidery, and one-color surfaces. |

**Construction rules**

- Use the supplied mark as-is. Do not redraw, re-space, slant, outline, or add effects.
- Preserve the monogram's black counters (the negative space inside the Z and D). Never fill them.
- The descriptor uses uppercase Inter SemiBold with 0.18em tracking; it is not part of the parent wordmark.
- Clearspace equals the height of one red bar on every side (about 0.25× the mark height).
- Minimum sizes: icon 16 px (verify), horizontal lockup 96 px wide, stacked lockup 72 px wide.
- Dark surfaces: red mark + white wordmark. Light surfaces: red mark + black wordmark.
- Never place the red mark on a mid-red, orange, or photographic background.
- Do not add a shield, badge, ring, or secondary symbol. The ZD mark is the mark.

### 3.4 Color system

| Token | Hex | Usage |
|---|---|---|
| `--zita-red` | `#FD0100` | Brand mark, active indicators, selected states, key accents |
| `--zita-red-action` | `#D90000` | Filled primary buttons with white text (WCAG AA) |
| `--zita-red-soft` | `#2A0A0B` | Red-tinted surfaces, danger-adjacent backgrounds |
| `--zita-ink` | `#08080A` | App background, icon background |
| `--zita-surface` | `#101013` | Panels, sidebar |
| `--zita-elevated` | `#17171B` | Cards, dialogs, menus |
| `--zita-border` | `#2A2A31` | Dividers, input borders |
| `--zita-text` | `#F4F4F5` | Primary text |
| `--zita-muted` | `#9A9AA3` | Secondary text, metadata |
| `--zita-success` | `#22C55E` | Running, connected, valid |
| `--zita-warning` | `#F59E0B` | Starting, degraded, expiring |
| `--zita-danger` | `#F87171` | Errors, destructive actions, revoked licenses |
| `--zita-info` | `#38BDF8` | Informational states, links |

**Light theme:** background `#FAFAF9`, surface `#FFFFFF`, elevated `#FFFFFF`, border `#E4E4E7`, text `#111113`, muted `#6B7280`. The red palette stays the same.

**Contrast rules**

- Brand red is an accent. Do not use `#FD0100` for body text or small labels on dark surfaces.
- Use `#D90000` behind white button text.
- Error states use `#F87171` plus an icon and text; never color alone.
- Focus rings use a 2 px white inner ring plus a 2 px red outer ring for visibility on both themes.

### 3.5 Typography

| Role | Typeface | Notes |
|---|---|---|
| UI | Inter | Loaded as a variable font; fallback for Segoe UI Variable |
| Code, IDs, seeds, license keys | Geist Mono | Tabular figures; no ligatures |
| Wordmark | Existing ZED IT heavy italic | Do not modify |
| Product descriptor | Inter SemiBold, uppercase, 0.18em tracking | “ANTI BROWSER” |
| Headings | Inter SemiBold | 18/24/32 px scale |
| Dense table text | Inter 13 px | 20 px row height at compact density |

Base sizes: 13 px body in tables, 14 px in forms and dialogs, 12 px captions, 11 px badges. Windows UI should feel native-dense, not web-marketing airy.

### 3.6 Iconography and motion

- Lucide icons at 1.5 px stroke, 16 px and 20 px sizes.
- Status uses a dot plus text; never rely on color alone.
- Motion is short and functional: 120–160 ms ease-out for menus and panels, 200 ms for drawers. Respect `prefers-reduced-motion`.
- No animated gradients, particles, or “hacker” visuals. The product is a tool.

### 3.7 Voice and messaging

- Technical, calm, specific.
- Say “reduces fingerprint mismatch” — not “100% undetectable”.
- Say “your browsing data stays on your machine” — only if telemetry is off, which it is by default.
- Avoid fear-based marketing about bans. Explain isolation and coherence.
- Support languages: English at launch, Bangla at launch or immediately after; Hindi and Vietnamese later.

**Approved lines**

- “Blend in. Scale out.”
- “One browser. Many identities.”
- “Your profiles. Your proxies. Your machine.”
- “See what sites see.” (Fingerprint Lab)
- “Built by ZED IT.”

**Avoid**

- “Undetectable”, “100% anonymous”, “unbannable”.
- Claims about specific platforms that we cannot support with evidence.
- Fake urgency and fake scarcity in product UI.

### 3.8 Brand assets checklist

- [ ] ZD monogram rebuilt as SVG from the 2591 px master
- [ ] ITBD / IT BANGLADESH wordmark vector
- [ ] Horizontal product lockup (dark and light)
- [ ] Stacked product lockup (dark and light)
- [ ] App icon: SVG master, 1024 PNG, `.ico` (16–256), `.icns` (macOS, later)
- [ ] Small-size icon check at 16 and 24 px (Z-tile fallback only if needed)
- [ ] Tray icon: 16/20/32 px monochrome and colored
- [ ] Website hero, favicon, Open Graph image
- [ ] Installer banner (NSIS sidebar 164×314) and header (150×57)
- [ ] Splash screen (1280×800, logo + loading state)
- [ ] About screen artwork
- [ ] Email templates and invoice header
- [ ] Brand guidelines one-pager (clearspace, colors, type, don'ts)

---

## 4. Users and use cases

### 4.1 Primary personas

| Persona | Context | What they need | What frustrates them |
|---|---|---|---|
| Solo media buyer | 10–40 ad accounts, works from one Windows laptop | Fast profile creation, reliable proxy checks, low monthly cost | Slow UI, hidden fingerprint gaps, price jumps |
| Small agency operator | 50–200 client profiles, 2–3 staff | Folders, tags, bulk edits, stable launches, clear logs | Team features locked behind enterprise tiers, poor support |
| E-commerce / dropshipping operator | Multiple storefronts and marketplaces | Isolated cookies, consistent geo, quick copy of a working profile | Cookie import failures, leaks, profile corruption |
| QA / ad-verification analyst | Tests sites from many geos and devices | Accurate timezone/locale/geo matching, repeatable fingerprints | Inconsistent results between launches |
| Privacy-conscious power user | Wants separate identities for research | Local-only data, no cloud account, easy backup | Mandatory accounts and telemetry |

### 4.2 Jobs to be done

- “When I get a new client, I want to create a clean profile with a matching proxy in under two minutes.”
- “When I duplicate a profile, I want a new fingerprint but the same proxy, cookies, and extensions.”
- “When a site behaves differently, I want to see exactly which fingerprint values it observed.”
- “When a proxy dies, I want to know before I open the profile, not after.”
- “When I import 50 accounts from a spreadsheet, I want row-level errors, not a silent partial import.”
- “When my license expires, I want my data to remain exportable.”

### 4.3 Anti-personas and acceptable use

The product is for legitimate multi-account operation, privacy, QA, ad verification, and client management. The following are prohibited and grounds for license revocation:

- Payment fraud, carding, money laundering, or financial scams.
- Identity theft, account takeover, or use of stolen credentials.
- Harassment, stalking, CSAM, or illegal content.
- Evading sanctions, law enforcement, or court orders.
- Bulk creation of accounts to abuse platform incentives or spam.

The acceptable-use policy is shown at activation, linked in the app, and enforced through support and payment-processor rules.

---

## 5. Market and competition

### 5.1 Competitive landscape

Pricing checked November 2026. List prices change frequently; verify before publishing comparisons.

| Product | Free tier | Entry paid | Mid tier | Top tier | Notes |
|---|---|---|---|---|---|
| Dolphin Anty | 3 profiles | Starter $10/mo, 20–60 profiles | Base $89/mo, 100 profiles | Team $159/mo, 300; Enterprise $299/mo, 1000 | Strong feature depth, team features, local API, MCP, proxy integrations |
| GoLogin | 3 profiles | Professional $9/mo list (annual $4.50), 10–100 profiles | Business $99/mo list (annual $49.50), 300–500 | Enterprise $179/mo list (annual $89.50), 1000 | Aggressive annual discounts, cloud browser, mobile app |
| AdsPower | 2 profiles | Professional, 10–100 profiles, dynamic pricing | Business, 200–5000 profiles | Enterprise custom | Strong RPA and team features, proxy catalog |
| Multilogin | 5 profiles | Pro $19/mo, 10 profiles | Business $40/mo, 100 profiles | Up to 10,000 profiles | Premium brand, cloud phones, built-in proxies |
| Zed IT Anti Browser | 7-day trial, 5 profiles | Starter, 10 profiles | Pro, 50; Agency, 200 | Enterprise 500+ | Focus, price, local support, transparent fingerprint lab |

### 5.2 Where the market is weak

- **The 50–200 profile gap.** Dolphin jumps from $10 to $89. GoLogin's list price jumps from $9 to $99. A well-priced 50–200 tier is attractive to small agencies.
- **Trust.** Users suspect fingerprint spoofing is incomplete. A built-in verification lab differentiates.
- **Support time zones.** Most competitors support from Europe and the US. ZED IT can support South Asia and Southeast Asia on local hours, in English and Bangla.
- **Complexity.** Team, cloud, RPA, mobile, and AI features make entry products heavy. A focused v1 is easier to learn.
- **Payment friction.** Many operators cannot easily pay Western processors. Local payment options and license keys reduce friction.

### 5.3 Positioning map

- **Axis 1:** price per 100 profiles (low → high).
- **Axis 2:** depth of fingerprint control (basic → deep).

Zed IT sits in the **mid-price, credible-depth** quadrant: less expensive than Dolphin Base and Multilogin Business, deeper and more honest than entry tools, with a roadmap to owned patches.

### 5.4 Competitive moat

v1 is not a technology moat; it is execution. The durable advantages are:

1. Owned Chromium patch pipeline (from v1.1 onward).
2. Verified fingerprint lab and public detection reports.
3. Local support and payment rails.
4. Automation API and MCP in v1.1–v1.2.
5. A price ladder that grows with the customer.
6. ZED IT's existing brand and distribution.

---

## 6. Scope

### 6.1 v1 scope (ship)

| Area | Included | Priority |
|---|---|---|
| Profiles | Create, edit, delete, copy, archive, restore, launch, stop, status | P0 |
| Fingerprints | Deterministic seed, OS/platform, brand/version, CPU, memory, timezone, locale, language, canvas/audio/fonts/rects toggles, WebGL via engine | P0 |
| Proxies | Add, edit, delete, bulk add, check, geo lookup, per-profile assignment, local authenticated bridge, traffic counters | P0 |
| Cookies | Import Netscape and JSON, seed via CDP, clear cookies | P0 |
| Organization | Folders, tags, statuses, notes, search, filters, sorting, columns | P0 |
| Bulk | Multi-select, bulk launch/stop/tag/status/folder/delete, copy with randomized fingerprint | P0 |
| Import | CSV/XLSX profile import with row-level validation and proxy assignment | P1 |
| Fingerprint Lab | Launch a check profile, compare observed vs expected, export report | P1 |
| Settings | Storage path, engine version, theme, proxy check provider, data export | P1 |
| Licensing | Trial, activation, offline grace, device limits, plan limits, deactivation, expired read-only mode | P0 |
| Updates | Signed app updates and engine downloads with checksums | P0 |
| Branding | App icon, splash, About, installer artwork, website assets | P0 |

### 6.2 Explicitly out of scope for v1

- Public local API and remote API.
- MCP server for AI agents.
- Team members, roles, sharing, cloud sync.
- Script builder, cookie robot, synchronizer, bulk editing beyond the listed actions.
- Native mobile/Android profiles and cloud phones. The partial Android OS spoof in §6.3 is the only mobile item in v1. iOS is not offered.
- Built-in proxy sales.
- Profile marketplace or renting.
- macOS build.

### 6.3 Engine capability matrix

Based on `fingerprint-chromium` documentation for Chromium 150 and subject to Week 0 verification.

| Signal | v1 status | Notes |
|---|---|---|
| Platform / OS | Supported | `--fingerprint-platform`: `windows`, `macos`, `linux` |
| Android OS spoof | **Gap (partial)** | Engine has no `android` platform. Profile is sent as `linux`, so navigator.platform and Client Hints read desktop Linux. Touch, mobile viewport, and mobile UA are not emulated. Lab reports the mismatch. iOS not offered (iOS browsers require WebKit) |
| Platform version | Supported | `--fingerprint-platform-version` |
| Browser brand and version | Supported | `--fingerprint-brand`, `--fingerprint-brand-version` |
| User-Agent and Client Hints | Supported | Derived from brand/platform/version |
| CPU cores | Supported | `--fingerprint-hardware-concurrency` |
| Device memory | Seed-derived | No direct flag; verify reported value |
| WebGL image | Seed-derived | Noise based on seed |
| WebGL vendor/renderer | Seed-derived | Manual strings removed in Chrome 144+ |
| Canvas image/text | Seed-derived | Can disable with `--disable-spoofing=canvas` |
| Audio | Seed-derived | Can disable with `--disable-spoofing=audio` |
| Fonts | Seed-derived | Can disable with `--disable-spoofing=font` |
| ClientRects | Seed-derived | Can disable with `--disable-spoofing=clientrects` |
| Timezone | Supported | `--timezone` |
| Language / Accept-Language | Supported | `--lang`, `--accept-lang` |
| WebRTC | Supported | Non-proxied UDP disabled by default |
| Geolocation | Best-effort / gap | CDP override possible; not engine-level |
| Screen resolution | **Gap** | Host screen remains visible; window size only |
| Media devices | **Gap** | Host device counts remain visible |
| Ports | Gap / low priority | Mostly not exposed to web content |
| Do Not Track | Supported via flag | Optional |
| MAC address / device name | Gap / low priority | Not normally visible to sites |
| Plugins | Fixed list | Chromium 133+ behavior |

**Decision:** design the v1 editor around this matrix. Show generated values read back after first launch. Do not present manual controls the engine cannot honor. Plan a small owned patchset for screen, media devices, and manual GPU strings in v1.1.

### 6.4 Release phases

| Phase | Scope | Target |
|---|---|---|
| v1.0 | Core desktop app + licensing, Windows | Public beta |
| v1.1 | Screen/media/GPU patch build, public local API, cookie export | +8–10 weeks |
| v1.2 | Team accounts, cloud sync, profile templates, further bulk editing | +6 months |
| v2.0 | Automation platform: MCP, script builder, mobile/cloud profiles | +12 months |

---

## 7. Functional requirements

Requirement IDs are for tracking, not for user-facing copy.

### 7.1 Profiles

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-001 | Create a profile | Name required; OS, proxy, tags, folder optional; a unique seed is generated |
| FR-002 | Edit a profile | All fields editable except the immutable profile ID; seed re-roll is explicit |
| FR-003 | Launch a profile | Browser opens within 5 seconds on a warm engine; errors produce an actionable message and log path |
| FR-004 | Stop a profile | Graceful CDP close, then terminate; process tree cleaned; bridge stopped |
| FR-005 | Copy a profile | Copies settings and optionally cookies; randomize seed toggle; new user-data-dir |
| FR-006 | Delete and restore | Soft delete to trash for 48 hours, then permanent; restore preserves profile data |
| FR-007 | Profile status | Stopped, starting, running, stopping, error; status survives app restart via session reconciliation |
| FR-008 | Last launched | Show timestamp, duration, and launch count |
| FR-009 | Notes | Free text with basic length limit; autosaved |
| FR-010 | Profile password | Deferred to v1.1; not required for v1 |

### 7.2 Fingerprints

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-011 | Generate fingerprint | A new profile gets a coherent config from seed; no invalid CPU/RAM/GPU combinations |
| FR-012 | Re-roll | “New fingerprint” creates a new seed and refreshes generated values |
| FR-013 | Read back | After launch, observed values are captured via CDP and displayed on the fingerprint tab |
| FR-014 | OS selection | Windows 10, Windows 11, macOS, Linux; engine flag and UA match. Android 13–15 is a partial exception: engine flag is `linux`, and the Lab must show the navigator/Client Hints mismatch |
| FR-015 | Timezone and locale | Auto from proxy geo by default; manual override with warning if mismatched |
| FR-016 | WebRTC | Proxied/non-proxied UDP disabled by default; no host IP leak in the lab |
| FR-017 | Spoofing toggles | Canvas, audio, fonts, client rects, GPU can be disabled where the engine supports it |
| FR-018 | Hardware table | Only real CPU/RAM/GPU combinations are selectable or generated |
| FR-019 | Seed visibility | Seed shown in mono type; copy button; stable across restarts |

### 7.3 Proxies

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-020 | Add proxy | Protocol (HTTP/HTTPS/SOCKS5), host, port, username, password, label |
| FR-021 | Credentials | Stored encrypted; never shown in logs; optional reveal with confirmation |
| FR-022 | Test proxy | Returns exit IP, country, city, timezone, latency, and status |
| FR-023 | Bulk add | Paste `host:port:user:pass` lines or CSV; duplicates flagged |
| FR-024 | Assign to profile | One proxy per profile in v1; bulk assign one proxy to many profiles |
| FR-025 | Traffic counter | Bytes up/down per session and cumulative per profile |
| FR-026 | Proxy failure | Profile launch blocked with a clear check-result state; user can launch without proxy only after explicit confirmation |
| FR-027 | Geo enrichment | Country, city, timezone cached; refresh action available |

### 7.4 Cookies and session

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-028 | Import cookies | Netscape `.txt` and JSON; validate domain/path/expiry; report skipped entries |
| FR-029 | Seed before navigation | Cookies set on `about:blank` via CDP before start pages load |
| FR-030 | Clear cookies | Per-profile action with confirmation |
| FR-031 | Persistence | Cookies survive stop/restart through Chromium's user-data-dir |

### 7.5 Organization and bulk operations

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-032 | Folders | Nested one level; drag-and-drop later; count per folder |
| FR-033 | Tags | Create, rename, delete; multi-tag per profile; filter by tag |
| FR-034 | Statuses | Default set (Active, Warming, Paused, Banned) plus custom; color and icon |
| FR-035 | Search | Name, notes, tags, proxy host, profile ID |
| FR-036 | Filters | Status, tag, folder, OS, proxy country, running state |
| FR-037 | Bulk actions | Launch, stop, assign proxy, add/remove tags, set status, move folder, delete |
| FR-038 | CSV/XLSX import | Preview, column mapping, row-level validation, per-row proxy, import summary |
| FR-039 | Column chooser | Show/hide and reorder columns; persisted per user |
| FR-040 | Sorting | Name, last launched, created, status, proxy country |

### 7.6 Fingerprint Lab

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-041 | Run check | Launches a lab profile with the selected fingerprint and proxy |
| FR-042 | Capture | Collects UA, platform, screen, timezone, locale, WebGL, WebRTC, canvas hash where available |
| FR-043 | Compare | Expected vs observed table with pass/warn/fail |
| FR-044 | Export | Copy JSON or save a report file |
| FR-045 | No silent claims | Gaps display as “not spoofed in this engine”, not as pass |

### 7.7 Licensing and settings

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-046 | Activate | Key + machine hash; returns signed token; success within 3 seconds |
| FR-047 | Trial | 7 days, 5 profiles, full features; one trial per device; no card required |
| FR-048 | Offline grace | 14 days without server contact; clock-tamper detection; visible countdown |
| FR-049 | Plan limits | Stored profile count enforced; device slots enforced; expired license read-only |
| FR-050 | Deactivate | Releases a device slot; can be done in app or license portal |
| FR-051 | Settings | Storage path, engine version, theme, language, proxy-check provider, telemetry opt-in |
| FR-052 | Data export | Export profile metadata and proxy list as JSON/CSV; profile folder backup instructions |
| FR-053 | About | Version, engine version, license plan, support links, licenses/notices |

---

## 8. UX and UI

### 8.1 UX principles

1. **Two clicks to launch.** The profile list is the home screen; Start is always visible.
2. **Density with breathing room.** 36 px controls, 32–40 px table rows, 8 px spacing scale.
3. **Progressive disclosure.** Common fields first; advanced fingerprint settings behind a tab or disclosure.
4. **Truthful states.** Starting, running, stopping, crashed, proxy failed, license expired are distinct.
5. **No modal overload.** The profile editor is a full page; dialogs are for short confirmations and small forms.
6. **Keyboard-first.** ⌘K command palette, search focus on `/`, start/stop shortcuts on selected rows.
7. **Recoverable.** Everything destructive is soft-deleted or confirmed; logs are one click away.

### 8.2 Information architecture

```text
Zed IT Anti Browser
├─ Profiles
│  ├─ All profiles
│  ├─ Folders
│  ├─ Running
│  └─ Trash
├─ Proxies
├─ Fingerprint Lab
├─ Activity
└─ Settings
   ├─ General
   ├─ Engine
   ├─ License
   ├─ Appearance
   └─ About / Legal
```

### 8.3 Screen specifications

#### Onboarding / first run

A four-step wizard: activate license or start trial → choose storage location → download engine → create first profile. Each step shows progress and can be skipped only where safe. If the engine download fails, offer a mirror and a checksum link.

#### Profiles (home)

- Left sidebar: folders, running count, trash, tags, statuses. Collapsible.
- Top bar: search, filter chips, column chooser, density toggle, “New profile”, “Quick profile”.
- Table: checkbox, status dot, name, tags, folder, proxy (country flag + host), fingerprint (OS + seed prefix), last launched, row menu.
- Bulk bar appears when rows are selected: start, stop, assign proxy, tag, status, move, delete.
- Empty state: a single primary action plus a short “How profiles work” link.
- Error state: failed profiles are grouped at the top with a “Show log” action.

#### Profile editor

Full-page route with a sticky header: profile name, plan usage, Save, Save and start. Left section nav: General, Fingerprint, Cookies, Advanced. Right rail: live summary card with OS, seed, proxy country, generated values, and a “Check in Lab” button.

- **General:** name, folder, status, tags, notes, proxy selector, start pages, extensions (v1.1).
- **Fingerprint:** OS and version, brand/version, generated hardware card (CPU, RAM, GPU), timezone/locale/geo with auto/manual toggle, spoofing toggles, seed row with re-roll.
- **Cookies:** drag-and-drop or paste, format detection, validation summary, clear cookies.
- **Advanced:** command-line flags (validated against an allowlist), profile data path, danger zone.

#### Proxies

Table with label, protocol, host:port, country, latency, last check, assigned profiles, traffic. Row actions: test, edit, duplicate, delete. Bulk add opens a paste area with format hints and a preview. A “Check all” action runs a queue with progress.

#### Fingerprint Lab

Pick an existing profile or a temporary lab configuration. Launch, wait for capture, then show a two-column diff: expected, observed, status. Include a “What this means” explainer for each signal and a copy-report action. Gaps are shown honestly.

#### Settings / License

General: storage path, language, startup behavior. Engine: installed versions, update channel, download mirror. License: plan, devices, expiry, activation key masked, deactivate, refresh, purchase link, offline status. Appearance: dark/light/system, density. About: versions, notices, support, acceptable use.

### 8.4 Key flows

**First launch:** install → onboarding → trial or key → engine download → create profile → launch → lab prompt.

**Create and launch:** New profile → name + proxy → generate fingerprint → Save and start → browser opens → status turns running.

**Bulk import:** Profiles → Import → drop CSV → map columns → validate → assign proxy strategy → import → summary.

**Proxy failure:** Start → health check fails → dialog with exit IP/latency/error → edit proxy or launch without proxy (explicit confirmation) → log link.

**License expiry:** app opens read-only → banner explains grace/expiry → profiles can be exported and edited, launches blocked → activate or renew.



### 8.5 Component mapping

| Need | component |
|---|---|
| App shell | Custom sidebar using coss tokens and `ScrollArea` |
| Command palette | `Command` |
| Profile table | `Table` + TanStack Table; particle data-table pattern |
| Row actions | `Menu` |
| Tags and statuses | `Badge`, `Avatar` for favicon |
| Create/edit page | `Field`, `Fieldset`, `Form`, `Input`, `InputGroup`, `Select`, `Combobox`, `NumberField`, `Slider`, `Switch`, `SegmentedControl`, `Tabs`, `Textarea` |
| Confirmations | `AlertDialog` |
| Short forms | `Dialog` |
| Side panels | `Sheet` |
| Toasts | `Toast` / Sonner |
| Empty states | `Empty` |
| Loading | `Skeleton`, `Spinner` |
| Running resources | `Meter`, `Progress` |
| Tooltips | `Tooltip`, `Kbd` |
| Accordions in advanced settings | `Accordion`, `Collapsible` |

**Setup note:** coss UI's `init` preset is Next.js-oriented. In Vite, add the `@coss/style` tokens and components via the shadcn CLI, then wire Inter and Geist Mono with `@fontsource-variable` packages instead of `next/font`.

### 8.6 Accessibility and keyboard

- Full keyboard navigation; visible focus rings on dark and light.
- Table rows selectable with Space; Enter opens editor; `S` starts, `X` stops when a row is focused.
- `⌘K` / `Ctrl+K` command palette; `/` focuses search; `Esc` closes overlays.
- Screen-reader labels for status dots, proxy flags, and icon-only buttons.
- Minimum contrast 4.5:1 for text, 3:1 for large text and UI boundaries.
- Respect reduced motion and Windows high-contrast mode where feasible.

---

## 9. Technical architecture

### 9.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | Electron + Vite | Mature process management, native Windows packaging, fast iteration |
| Renderer | React 19 + TypeScript | Team familiarity; coss UI compatibility |
| Styling | Tailwind CSS v4 + Fluent UI v9 | Dense, modern component system with Fluent 2 theming |
| Data fetching | TanStack Query over typed IPC | Cache, retries, optimistic updates |
| Tables | TanStack Table | Virtualization, column visibility, sorting, selection |
| Forms | React Hook Form + Zod | Shared validation between UI and core |
| Core | TypeScript, no Electron imports | Testable, reusable for a future headless mode |
| Database | SQLite + Drizzle + better-sqlite3 | Local-first, migrations, no server |
| Secrets | Electron `safeStorage` + AES-256-GCM | OS-backed key encryption without extra native deps |
| Engine | fingerprint-chromium 150.0.7871.186 | Prebuilt, BSD-3, broad spoofing coverage |
| Packaging | electron-builder + NSIS | Windows installer, signing, auto-update |
| Updates | electron-updater | Signed updates, staged rollout |
| Tests | Vitest + Playwright for Electron | Core unit tests and end-to-end smoke tests |
| CI | GitHub Actions | Windows builds, Linux dev builds, engine fetch cache |

### 9.2 Process model

```text
┌────────────────────────────────────────────────────────────┐
│ Electron main process                                       │
│  • Window lifecycle, tray, single-instance lock             │
│  • IPC router (Zod-validated)                               │
│  • Core services: profiles, engine, proxy, fingerprint,     │
│    cookies, geo, licensing, settings                        │
│  • SQLite + encrypted secret storage                        │
└───────────────┬──────────────────────────────┬──────────────┘
                │ contextBridge                │ spawn
┌───────────────▼──────────────┐   ┌───────────▼──────────────┐
│ Renderer (sandboxed)         │   │ Patched Chromium          │
│ React + Fluent UI            │   │ per-profile user-data-dir │
│ No Node access               │   │ local proxy + CDP port    │
└──────────────────────────────┘   └──────────────────────────┘
```

The renderer never touches the filesystem or child processes. A typed preload bridge exposes only explicit commands and subscriptions. Core modules take paths and callbacks, not Electron globals.

### 9.3 Repository layout

```text
zed-it-anti-browser/
├─ apps/desktop/
│  ├─ electron/
│  │  ├─ main.ts
│  │  ├─ preload.ts
│  │  ├─ window.ts
│  │  └─ ipc/
│  ├─ src/
│  │  ├─ app/
│  │  ├─ features/profiles/
│  │  ├─ features/proxies/
│  │  ├─ features/lab/
│  │  ├─ features/settings/
│  │  ├─ components/ui/        # components/ui source
│  │  └─ lib/
│  └─ package.json
├─ packages/core/
│  ├─ db/
│  ├─ profiles/
│  ├─ engine/
│  ├─ fingerprint/
│  ├─ proxy/
│  ├─ cookies/
│  ├─ geo/
│  └─ licensing/
├─ packages/shared/            # Zod schemas, IPC contract, constants
├─ resources/
│  ├─ engines/                 # gitignored dev binaries
│  └─ hardware/                # CPU/RAM/GPU datasets
├─ scripts/fetch-engine.ts
├─ docs/
└─ package.json
```

### 9.4 Engine manager

- Engine manifest pins version, platform, URL, SHA-256, size, and release notes.
- Download with resume support, verify checksum, extract atomically to `%APPDATA%/ZedIT/AntiBrowser/engines/<version>/`.
- Keep the previous engine until the new one is verified. Allow rollback.
- Profiles store `engine_version`; upgrading is an explicit per-profile action because a new seed interpretation may change values.
- Mirror the exact binary in ZED IT-controlled storage so upstream removal cannot break installs.
- Include the upstream LICENSE and notices in the installer and About screen.

### 9.5 Launch sequence

1. Acquire a per-profile lock; refuse double launch.
2. Load profile and license; enforce plan limits and device activation.
3. Validate proxy; start the local bridge and reserve a loopback port.
4. Resolve geo → timezone/locale if set to auto.
5. Ensure the user-data-dir exists; write bookmarks if configured.
6. Compose fingerprint flags from the profile config and engine manifest.
7. Spawn the engine with `--remote-debugging-port=0` and `--remote-debugging-address=127.0.0.1`.
8. Wait for `DevToolsActivePort`, read the port, connect via CDP.
9. Seed cookies on `about:blank`.
10. Navigate to start pages; mark the profile running; emit status events.
11. Monitor the process; on exit, stop the bridge, release the lock, record the session.
12. On app start, reconcile stale sessions and kill orphaned bridges.

**Flag recipe**

```text
chrome.exe
  --user-data-dir="<storage>/profiles/<profile-id>"
  --fingerprint=<seed>
  --fingerprint-platform=windows
  --fingerprint-platform-version=10
  --fingerprint-brand=Chrome
  --fingerprint-brand-version=150
  --fingerprint-hardware-concurrency=8
  --lang=en-US
  --accept-lang=en-US,en
  --timezone=America/New_York
  --proxy-server="socks5://127.0.0.1:<bridge-port>"
  --disable-non-proxied-udp
  --no-first-run
  --no-default-browser-check
  --window-size=1920,1080
  --remote-debugging-port=0
  --remote-debugging-address=127.0.0.1
  --disable-features=Translate,MediaRouter
  <start pages>
```

Flags are composed from a typed config, not string concatenation from user input. User-supplied flags are validated against an allowlist and rejected with a message if unsupported.

### 9.6 Fingerprint generation

**Inputs:** OS, engine major, proxy geo, optional manual seed, plan defaults.

**Outputs:**

- 32-bit seed.
- Platform, platform version, brand, brand version.
- CPU cores and memory from the hardware table.
- Timezone, locale, and language from geo or manual override.
- WebRTC policy.
- Spoofing toggles supported by the engine version.
- A readable “generated values” block captured after first launch.

**Hardware tables:** JSON datasets of realistic combinations per OS. Rules include:

- macOS never pairs with NVIDIA.
- Apple Silicon uses ARM-appropriate cores and memory values.
- 2-core machines do not ship with 64 GB RAM.
- GPU list is filtered by OS and engine support.
- Screen presets are common real resolutions for the selected OS, even though v1 cannot force `screen.*`; they inform window sizing and future patches.

**Determinism:** same seed + same engine version = same generated values. A seed may produce different values after an engine upgrade; the UI warns before upgrading a profile and offers “keep current engine”.

**Read-back:** after launch, query a local diagnostic page or CDP `Runtime.evaluate` for a whitelist of values. Store a snapshot per profile. Do not run remote third-party scripts automatically.

### 9.7 Proxy bridge

Each running profile gets a loopback-only SOCKS5 listener:

- Chromium is launched with `--proxy-server=socks5://127.0.0.1:<port>` so DNS resolves through the proxy.
- The bridge connects upstream via HTTP CONNECT or SOCKS5, adding `Proxy-Authorization` when needed.
- Credentials never reach Chromium or the renderer.
- Byte counters per direction, per session, plus cumulative per profile.
- Proxy test performs a CONNECT to an IP echo endpoint through the same bridge, then enriches with country/city/timezone.
- The bridge stops when the profile stops; orphan cleanup runs on app start.
- No listening on `0.0.0.0`; reject non-loopback connections.

**Leak controls:** WebRTC non-proxied UDP disabled, DNS via proxy, QUIC disabled if it bypasses the proxy, and a lab check for host IP leakage. Document any residual leak risk honestly.

### 9.8 Cookies

- Parse Netscape and JSON formats in the core; normalize to a common shape.
- Launch to `about:blank`, connect CDP, call `Storage.setCookies`, then navigate.
- Validate domain, path, secure, HTTP-only, and expiry.
- Report skipped cookies with reasons.
- Clearing cookies is a core action, not a direct file edit.

### 9.9 Storage paths (Windows)

```text
%APPDATA%\ZedIT\AntiBrowser\
├─ data\app.db
├─ data\logs\
├─ engines\<version>\
├─ profiles\<profile-id>\
└─ backups\
```

The storage root is configurable in Settings. Moving storage requires the app to be closed and is validated before commit. Never store secrets in the SQLite file in plaintext.

### 9.10 IPC contract

- One typed channel per operation, grouped by domain: `profiles:*`, `proxies:*`, `engine:*`, `lab:*`, `license:*`, `settings:*`.
- Zod schemas in `packages/shared` are the single source of truth for input and output.
- Events for long-running state: `profiles:status-changed`, `proxies:check-progress`, `engine:download-progress`, `license:changed`.
- Renderer subscriptions are cleaned up on unmount.
- Errors return a stable code plus a human message and optional log path.

### 9.11 Performance targets

| Metric | Target |
|---|---|
| Cold app start | under 2.5 s on a mid-range Windows laptop |
| Warm profile launch | under 5 s including proxy check |
| Profiles list | 60 fps scroll with 1,000 rows, virtualized |
| Idle memory | under 300 MB for the app shell |
| Database write | under 50 ms for profile edits |
| Proxy check | under 5 s typical, 15 s timeout |
| Installer size | under 160 MB excluding downloaded engine |

---

## 10. Data model

### 10.1 Entity overview

```text
folders 1───* profiles *───1 proxies
                 │
                 ├──* profile_tags *──1 tags
                 ├──1 statuses
                 ├──* profile_sessions
                 ├──* profile_start_pages
                 └──* activity_log

settings (key/value)
engine_installations
licenses (local cache)
```

### 10.2 Tables

#### `profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `prf_` + UUIDv7 |
| `name` | text | Required, 1–120 chars |
| `folder_id` | text FK | Nullable |
| `status_id` | text FK | Default “Active” |
| `notes` | text | Nullable |
| `proxy_id` | text FK | Nullable |
| `os` | text | `windows`, `macos`, `linux`, `android` |
| `os_version` | text | e.g. `10`, `11`, `15.2.0` |
| `seed` | integer | 32-bit signed |
| `fingerprint_json` | text | Versioned config |
| `engine_version` | text | Pinned engine |
| `user_data_dir` | text | Absolute path |
| `start_pages_json` | text | Array of URLs |
| `flags_json` | text | Validated extra flags |
| `created_at` | text | ISO 8601 |
| `updated_at` | text | ISO 8601 |
| `last_started_at` | text | Nullable |
| `last_stopped_at` | text | Nullable |
| `launch_count` | integer | Default 0 |
| `deleted_at` | text | Nullable; trash |

Indexes: `folder_id`, `status_id`, `proxy_id`, `deleted_at`, `updated_at`.

#### `proxies`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `prx_` + UUIDv7 |
| `label` | text | User-facing |
| `protocol` | text | `http`, `https`, `socks5` |
| `host` | text | |
| `port` | integer | 1–65535 |
| `username` | text | Nullable |
| `password_enc` | text | AES-256-GCM blob |
| `country` | text | ISO code, cached |
| `city` | text | Cached |
| `timezone` | text | IANA, cached |
| `last_check_json` | text | Latency, exit IP, status |
| `created_at` | text | |
| `updated_at` | text | |

#### Other tables

| Table | Purpose | Key columns |
|---|---|---|
| `folders` | Organize profiles | `id`, `name`, `parent_id`, `sort_order` |
| `tags` | Label profiles | `id`, `name`, `color` |
| `profile_tags` | Many-to-many | `profile_id`, `tag_id` |
| `statuses` | Profile lifecycle labels | `id`, `name`, `color`, `is_default` |
| `profile_sessions` | Launch history | `id`, `profile_id`, `pid`, `cdp_port`, `bridge_port`, `started_at`, `ended_at`, `exit_code` |
| `profile_start_pages` | Ordered URLs | `profile_id`, `url`, `sort_order` |
| `engine_installations` | Installed engines | `version`, `path`, `sha256`, `installed_at` |
| `activity_log` | Local audit trail | `id`, `profile_id`, `action`, `meta_json`, `created_at` |
| `settings` | App settings | `key`, `value` |
| `licenses` | Cached activation | `key_hash`, `token`, `plan`, `expires_at`, `last_validated_at`, `machine_hash` |

### 10.3 Fingerprint config (v1)

```json
{
  "schemaVersion": 1,
  "seed": 1287349192,
  "platform": "windows",
  "platformVersion": "10",
  "brand": "Chrome",
  "brandVersion": "150",
  "hardware": {
    "cpuCores": 8,
    "memoryGb": 16,
    "gpuVendor": "Google Inc. (Intel)",
    "gpuRenderer": "ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)"
  },
  "screen": {
    "mode": "host",
    "width": null,
    "height": null,
    "deviceScaleFactor": null
  },
  "timezone": { "mode": "auto", "value": null },
  "locale": { "mode": "auto", "value": null },
  "geolocation": { "mode": "auto", "latitude": null, "longitude": null },
  "webrtc": { "mode": "proxied" },
  "spoofing": {
    "canvas": true,
    "audio": true,
    "fonts": true,
    "clientRects": true,
    "gpu": true
  },
  "extras": {
    "doNotTrack": false,
    "blockedPorts": []
  }
}
```

The schema is versioned. Migrations transform old configs into the current version without losing the original seed.

### 10.4 Data lifecycle

- Profiles are soft-deleted for 48 hours; user-data-dirs are not removed until permanent deletion.
- On permanent delete, remove the database row, user-data-dir, and cached fingerprint snapshots.
- Export produces metadata and a manifest; profile folder export is a v1.1 feature.
- Backups are manual in v1; automatic encrypted backups are v1.2.

---

## 11. Licensing and monetization

The product is sold as **license keys**, not a subscription account. This keeps v1 local-first and avoids building a full SaaS control plane. A small activation service is still required for device limits, revocation, renewals, and trial abuse prevention.

### 11.1 License model

| Plan | Profiles (stored) | Devices | Concurrent launches | Price hypothesis |
|---|---|---|---|---|
| Trial | 5 | 1 | 3 | Free, 7 days, one per device |
| Starter | 10 | 1 | Unlimited | $9/mo or $79/yr |
| Pro | 50 | 2 | Unlimited | $29/mo or $249/yr |
| Agency | 200 | 5 | Unlimited | $79/mo or $699/yr |
| Enterprise | 500+ | Custom | Custom | From $149/mo |

- “Profiles” means stored profiles. Running profiles are limited only by the machine.
- Annual pricing includes roughly two months free.
- Profile add-ons can be introduced later; v1 keeps plans simple.
- A limited “Founder” lifetime key (100 profiles, 3 devices) may be offered to the first 100 customers at $199 to fund launch. Cap it tightly and disclose support expectations.

### 11.2 Key format

```text
ZITA-7F3K-9Q2M-XB4T
```

- Prefix `ZITA`.
- Four groups of four Crockford Base32 characters.
- Final character is a checksum to catch typos before a network call.
- The key does not encode plan or expiry; the server maps it to a license record. This allows upgrades and replacements without reissuing a new format.

### 11.3 Activation flow

1. User enters a key in the app or starts a trial.
2. App computes a **machine hash**: stable install UUID + Windows MachineGuid + volume serial, hashed with SHA-256. Raw hardware identifiers never leave the machine.
3. App calls `POST /v1/activate` with key, machine hash, app version, and OS.
4. Server validates key status, plan, expiry, and device slots; binds the machine hash; returns an ES256-signed JWT.
5. App verifies the token with the embedded public key and stores it encrypted via Electron `safeStorage`.
6. App revalidates every 7 days or on launch when online; 14-day offline grace with a visible countdown.
7. Deactivation releases the slot; self-service limit of 2 resets per month.
8. Expired or revoked licenses put the app in read-only mode: profiles remain editable/exportable, launches are blocked.

### 11.4 Token claims

```json
{
  "sub": "lic_01J...",
  "key": "ZITA-****-****-****-XB4T",
  "plan": "pro",
  "profiles": 50,
  "devices": 2,
  "machine": "sha256:...",
  "features": ["profiles", "proxies", "lab", "cookie-import"],
  "iat": 1763942400,
  "exp": 1765152000,
  "iss": "license.zedit.app",
  "ver": 1
}
```

Signed with ES256; public key shipped in the app. No shared HMAC secret in the client.

### 11.5 License service

Build a small Cloudflare Worker with Hono + D1, matching the existing ZED IT stack:

| Endpoint | Purpose |
|---|---|
| `POST /v1/activate` | Bind a machine and issue a token |
| `POST /v1/validate` | Refresh a token and check revocation |
| `POST /v1/deactivate` | Release a device slot |
| `GET /v1/license/:key` | Accountless lookup for the license portal |
| `POST /v1/webhooks/payment` | Auto-issue keys on successful purchase |
| `POST /v1/admin/licenses` | Issue, extend, revoke, and replace keys |
| `GET /v1/admin/licenses` | Search and export |
| `GET /v1/admin/activations` | Device and usage view |

Admin access is protected by Clerk or a signed admin token; audit every mutation. Use Resend or a similar provider for key delivery.

### 11.6 Payments

- **International:** Paddle or Lemon Squeezy as merchant of record. They handle VAT and accept sellers in more jurisdictions than Stripe. Confirm Bangladesh eligibility before launch.
- **Local:** manual bKash/Nagad/bank transfer with a short-lived invoice and manual key issuance, or a local payment gateway if available.
- **Crypto:** optional USDT for customers who need it; keep records and comply with processor rules.
- **Payouts:** Payoneer/Wise for international receipts; local bank for domestic.

Do not build a custom card processor. The margin does not justify the compliance burden.

### 11.7 Anti-piracy

- Signed tokens and server-side device binding.
- No permanent offline license that can be copied to unlimited machines.
- Clock-rollback detection using last-seen server time plus a monotonic counter.
- Electron hardening: fuses, ASAR integrity, no devtools in release, obfuscation of license checks.
- Revocation list checked on revalidation.
- Accept that a determined attacker can patch the client; optimize for honest users and support, not perfect DRM.

### 11.8 License UX

- Activation is skippable with a trial; never block first-run evaluation with a purchase wall.
- Show plan, profiles used, devices used, expiry, and offline days in the status bar.
- “Manage license” opens a portal where the user can look up by key + email, deactivate a device, download invoices, and renew.
- Clear copy for expired, revoked, wrong-device, and offline-grace states with next actions.

---

## 12. Security and privacy

### 12.1 Threat model

| Threat | Impact | Control |
|---|---|---|
| Stolen laptop exposes profiles | Account compromise | OS account security; optional app lock in v1.1; encrypted secrets; profile folders protected by OS permissions |
| Proxy credentials leak in logs | Credential theft | Encrypted at rest, redacted logs, reveal requires confirmation |
| License key sharing | Revenue loss | Device binding, activation limits, revocation |
| Tampered client bypasses licensing | Revenue loss | Signed tokens, hardening, periodic server checks |
| Malicious proxy operator | Traffic interception | TLS validation remains on; warn on HTTP proxies; never disable certificate checks |
| Update supply-chain attack | Full compromise | Code signing, checksummed engine, HTTPS-only manifests, staged rollout |
| Local malware reads SQLite | Data theft | Secrets encrypted; optional full-DB encryption later; OS-level protection |
| Renderer compromise via malicious page | App compromise | Sandbox, contextIsolation, no Node in renderer, strict CSP, external links in system browser |

### 12.2 Privacy commitments

- Browsing history, URLs, cookies, and proxy credentials never leave the device.
- License server receives: key, plan, machine hash, app version, OS, timestamps. No browsing data.
- Telemetry is off by default. If added, it is opt-in, aggregated, and documented.
- Crash reports are opt-in and scrubbed of paths and keys.
- The app works offline for 14 days after activation; core profile management never requires the network.
- A plain-language privacy policy ships with the installer and website.

### 12.3 Electron hardening

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Preload exposes a narrow, typed API; no `remote` module.
- Block new-window creation from renderer content; open external links via `shell.openExternal` after URL validation.
- Strict Content Security Policy for the renderer.
- Validate all IPC input with Zod; never pass raw paths from renderer without normalization.
- Disable devtools in release builds; enable via a signed debug flag only.
- Single-instance lock to prevent database corruption.

### 12.4 Acceptable use and legal

- Publish an Acceptable Use Policy, Terms of Service, Privacy Policy, and Refund Policy before selling keys.
- Require AUP acceptance at activation.
- Define a revocation process for abuse and chargebacks.
- State that the product does not guarantee bypassing any platform's rules; users are responsible for compliance with platform terms and local law.
- Choose a selling entity and jurisdiction with input from local counsel. ZED IT Bangladesh can sell locally; an international entity or merchant-of-record handles global sales.

---

## 13. Delivery plan

### 13.1 Team assumption

- 1 full-time product engineer (Electron/React/Node).
- 0.5 designer (brand, UI polish, assets).
- 0.5 QA/community/support during beta.
- Engine/build consultant as needed from v1.1.

### 13.2 Timeline

Assuming start the week of 24 November 2026.

| Week | Dates | Deliverable | Exit criteria |
|---|---|---|---|
| 0 | Nov 24–28 | Engine and proxy spike | Capability matrix documented; proxy bridge proof; Google login/extension check; go/no-go |
| 1 | Dec 1–5 | Foundation | Monorepo, Electron shell, coss UI theme, SQLite schema, IPC, window and navigation |
| 2 | Dec 8–12 | Profiles CRUD | Create/edit/delete/copy, folders, tags, statuses, search; engine manager; launch/stop vanilla engine |
| 3 | Dec 15–19 | Fingerprint v1 | Seed generation, hardware tables, flags, timezone/locale from proxy, first browser verification |
| 4 | Dec 22–26 | Proxy + cookies | Local bridge, auth, checks, traffic counters, cookie import, lab capture |
| 5 | Dec 29–Jan 2 | UX parity | Bulk actions, CSV import, column chooser, trash, activity log, empty/error states |
| 6 | Jan 5–9 | Fingerprint editor + lab | Read-back, editor tabs, expected/observed diff, export report |
| 7 | Jan 12–16 | Licensing | Worker + D1, activation, trial, offline grace, plan limits, license portal |
| 8 | Jan 19–23 | Hardening | Crash recovery, orphan cleanup, log redaction, performance, accessibility pass |
| 9 | Jan 26–30 | Release candidate | Installer, signing, auto-update, clean-VM tests, docs, website |
| 10 | Feb 2–6 | Private beta | 20 users, feedback triage, blocker fixes |
| 11–13 | Feb 9–27 | Beta hardening | Detection checks, support docs, payment flow, refund/AUP, launch assets |
| 14 | Mar 2–6 | Public launch | Waitlist, affiliate, proxy partners, launch posts |

**Realistic range:** 10 weeks to a private beta, 13–14 weeks to public launch with a small team. Add 2–3 weeks if the Week 0 matrix forces an owned patch build.

### 13.3 Week 0 spike details

1. Download the pinned Windows and Linux builds. Verify SHA-256.
2. Launch with a matrix of seeds, OS values, and proxies.
3. Test against BrowserLeaks, CreepJS, PixelScan, and a manual page that reports `screen`, `deviceMemory`, media devices, and WebRTC.
4. Record observed versus expected in a spreadsheet. Mark every gap.
5. Build a 200-line SOCKS5 bridge with upstream auth; test HTTP and SOCKS5 upstreams, DNS behavior, and WebRTC leaks.
6. Test Google sign-in, a Chrome Web Store extension install, and a DRM video sample on the ungoogled base.
7. Decide: proceed with prebuilt, pin an older engine, or start the owned patch build.

### 13.4 Definition of done (v1)

- A new user can activate a trial, create a profile with a proxy, launch it, and pass a documented fingerprint check without crashes.
- Cookies persist across restarts; stop/start is clean; no orphan processes after five launch cycles.
- Bulk import of 50 profiles works with row-level errors.
- A license can be activated on two devices, deactivated on one, and expires into read-only mode correctly.
- The Windows installer is signed, installs on a clean VM, and auto-updates from the previous build.
- The app meets the performance targets in 9.11.
- Every P0 requirement has a test or a documented manual check.
- Brand assets, legal pages, docs, and support channels are live.

### 13.5 Post-v1 roadmap

- **v1.1:** screen/media/GPU patch build, public local API (Dolphin-compatible shape), cookie export, profile ZIP export/import.
- **v1.2:** team accounts, cloud sync (E2E encrypted), templates, bulk editing, remote stop, activity audit.
- **v1.3:** MCP server, Playwright/Puppeteer helpers, script builder, cookie robot.
- **v2.0:** mobile/cloud profiles, proxy resale partnerships, marketplace.

---

## 14. Business and go-to-market

### 14.1 Revenue model

License keys with annual and monthly options. No mandatory account. The license portal is lookup-based, not a full SaaS dashboard.

**Why keys:** lower build cost, works with affiliates and resellers, easy local payments, and it matches how many anti-detect customers already buy.

**Guardrails:** device binding, plan limits, revocation, and a support policy that treats keys as licenses, not bearer tokens.

### 14.2 Pricing strategy

- Entry price undercuts Dolphin Starter and GoLogin Professional while offering a more focused UI.
- The Pro tier targets the 50-profile gap where competitors jump to $89–$99.
- Agency undercuts Dolphin Base ($89/100) with 200 profiles at $79.
- Annual plans carry a 20% discount; lifetime founder keys are limited and time-boxed.
- Raise prices after beta only with a grandfather clause for existing customers.

### 14.3 Payment and billing operations

- International: Paddle or Lemon Squeezy (merchant of record). Apply early; approval can take weeks.
- Local: bKash/Nagad with manual key delivery and a proper invoice; automate later if volume justifies it.
- Refunds: 7-day refund for first purchase, excluding abuse and used profile limits; publish the policy.
- Chargebacks: revoke the key and log the device; do not pursue small amounts aggressively.
- Taxes: rely on the merchant of record for international VAT; consult local counsel for Bangladesh.

### 14.4 Go-to-market channels

| Channel | Play | Success signal |
|---|---|---|
| ZED IT audience | Email, existing students/clients, social channels | 100 waitlist signups in week 1 |
| Proxy partners | Revenue share or bundle with residential/ISP providers | 2 signed partners before launch |
| Affiliates | 25–30% recurring commission; unique keys | 10 active affiliates by month 3 |
| YouTube | Setup tutorials, fingerprint tests, Dolphin comparison | 3 videos, 10k views combined |
| Telegram/Facebook groups | South Asia and SEA operator communities; value-first posts | 500 community members |
| SEO | “Zed IT vs Dolphin”, “anti detect browser for 50 profiles”, setup guides | 20 keywords ranking by month 6 |
| Product Hunt / directories | Launch with founder pricing | Top-5 daily product |
| Agency outreach | Direct demos for 20 small agencies | 5 paid conversions |

### 14.5 Launch sequence

1. **Waitlist landing page** with pricing, screenshots, and a fingerprint test report.
2. **Private beta** with 20 operators; collect detection results and launch failures.
3. **Founder keys** limited to 100, lifetime, 100 profiles, clear support terms.
4. **Public beta** with monthly keys and a 7-day trial.
5. **Partnerships** with 2 proxy providers and 5 affiliates.
6. **Case studies** with real users (with consent), focused on time saved and profile stability.
7. **Version 1.1** patch build and API to convert power users.

### 14.6 Support model

- Telegram community plus email support at launch.
- 12-hour response target on business days; 24-hour on weekends.
- In-app “Send diagnostics” bundles logs with secrets redacted.
- Docs: getting started, proxy setup, fingerprint guide, license management, troubleshooting.
- Languages: English and Bangla at launch; Hindi/Vietnamese when demand appears.
- Refund and AUP enforcement are documented, not ad hoc.

### 14.7 Unit economics (hypothesis)

| Item | Per Pro customer / month |
|---|---|
| Revenue | $29.00 |
| Payment/merchant fees | ~$1.45 (5%) |
| License infrastructure | ~$0.10 |
| Update/download bandwidth | ~$0.30 |
| Support allocation | ~$2.00 |
| Gross margin | ~$25.15 (87%) |

The model works if support stays under ~10 minutes per customer per month. Docs and in-app diagnostics are the lever.

---

## 15. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Engine gaps make fingerprints weaker than competitors | High | High | Week 0 matrix; honest UI; v1.1 patch build; target sites tested before launch |
| Upstream engine stalls or removes builds | Medium | High | Mirror binaries and checksums; own patch pipeline; keep source notices |
| Google login or DRM fails on ungoogled Chromium | Medium | High | Test in Week 0; disclose limitations; evaluate a branded Chromium build |
| Detection improves faster than patches | High | High | Continuous lab tests; quarterly engine update; prioritize the top 10 target sites |
| License piracy | Medium | Medium | Signed tokens, device binding, hardening; optimize for honest users; do not overbuild DRM |
| Windows SmartScreen blocks installs | High | High | Code-signing certificate, staged downloads, reputation warm-up, checksum page |
| Support load exceeds capacity | Medium | Medium | Docs, in-app diagnostics, community, 12-hour SLA, tiered support |
| Legal/AUP issues | Medium | High | Clear AUP, counsel-reviewed terms, revocation, merchant-of-record compliance |
| Scope creep delays launch | High | High | Freeze v1 scope; park API/team/script ideas in v1.1+ |
| Data loss from crashes | Medium | High | Atomic DB writes, WAL, profile lock, orphan cleanup, backups, export |
| Brand trust gap vs Dolphin | High | Medium | Transparent test reports, beta case studies, real support, no overclaiming |
| Payment approval delays | Medium | High | Apply to two processors early; local manual sales as fallback |

---

## 16. Success metrics

### Product

- Activation success rate: > 95%.
- Profile launch success rate: > 98% excluding bad proxies.
- Crash-free sessions: > 99.5%.
- Median launch time: < 5 seconds.
- Fingerprint Lab pass rate on supported signals: > 90% across the top 10 test sites.
- Orphan process rate after stop: 0.

### Business

- Waitlist → trial conversion: > 25%.
- Trial → paid conversion: > 8%.
- 30-day retention of paid customers: > 80%.
- Monthly churn: < 6%.
- Support first response: < 12 business hours.
- Refund rate: < 5%.
- Affiliate-driven revenue share: > 25% by month 6.

### Quality gates before public launch

- 20 beta users with at least 10 active weekly.
- 5 documented detection tests across target sites.
- No P0 bugs open for 7 consecutive days.
- License activation and expiry tested on a clean Windows VM.
- Installer signed and auto-update verified.

---

## 17. Launch checklist

### Product and engine

- [ ] Week 0 capability matrix signed off
- [ ] Pinned engine versions mirrored with SHA-256
- [ ] Engine license and notices included
- [ ] Profile create/edit/copy/delete tested on clean Windows
- [ ] Proxy bridge tested with HTTP and SOCKS5 upstreams
- [ ] WebRTC, DNS, and IP leak checks pass
- [ ] Cookie import tested with Netscape and JSON
- [ ] Fingerprint Lab reports match manual checks
- [ ] 50-profile CSV import tested
- [ ] Crash recovery and orphan cleanup tested
- [ ] App lock or profile password decision recorded for v1.1

### Licensing and billing

- [ ] License Worker deployed with D1 and KV
- [ ] Trial abuse controls tested
- [ ] Offline grace and clock rollback tested
- [ ] Device deactivation works
- [ ] Plan limits enforced
- [ ] Payment webhook issues keys
- [ ] Refund/revocation runbook written
- [ ] License portal live

### Windows release

- [ ] Code-signing certificate acquired
- [ ] Installer and uninstaller tested
- [ ] SmartScreen behavior documented
- [ ] Auto-update from previous build tested
- [ ] App icon, splash, About, and installer art final
- [ ] Windows Defender scan clean
- [ ] Clean-VM smoke test recorded

### Brand, legal, and support

- [ ] ZD mark, product lockups, and app icon finalized
- [ ] Website with pricing, screenshots, and test report
- [ ] Terms, Privacy, AUP, Refund policies reviewed
- [ ] Docs: getting started, proxies, fingerprints, licensing, troubleshooting
- [ ] Telegram and email support channels live
- [ ] 3 tutorial videos or GIFs
- [ ] 20 beta testers recruited
- [ ] 2 proxy partners confirmed
- [ ] Launch posts and affiliate kit ready

---

## 18. Open decisions

| # | Decision | Why it matters | Needed by |
|---|---|---|---|
| 1 | Final tagline: “Blend in. Scale out.” vs “One browser. Many identities.” | Brand system and website copy | Week 1 |
| 2 | Final plan names, limits, and prices | License server config and website | Week 2 |
| 3 | Engine update policy: pin + quarterly vs auto-update | Fingerprint stability vs security | Week 2 |
| 4 | Build screen/media patch in v1.1 or earlier | Competitive parity | End of Week 0 |
| 5 | Accountless activation vs email accounts | License service scope | Week 2 |
| 6 | Payment provider: Paddle vs Lemon Squeezy vs both | International sales | Week 1 |
| 7 | Selling entity and jurisdiction | Taxes, contracts, refunds | Week 2 |
| 8 | Bangla localization at launch | Support reach | Week 4 |
| 9 | Founder lifetime key: yes/no and cap | Launch cash flow vs long-term margin | Week 6 |
| 10 | Public API timeline | Power-user retention | After beta |
| 11 | Whether to offer a Linux release publicly in v1 | Support burden vs demand | Week 8 |
| 12 | Telemetry: none vs opt-in crash reports | Debugging vs privacy promise | Week 3 |

---

## 19. Appendices

### A. Engine flags reference

| Flag | Purpose | v1 use |
|---|---|---|
| `--fingerprint` | 32-bit seed enabling most spoofing | Required |
| `--fingerprint-platform` | OS identity | Required |
| `--fingerprint-platform-version` | OS version | Required |
| `--fingerprint-brand` | Browser brand in UA and Client Hints | Required |
| `--fingerprint-brand-version` | Brand version | Required |
| `--fingerprint-hardware-concurrency` | CPU core count | Required |
| `--lang` | UI language | Required |
| `--accept-lang` | Accept-Language header | Required |
| `--timezone` | IANA timezone | Required |
| `--proxy-server` | Proxy address | Required (local bridge) |
| `--disable-non-proxied-udp` | WebRTC leak protection | Default on |
| `--disable-spoofing` | Disable selected spoofing | Optional toggles |
| `--user-data-dir` | Isolated profile data | Required |
| `--remote-debugging-port` | Internal CDP | `0` |
| `--remote-debugging-address` | Bind CDP to loopback | `127.0.0.1` |
| `--no-first-run` | Skip first-run UI | Required |
| `--no-default-browser-check` | Skip default browser prompt | Required |
| `--window-size` | Initial window size | Optional |
| `--disable-features` | Disable noisy features | Curated allowlist |

### B. Sample profile export

```json
{
  "name": "Client A — Facebook 01",
  "os": "windows",
  "osVersion": "10",
  "seed": 1287349192,
  "proxy": { "protocol": "socks5", "host": "203.0.113.10", "port": 1080, "label": "US residential" },
  "timezone": "America/New_York",
  "locale": "en-US",
  "startPages": ["https://www.facebook.com"],
  "tags": ["facebook", "client-a"],
  "notes": "Warmed 7 days. Do not change proxy."
}
```

### C. Sample license token claims

```json
{
  "iss": "license.zedit.app",
  "sub": "lic_01J8Z9K4T3",
  "aud": "zed-it-anti-browser",
  "plan": "pro",
  "profiles": 50,
  "devices": 2,
  "features": ["profiles", "proxies", "lab", "cookie-import"],
  "machine": "sha256:9b2c...",
  "iat": 1763942400,
  "exp": 1765152000,
  "ver": 1
}
```

### D. Reference links

- Dolphin Anty documentation — https://docs.dolphin-anty.com/
- Dolphin Anty pricing — https://dolphin-anty.com/pricing/
- fingerprint-chromium — https://github.com/adryfish/fingerprint-chromium
- coss UI — https://coss.com/ui
- coss UI docs — https://coss.com/ui/docs
- Base UI — https://base-ui.com/
- Electron security checklist — https://www.electronjs.org/docs/latest/tutorial/security
- GoLogin pricing — https://gologin.com/pricing/
- AdsPower pricing — https://www.adspower.com/pricing
- Multilogin pricing — https://multilogin.com/pricing/

### E. Glossary

| Term | Meaning |
|---|---|
| Anti-detect browser | A browser or manager that isolates profiles and spoofs device/network signals |
| Fingerprint | The set of browser and device properties a site can observe |
| Seed | A number that deterministically drives generated fingerprint values |
| Profile | An isolated browser identity with its own data directory and settings |
| User-data-dir | Chromium's per-profile storage folder |
| CDP | Chrome DevTools Protocol, used internally for diagnostics and cookie seeding |
| Proxy bridge | A local forwarder that adds upstream proxy authentication and meters traffic |
| WebRTC leak | A path where a site learns the real IP despite a proxy |
| Coherence | Whether spoofed values agree with each other and with real hardware |
| Merchant of record | A payment provider that handles sales tax and compliance on your behalf |

---

**Document status:** Draft for approval. Once approved, the next action is the Week 0 engine and proxy spike, followed by the foundation sprint. All pricing, plan limits, and launch dates are hypotheses to validate with beta users.

*Zed IT Anti Browser — Blend in. Scale out.*
