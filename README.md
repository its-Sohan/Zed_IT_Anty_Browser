# Zed IT Anti Browser

*Blend in. Scale out.*

Local-first anti-detect browser manager built by **ZED IT Bangladesh** using Electron, Vite, React 19, Tailwind CSS v4, Base UI, SQLite + Drizzle, and pinned `fingerprint-chromium` (`150.0.7871.186`).

## Monorepo Layout

- `apps/desktop/` — Electron + Vite + React renderer desktop app
- `packages/shared/` — Zod schemas, IPC contracts, and shared types
- `packages/core/` — Pure TypeScript core (SQLite/Drizzle, proxy SOCKS5 bridge & checker, fingerprint generator & hardware tables, cookies parser/CDP seeder, CSV import/export, launcher, licensing)
- `services/license-worker/` — Cloudflare Worker + Hono + D1 activation & admin API
- `resources/engines/` — Pinned `fingerprint-chromium` manifest and downloaded engine binaries
- `resources/hardware/` — OS-coherent hardware preset datasets

## Commands

```bash
pnpm install
pnpm engine:fetch -- --record-sha256   # Download & verify pinned Chromium engine
pnpm typecheck                          # Typecheck all packages, desktop, and worker
pnpm test                               # Run unit & integration tests (via Electron Node ABI)
pnpm spike:verify                       # Run Week 0 live browser verification spike
pnpm dev:desktop                        # Launch desktop app in dev mode
pnpm build:desktop                      # Build Electron main, preload, and renderer
pnpm build:win                          # Build Windows amd64 NSIS installer (.exe)
pnpm build:linux                        # Build Linux x86_64 AppImage (.AppImage)
```
