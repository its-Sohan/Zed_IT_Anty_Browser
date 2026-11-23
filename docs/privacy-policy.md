# Privacy Policy — Zed IT Anti Browser

**Effective Date:** 23 November 2026  
**Owner:** ZED IT Bangladesh

## Local-First Commitment
- Browsing history, cookies, passwords, profile configurations, and proxy credentials remain strictly on your device inside `%APPDATA%\ZedIT\AntiBrowser` (or your configured storage directory).
- Proxy passwords are encrypted at rest using OS-backed `safeStorage` + AES-256-GCM.
- Telemetry is **off by default**.

## License Activation Data
When activating or revalidating a license key, only the following fields are transmitted to the license service:
- License key (hashed/matched server-side)
- Privacy-preserving SHA-256 machine hash (`sha256:...` — raw hardware identifiers never leave your machine)
- App version, OS platform, and validation timestamps
