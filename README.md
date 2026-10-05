# Slack EOD Generator

Automates weekday **End of Day (EOD)** posts to Slack.

It opens Slack in a dedicated Chromium profile, reads **your** messages from one or two source channels, keeps only real task updates (title + project-management task URL + status), and posts a clean `EOD:` bullet list to your EOD channel.

> **Privacy / compliance**
>
> This public repo uses **placeholder** workspace names, channel names, IDs, and sample text only.
> Do **not** commit real credentials, patient or client details, internal channel names, or production IDs.
> Keep those in a local `.env` file (gitignored).

---

## Requirements

- Node.js 18+ (Node 20+ recommended)
- npm
- Windows, macOS, or Linux
- A Slack workspace you can sign into in a browser
- Optional: Windows Task Scheduler (for unattended weekday runs)

---

## Quick start (step by step)

### 1. Clone and install

```bash
git clone https://github.com/Tamzida-Azad/slack-eod-generator.git
cd slack-eod-generator
npm install
npx playwright install chromium
```

### 2. Create your private config

```bash
cp .env.example .env
```

Edit `.env` with **your** values. Never commit this file.

### 3. Fill in `.env` (use your own values)

| Variable | What to put |
|----------|-------------|
| `SLACK_EMAIL` / `SLACK_PASSWORD` | Optional — used for password login. Leave blank if you use SSO/MFA and sign in manually once. |
| `SLACK_WORKSPACE_URL` | Your Slack workspace URL, e.g. `https://your-workspace.slack.com/` |
| `SLACK_SIGN_IN_URL` | Password sign-in URL if your workspace supports it |
| `SLACK_TEAM_ID` | From any Slack web URL: `https://app.slack.com/client/T…/C…` → the `T…` part |
| `SLACK_DISPLAY_NAME` | Exact display name Slack shows for you |
| `SLACK_MEMBER_ID` | Your member id (`U…`) if you know it |
| `SLACK_SOURCE_A_NAME` / `SLACK_SOURCE_A_ID` | Primary channel where you post task updates (name + optional channel id) |
| `SLACK_SOURCE_B_NAME` / `SLACK_SOURCE_B_ID` | Secondary source channel (optional id) |
| `SLACK_EOD_CHANNEL_NAME` / `SLACK_EOD_CHANNEL_ID` | Channel where the EOD should be posted |
| `TASK_URL_HOST` | Hostname of your project tool task links, e.g. `pm.example.com` |
| `EOD_TIMEZONE` | IANA timezone for “today” and cron, e.g. `UTC` or `America/New_York` |
| `EOD_HEADED` | `1` = show browser (recommended), `0` = headless |
| `EOD_DRY_RUN` | `1` = scrape/build only, do not post |

**How to find a Slack channel id**

1. Open the channel in Slack (browser).
2. Look at the URL: `https://app.slack.com/client/T0123456789/C0123456789`
3. `T0123456789` → `SLACK_TEAM_ID`
4. `C0123456789` → channel id for that channel

### 4. Save a dedicated Slack browser session

```bash
npm run save-auth
```

- A Chromium window opens using **this project’s** `browser-profile/` folder only.
- Sign in (auto-login if email/password are set; otherwise complete SSO/MFA manually).
- Open your primary source channel once if prompted.
- The session stays on disk locally — **do not** commit `browser-profile/`.

### 5. Verify the parser (offline)

```bash
npm run test:parser
```

### 6. Dry-run (scrape + build, no post)

```bash
npm run generate-eod:dry
```

Or:

```bash
npx tsx src/eod.ts --dry --headed
```

Check `logs/eod-YYYY-MM-DD.log` for parsed update counts and the built EOD text.

### 7. Post once manually

```bash
npm run generate-eod:headed
```

### 8. Schedule weekdays (optional)

**Windows Task Scheduler (recommended on Windows):**

```bash
npm run register-task
```

This registers a local scheduled task that runs Mon–Fri at **8:30 PM** in your machine’s local time (configure `EOD_TIMEZONE` for date logic).

**Long-running Node cron:**

```bash
npm run scheduler
```

Uses cron `30 20 * * 1-5` in `EOD_TIMEZONE`.

**Shell runner (logs to `logs/scheduler.log`):**

```bash
bash scripts/run-eod.sh
# or
npm run run-eod
```

---

## What counts as a task update?

**Included** — must look like this in Slack:

```text
#1001: Issues | Sample investigation title

https://pm.example.com/projects/100/tasks/2001

Status note goes here
```

Rules:

1. A title line
2. A task URL on your configured `TASK_URL_HOST` (or a `/projects/{id}/tasks/{id}` path)
3. A short status/comment line after the URL

Multiple blocks in one message (or consecutive messages from you) are all included.

**Skipped** (examples of non-updates):

- Teams / automation to-do dumps (`To-do list shared by client…`)
- Assignment chatter (`Hi @Alex I need 2 tasks…`)
- Drive links or other URLs without a PM task link

**Posted EOD shape:**

```text
EOD:

• #1001: Issues | Sample investigation title - Status note goes here

• #1002: Issues | Another sample title - Waiting for details from requester
```

---

## Commands

| Command | Purpose |
|---------|---------|
| `npm run save-auth` | Create/refresh dedicated Slack browser session |
| `npm run generate-eod:dry` | Scrape + build EOD, **do not post** |
| `npm run generate-eod:headed` | Live run with visible browser |
| `npm run generate-eod` | One-shot production run |
| `npm run generate-eod:force` | Replace today’s EOD (best-effort delete of *your* EOD + repost) |
| `npm run run-eod` | Shell runner → `logs/scheduler.log` |
| `npm run test:parser` | Offline parser checks |
| `npm run scheduler` | Keep Node process alive for cron |
| `npm run register-task` | Register Windows scheduled task |

---

## Safety guards

- Posts at most **one** of *your* `EOD:` messages per day (local flag + channel check).
- Skips posting when no valid task updates were found.
- Uses a dedicated `browser-profile/` so other tools’ Slack sessions are not shared.
- `--force` attempts to remove *your* earlier EOD for the day, then posts again.

---

## Project layout

```text
src/
  eod.ts          # Main generate + post flow
  slack.ts        # Slack scrape / post / delete helpers
  parser.ts       # Task-update parsing
  config.ts       # Env-driven configuration
  save-auth.ts    # One-time Slack login
  scheduler.ts    # node-cron runner
scripts/
  run-eod.sh      # Shell runner
  run-eod.bat     # Windows scheduled-task runner
  register-task.ps1
.env.example      # Dummy template — copy to .env
```

---

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| Login wall / SSO | Run `npm run save-auth` headed and finish MFA once |
| Source channel not found | Set `SLACK_SOURCE_*_ID` from the Slack URL |
| No updates found | Confirm your Slack posts include PM task URLs and match `TASK_URL_HOST` |
| Wrong “today” | Set `EOD_TIMEZONE` to your IANA zone |
| Duplicate EOD | Use `npm run generate-eod:force`, or delete your earlier EOD manually |

---

## What not to commit

- `.env` (secrets and real IDs)
- `browser-profile/` (live Slack session cookies)
- `logs/` (may contain internal message text)

---

## License

Use and adapt freely for your own workspace. You are responsible for keeping PHI, credentials, and internal identifiers out of any public fork.
