# Week 0 Engine & Proxy Spike Report

**Date:** 2026-11-23T10:13:15.153Z  
**Engine:** `fingerprint-chromium` `150.0.7871.186` (`linux-x64`)  
**SHA-256:** `48eff860053efd9ad498d51370f0a1f59f983df39c02a72ad2a8682cdead4055`  
**Host:** linux x64 (Node v22.22.1)  

---

## 1. Executive Decision

- **Determinism (Case 1 vs Case 2):** PASS
- **Seed & OS Variation (Case 1 vs Case 3 vs Case 4):** PASS
- **`--disable-spoofing` Toggle Effect (Case 1 vs Case 5):** PASS
- **Loopback SOCKS5 Proxy Bridge E2E + Remote DNS + No WebRTC Host IP Leak (Case 6):** PASS
- **Recommendation:** **GO for Week 1 Foundation on pinned fingerprint-chromium 150.0.7871.186**

---

## 2. Launch Summary

| Case | Launch (ms) | Exit Code | `--no-sandbox` fallback | UA | Platform | CPU | Memory (GB) | Timezone | Language |
|---|---:|---:|---|---|---|---:|---:|---|---|
| `win10-seed-a` | 1892 | 0 | Yes | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36` | `Win32` | 8 | 16 | `America/New_York` | `en-US` |
| `win10-seed-a-repeat` | 2577 | 0 | Yes | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36` | `Win32` | 8 | 16 | `America/New_York` | `en-US` |
| `win11-seed-b` | 1662 | 0 | Yes | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36` | `Win32` | 16 | 8 | `Europe/London` | `en-GB` |
| `macos-seed-c` | 1894 | 0 | Yes | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36` | `MacIntel` | 10 | 16 | `Asia/Dhaka` | `en-US` |
| `win10-seed-a-spoofing-off` | 1663 | 0 | Yes | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36` | `Win32` | 8 | 16 | `America/New_York` | `en-US` |
| `proxy-bridge-e2e` | 1465 | 0 | Yes | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36` | `Win32` | 8 | null | `America/New_York` | `en-US` |

---

## 3. Signal Verification Matrix (Expected vs Observed)

| Signal | Case 1 (`win10-seed-a`) | Case 2 (`win10-seed-a-repeat`) | Case 3 (`win11-seed-b`) | Case 4 (`macos-seed-c`) | Case 5 (`spoofing-off`) | Status |
|---|---|---|---|---|---|---|
| `navigator.webdriver` | `false` | `false` | `false` | `false` | `false` | Supported (`false`) |
| `navigator.platform` | `Win32` | `Win32` | `Win32` | `MacIntel` | `Win32` | Supported |
| `userAgentData.platform` / `platformVersion` | `Windows` / `10` | `Windows` / `10` | `Windows` / `11` | `macOS` / `15.2.0` | `Windows` / `10` | Supported |
| `hardwareConcurrency` | 8 | 8 | 16 | 10 | 8 | Supported |
| `deviceMemory` | 16 | 16 | 8 | 16 | 16 | Seed-derived |
| `Intl` timezone | `America/New_York` | `America/New_York` | `Europe/London` | `Asia/Dhaka` | `America/New_York` | Supported |
| `navigator.language` | `en-US` | `en-US` | `en-GB` | `en-US` | `en-US` | Supported |
| Canvas hash | `c81277fb` | `c81277fb` | `871427b2` | `4b41127b` | `b0855518` | Deterministic |
| Audio hash | `692bc4c1` | `692bc4c1` | `f568d236` | `692bc4c1` | `a6b795dc` | Deterministic |
| WebGL unmasked vendor | `Google Inc. (NVIDIA)` | `Google Inc. (NVIDIA)` | `Google Inc. (AMD)` | `Google Inc. (Apple)` | `Google Inc. (AMD)` | Seed-derived |
| WebGL unmasked renderer | `ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 (0x00002D05) Direct3D11 vs_5_0 ps_5_0, D3D11)` | `ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 (0x00002D05) Direct3D11 vs_5_0 ps_5_0, D3D11)` | `ANGLE (AMD, AMD Radeon 780M Graphics (0x00001900) Direct3D11 vs_5_0 ps_5_0, D3D11)` | `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)` | `ANGLE (AMD, AMD Radeon Vega 3 Graphics (radeonsi raven ACO), OpenGL ES 3.2)` | Seed-derived |
| WebGL image hash | `a5eafa56` | `a5eafa56` | `121fecda` | `e1e8c18e` | `6f1f3dc5` | Deterministic |
| ClientRects hash | `82fb9f8b` | `82fb9f8b` | `316e9dc4` | `99fd2874` | `237cb681` | Deterministic |
| Fonts hash | `5c7d61e2` | `5c7d61e2` | `c147afc6` | `e817a5da` | `0dd834d7` | Deterministic |
| `screen.width x height` | 1920x1080 (win 1342x566) | 1920x1080 | 1920x1080 (win 1920x871) | 1920x1080 (win 1416x698) | 1920x1080 | **Gap (host screen)** |
| `mediaDevices` | avail=true, count=2 | avail=true, count=2 | avail=true, count=2 | avail=true, count=2 | avail=true, count=2 | **Gap (host devices)** |
| WebRTC host IPs | [] | [] | [] | [] | [] | No host IP leak |

---

## 4. Proxy Bridge End-to-End Proof (Case 6)

- **Origin observed in Chromium:** `http://probe.zita.test:32919`
- **Mock HTTP CONNECT upstream requests:** ["probe.zita.test:32919 auth=true"]
- **ProxyBridge stats:** `bytesUp=842`, `bytesDown=21480`, `totalConnections=1`, `activeConnections=0`
- **WebRTC host IPs during proxied launch:** []
- **WebRTC srflx IPs during proxied launch:** []

---

## 5. Verified Gaps & v1 UI Implications

1. **Screen resolution (`screen.width` / `screen.height`):** Reports host screen dimensions (1920x1080); `--window-size` sets viewport/outer window only. v1 UI must not claim to spoof `screen.*`; plan owned patchset for v1.1.
2. **Media devices (`navigator.mediaDevices`):** Host device count/kinds remain visible in secure contexts. v1 UI must label as "Not spoofed in v1 engine".
3. **Manual WebGL vendor/renderer strings:** Removed in Chromium 144+; values are derived from seed (or disabled via `--disable-spoofing=gpu`). v1 UI exposes GPU spoofing toggle + read-back after first launch rather than arbitrary string inputs.
4. **Device memory:** Derived from seed rather than an explicit CLI flag; capture and display observed value via read-back.
