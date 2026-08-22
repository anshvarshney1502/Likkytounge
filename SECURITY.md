# Security Policy

## Reporting a vulnerability

If you discover a security issue, please open a **private** report via the repository's security advisory feature, or contact the maintainers directly rather than filing a public issue. Include reproduction steps and affected versions. We aim to acknowledge reports promptly.

## Security design principles

- **No remote code / no eval.** The extension bundles all code at build time and has zero runtime dependencies.
- **Least privilege.** We request only `storage`, `scripting`, `activeTab`, and host permissions for the supported AI domains. We deliberately avoid `<all_urls>`.
- **No security bypasses.** The extension never attempts to bypass Chrome restrictions, CSP, authentication, DRM, CORS, or website security. If a resource cannot be accessed through normal browser APIs, it is reported as unavailable.
- **Passive content script.** The content script only acts in response to explicit messages from the extension's own popup/background. It does not observe or exfiltrate anything on its own.
- **Local-only data.** Conversation data never leaves the device; there is no network endpoint to attack for data exfiltration.
- **No sensitive logging.** Debug mode logs counts and warnings only — never message contents.

## Supported versions

The latest released version receives security fixes. This project is pre-1.0; APIs and storage schema may change (migrations are provided).
