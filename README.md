# protime-puppet

CLI automation for Trescal MyProtime (calendar actions, check-in/out, and absence request) using Puppeteer.

## Requirements

- Bun
- A Trescal MyProtime account

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```
2. Configure credentials:
   ```bash
   cp .env.example .env
   ```
   Fill in `USER_EMAIL`, `USER_PASSWORD`, and `PROTIME_URL` in `.env`.

## Usage

Run the CLI via Bun:

```bash
bun run start -- <command>
```

Commands:

- `login` - opens a browser for login (headful). Use `--manual` to skip automated login.
- `run` - runs the full automation flow (headless): navigates to the calendar, opens today, optionally requests "Thuiswerk", and adds a clocking entry.

Examples:

```bash
# Automated login
bun run start -- login

# Manual login
bun run start -- login --manual

# Full automation
bun run start -- run
```

## Notes

- Browser session data is stored in `.user_data` so your login can persist.
- The `run` command decides check-in vs. check-out based on the current hour (< 10:00 = check-in).
- The target URL comes from `PROTIME_URL` (e.g. `https://trescal.myprotime.eu`).

System-wide (Windows)
Install a global shim so `protime` works anywhere:

```powershell
# From the repo root
bun link

# Ensure Bun's bin folder is on PATH (persist for user)
setx PATH "$env:PATH;$env:USERPROFILE\.bun\bin"

# New terminal: run the CLI
protime login
```

## Security

- Do not commit `.env` or `.user_data`.
- If you store credentials, keep this repo private or use environment-specific secrets.
