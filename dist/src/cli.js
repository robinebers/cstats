#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aggregateDailyByModel, aggregateDailyByProvider, aggregateDailySummaryByModel, aggregateDailySummaryByProvider, aggregateSummaryByModel, aggregateSummaryByProvider, calculateTotals, } from './aggregate.js';
import { downloadUsageCsv, parseUsageCsv } from './cursor-export.js';
import { resolveDateRange, toEpochRange } from './date-range.js';
import { getUnpricedModels } from './pricing.js';
import { createDailyModelSummaryTable, createDailyModelReportTable, createDailyProviderSummaryTable, createDailyProviderReportTable, createSummaryModelReportTable, createSummaryProviderReportTable, formatDailyModelSectionRow, formatDailyProviderSectionRow, formatDailySummaryRow, formatSummaryModelRow, formatSummaryProviderRow, formatSummaryTotalsRow, } from './table.js';
const DAY_MS = 24 * 60 * 60 * 1000;
function getVersion() {
    const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version ?? '0.0.0';
}
function formatDisplayDate(value) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}
function getInclusiveDayCount(since, until) {
    const sinceUtc = Date.UTC(Number(since.slice(0, 4)), Number(since.slice(4, 6)) - 1, Number(since.slice(6, 8)));
    const untilUtc = Date.UTC(Number(until.slice(0, 4)), Number(until.slice(4, 6)) - 1, Number(until.slice(6, 8)));
    return Math.floor((untilUtc - sinceUtc) / DAY_MS) + 1;
}
export function formatUsageHeader(since, until) {
    const dayCount = getInclusiveDayCount(since, until);
    const dayLabel = dayCount === 1 ? 'day' : 'days';
    return `Showing usage from ${formatDisplayDate(since)} to ${formatDisplayDate(until)} (${dayCount} ${dayLabel})`;
}
function printHelp() {
    const version = getVersion();
    console.log(`cstats v${version}

Usage:
  cstats [options]

Options:
  -s, --since <YYYYMMDD>     Filter since date (default: 30 days ago)
  -u, --until <YYYYMMDD>     Filter until date (default: today)
  -o, --output <mode>        Output mode: daily | summary (default: daily)
  -g, --group <mode>         Group each day by: model | provider (default: model)
  -d, --detailed             Show every grouped row within each day
  -j, --json                 Output in JSON format
  -h, --help                 Display this help
  -v, --version              Display version`);
}
export function parseArgs(argv) {
    const parsed = {
        json: false,
        output: 'daily',
        group: 'model',
        detailed: false,
        help: false,
        version: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case '-s':
            case '--since': {
                const value = argv[index + 1];
                if (value === undefined) {
                    throw new Error(`Missing value for ${arg}.`);
                }
                parsed.since = value;
                index += 1;
                break;
            }
            case '-u':
            case '--until': {
                const value = argv[index + 1];
                if (value === undefined) {
                    throw new Error(`Missing value for ${arg}.`);
                }
                parsed.until = value;
                index += 1;
                break;
            }
            case '-g':
            case '--group': {
                const value = argv[index + 1];
                if (value !== 'model' && value !== 'provider') {
                    throw new Error('The --group flag must be either "model" or "provider".');
                }
                parsed.group = value;
                index += 1;
                break;
            }
            case '-o':
            case '--output': {
                const value = argv[index + 1];
                if (value !== 'daily' && value !== 'summary') {
                    throw new Error('The --output flag must be either "daily" or "summary".');
                }
                parsed.output = value;
                index += 1;
                break;
            }
            case '-d':
            case '--detailed':
            case '--defailed':
                parsed.detailed = true;
                break;
            case '-j':
            case '--json':
                parsed.json = true;
                break;
            case '-h':
            case '--help':
                parsed.help = true;
                break;
            case '-v':
            case '--version':
                parsed.version = true;
                break;
            default:
                throw new Error(`Unknown argument "${arg}".`);
        }
    }
    if (parsed.output === 'summary' && parsed.detailed) {
        throw new Error('The --detailed flag only applies to --output daily.');
    }
    return parsed;
}
function renderDailyModel(days) {
    const table = createDailyModelReportTable();
    for (const day of days) {
        table.push(formatDailyModelSectionRow(day));
    }
    return table.toString();
}
function renderDailyModelSummary(days) {
    const table = createDailyModelSummaryTable();
    for (const day of days) {
        table.push(formatDailySummaryRow(day));
    }
    return table.toString();
}
function renderDailyProvider(days) {
    const table = createDailyProviderReportTable();
    for (const day of days) {
        table.push(formatDailyProviderSectionRow(day));
    }
    return table.toString();
}
function renderDailyProviderSummary(days) {
    const table = createDailyProviderSummaryTable();
    for (const day of days) {
        table.push(formatDailySummaryRow(day));
    }
    return table.toString();
}
function renderSummaryModel(rows, totals) {
    const table = createSummaryModelReportTable();
    for (const row of rows) {
        table.push(formatSummaryModelRow(row));
    }
    table.push(formatSummaryTotalsRow(totals));
    return table.toString();
}
function renderSummaryProvider(rows, totals) {
    const table = createSummaryProviderReportTable();
    for (const row of rows) {
        table.push(formatSummaryProviderRow(row));
    }
    table.push(formatSummaryTotalsRow(totals));
    return table.toString();
}
function buildJsonOutput(output, group, detailed, since, until, data, totals, unpricedModels) {
    if (output === 'summary') {
        return {
            output,
            group,
            since,
            until,
            rows: data,
            totals,
            warnings: {
                unpricedModels,
            },
        };
    }
    return {
        output,
        group,
        detailed,
        since,
        until,
        days: data,
        totals,
        warnings: {
            unpricedModels,
        },
    };
}
async function main() {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            printHelp();
            return;
        }
        if (args.version) {
            console.log(getVersion());
            return;
        }
        const dateRange = resolveDateRange(args.since, args.until);
        const csvText = await downloadUsageCsv(toEpochRange(dateRange));
        const usageRows = parseUsageCsv(csvText, dateRange);
        const totals = calculateTotals(usageRows);
        const unpricedModels = getUnpricedModels(usageRows);
        const usageHeader = formatUsageHeader(dateRange.since, dateRange.until);
        if (args.output === 'summary' && args.group === 'model') {
            const rows = aggregateSummaryByModel(usageRows);
            if (args.json) {
                console.log(JSON.stringify(buildJsonOutput('summary', 'model', false, dateRange.since, dateRange.until, rows, totals, unpricedModels), null, 2));
                return;
            }
            if (rows.length === 0) {
                console.log('No Cursor usage rows found for the selected date range.');
                return;
            }
            console.log(`${usageHeader}\n`);
            console.log(renderSummaryModel(rows, totals));
        }
        else if (args.output === 'summary') {
            const rows = aggregateSummaryByProvider(usageRows);
            if (args.json) {
                console.log(JSON.stringify(buildJsonOutput('summary', 'provider', false, dateRange.since, dateRange.until, rows, totals, unpricedModels), null, 2));
                return;
            }
            if (rows.length === 0) {
                console.log('No Cursor usage rows found for the selected date range.');
                return;
            }
            console.log(`${usageHeader}\n`);
            console.log(renderSummaryProvider(rows, totals));
        }
        else if (args.group === 'model') {
            if (args.detailed) {
                const days = aggregateDailyByModel(usageRows);
                if (args.json) {
                    console.log(JSON.stringify(buildJsonOutput('daily', 'model', true, dateRange.since, dateRange.until, days, totals, unpricedModels), null, 2));
                    return;
                }
                if (days.length === 0) {
                    console.log('No Cursor usage rows found for the selected date range.');
                    return;
                }
                console.log(`${usageHeader}\n`);
                console.log(renderDailyModel(days));
            }
            else {
                const days = aggregateDailySummaryByModel(usageRows);
                if (args.json) {
                    console.log(JSON.stringify(buildJsonOutput('daily', 'model', false, dateRange.since, dateRange.until, days, totals, unpricedModels), null, 2));
                    return;
                }
                if (days.length === 0) {
                    console.log('No Cursor usage rows found for the selected date range.');
                    return;
                }
                console.log(`${usageHeader}\n`);
                console.log(renderDailyModelSummary(days));
            }
        }
        else {
            if (args.detailed) {
                const days = aggregateDailyByProvider(usageRows);
                if (args.json) {
                    console.log(JSON.stringify(buildJsonOutput('daily', 'provider', true, dateRange.since, dateRange.until, days, totals, unpricedModels), null, 2));
                    return;
                }
                if (days.length === 0) {
                    console.log('No Cursor usage rows found for the selected date range.');
                    return;
                }
                console.log(`${usageHeader}\n`);
                console.log(renderDailyProvider(days));
            }
            else {
                const days = aggregateDailySummaryByProvider(usageRows);
                if (args.json) {
                    console.log(JSON.stringify(buildJsonOutput('daily', 'provider', false, dateRange.since, dateRange.until, days, totals, unpricedModels), null, 2));
                    return;
                }
                if (days.length === 0) {
                    console.log('No Cursor usage rows found for the selected date range.');
                    return;
                }
                console.log(`${usageHeader}\n`);
                console.log(renderDailyProviderSummary(days));
            }
        }
        if (unpricedModels.length > 0) {
            console.error(`Warning: no pricing rule found for ${unpricedModels.length} model(s): ${unpricedModels.join(', ')}`);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`cstats: ${message}`);
        process.exitCode = 1;
    }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    void main();
}
//# sourceMappingURL=cli.js.map