# Security Policy

## Supported versions

Only the latest released version receives security fixes. Older versions are not patched.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security reports.**

Use GitHub's private vulnerability reporting:

- Go to the [Security tab](../../security/advisories/new) of this repository
- Click **Report a vulnerability**
- Provide a clear description, reproduction steps, and the affected version(s)

### What to expect

- **Acknowledgement**: within 7 days
- **Initial assessment**: within 14 days
- **Fix timeline**: depends on severity — critical issues are prioritized, low-severity issues may be batched with regular releases
- You will be credited in the release notes unless you prefer to remain anonymous

## Scope

In scope:

- Code execution, privilege escalation, or sandbox escape in the extension
- Cross-origin data leakage or information disclosure from the editor page
- Issues that allow a webpage to interact with the extension beyond declared permissions
- Mishandling of captured screenshots (e.g. inadvertent transmission)

Out of scope:

- Theoretical weaknesses of the *Blur* redaction style — Frame **explicitly** documents that blur is partially reversible and recommends *Mosaic* or *Solid* for sensitive content. This is a design trade-off, not a vulnerability.
- Bugs in dependencies that are not reachable through Frame's actual code paths
- Vulnerabilities requiring physical or local access to an already-compromised browser profile
- Social engineering attacks against the extension's owner or users

## Hardening notes (informational)

Frame requests broad host permissions (`<all_urls>`) because the screenshot API needs them — but it does **not**:

- Run any code in the captured page beyond the brief, user-initiated scroll-capture helper
- Send captured data anywhere (Imgur upload is strictly opt-in, triggered by an explicit click)
- Persist captured data beyond the lifetime of the editor tab (IndexedDB entry only)

If you find any deviation from the above, please report it.
