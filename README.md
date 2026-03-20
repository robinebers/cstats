# cstats

**cstats** is a command-line tool that reads your [Cursor](https://cursor.com) usage export, aggregates token counts by day and by model or provider, and estimates dollar cost using a built-in pricing manifest (aligned with published Cursor and provider rates where possible).

Use it to answer questions like “how much did I spend last month?”, “which model dominated this week?”, and “what does my usage look like day by day?”

---

## Requirements

| Requirement | Notes |
|-------------|--------|
| **Node.js** | v20+ recommended (ESM, `fetch`). |
| **macOS** | Auth is implemented for Cursor’s **macOS** storage: VS Code `state.vscdb` and the macOS Keychain. |
| **Cursor account** | You must be signed into the Cursor app so a valid access/refresh token exists locally. |
| **`sqlite3` CLI** | Used read-only to read tokens from Cursor’s SQLite state file (usually present on macOS). |

If export fails with 401/403, open Cursor and sign in again so tokens refresh.

---

## Install

### From a clone

```bash
git clone https://github.com/robinebers/cstats.git
cd cstats
npm install
npm run build
```

Link the CLI globally (optional):

```bash
npm link
# then:
cstats --help
```

### Run without a global install

```bash
npm run dev -- --help
# or after build:
node dist/src/cli.js --help
```

---

## How it works (short)

1. **Authentication** — Reads Cursor OAuth tokens from `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` and/or the macOS Keychain, refreshes the access token when needed, and builds the session cookie Cursor’s API expects.
2. **Export** — Downloads the same CSV you get from the dashboard: `export-usage-events-csv` with token strategy.
3. **Parsing & aggregation** — Parses rows, filters by your chosen date range, and rolls up totals.
4. **Pricing** — Maps each row’s model id to per-million token rates in `src/pricing-manifest.ts` (input, cache read/write, output, max-mode uplift where applicable). Unknown models are listed in a **warning** at the end; their cost lines show as unpriced in the logic (see source for details).

Costs are **estimates**. Official billing may differ (subscriptions, included usage, promotions, rounding).

---

## Usage

Default window: **last 30 days through today** (local calendar dates).

```text
cstats [options]

Options:
  -s, --since <YYYYMMDD>     Filter since date (default: 30 days ago)
  -u, --until <YYYYMMDD>     Filter until date (default: today)
  -o, --output <mode>        daily | summary (default: daily)
  -g, --group <mode>         model | provider (default: model)
  -d, --detailed             Show every grouped row within each day (daily output only)
  -j, --json                 JSON output for scripting
  -h, --help                 Help
  -v, --version              Version
```

### Examples

**Last 30 days, one line per day per model (default):**

```bash
cstats
```

**Fixed range:**

```bash
cstats --since 20260101 --until 20260131
```

**Single table for the whole range (totals only):**

```bash
cstats --output summary
```

**Group by API provider (e.g. Anthropic vs Cursor) instead of model:**

```bash
cstats --group provider
```

**Daily breakdown with every model row listed per day:**

```bash
cstats --detailed
```

**Machine-readable output:**

```bash
cstats --json
cstats --output summary --group provider --json
```

JSON shape includes `since`, `until`, `totals`, `warnings.unpricedModels`, and either `days` (daily) or `rows` (summary), depending on mode.

---

## Development

```bash
npm install
npm run build    # compile TypeScript to dist/
npm test         # vitest
```

---

## Pricing manifest

Model ids and per-million rates live in `src/pricing-manifest.ts`. When Cursor or providers publish new prices, update the manifest and rebuild. Rows whose `Model` string is not in the manifest appear under **unpriced** warnings.

---

## License

MIT — see `package.json`.

---

## Disclaimer

This project is not affiliated with Cursor. It uses your **local** Cursor login only to call the same export endpoint the dashboard uses. Review Cursor’s terms of service for your account. Use at your own risk.
