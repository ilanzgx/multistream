# Security policy

## Authentication and local storage

Multistream stores authentication tokens (such as Kick OAuth) locally on your machine in a JSON file:

- **Windows**: `%APPDATA%\multistream\`
- **macOS**: `~/Library/Application Support/multistream/`
- **Linux**: `~/.config/multistream/`

Tokens never touch third party servers or proxies. Requests to platform APIs go directly from your computer.

## Supported versions

Only the latest release receives security fixes.

| Version        | Supported |
| :------------- | :-------- |
| Latest release | Yes       |
| Older releases | No        |

## Reporting a vulnerability

Do not open public issues for security vulnerabilities.

Report them privately:

- **GitHub Security Advisories**: Click "Report a vulnerability" in the **Security** tab.
- **Email**: `ilan-_@hotmail.com`

Include steps to reproduce the issue and the potential impact. I will reply within 72 hours.
