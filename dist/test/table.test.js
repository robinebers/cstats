import { afterEach, describe, expect, it } from 'vitest';
import { createDailyModelSummaryTable, createDailyProviderSummaryTable, createDailyProviderReportTable, createSummaryModelReportTable, formatDailySummaryRow, formatDailyProviderSectionRow, formatSummaryModelRow, formatSummaryTotalsRow, } from '../src/table.js';
const originalColumns = process.env.COLUMNS;
afterEach(() => {
    if (originalColumns === undefined) {
        delete process.env.COLUMNS;
    }
    else {
        process.env.COLUMNS = originalColumns;
    }
});
describe('responsive table rendering', () => {
    it('renders the full daily model summary table on wide terminals', () => {
        process.env.COLUMNS = '220';
        const table = createDailyModelSummaryTable();
        table.push(formatDailySummaryRow({
            date: '2026-03-20',
            labels: ['gpt-5.4-xhigh', 'composer-1.5'],
            totals: {
                inputTokens: 112157997,
                outputTokens: 6180995,
                cacheCreationTokens: 21063039,
                cacheReadTokens: 937432885,
                totalTokens: 1076834916,
                totalCost: 2056.02,
            },
        }));
        const output = table.toString();
        expect(table.isCompactMode()).toBe(false);
        expect(output).toContain('Date');
        expect(output).toContain('Models');
        expect(output).toContain('Cache Write');
        expect(output).toContain('Cache Hit');
        expect(output).toContain('Total Tokens');
        expect(output).toContain('2026-03-20');
        expect(output).toContain('gpt-5.4-xhigh');
        expect(output).toContain('composer-1.5');
        expect(output).toContain('112,157,997');
        expect(output).toContain('$2056.02');
        expect(output).not.toContain('…');
    });
    it('renders a compact daily provider summary table on narrow terminals', () => {
        process.env.COLUMNS = '80';
        const table = createDailyProviderSummaryTable();
        table.push(formatDailySummaryRow({
            date: '2026-03-19',
            labels: ['anthropic', 'cursor'],
            totals: {
                inputTokens: 1885,
                outputTokens: 6719,
                cacheCreationTokens: 48912,
                cacheReadTokens: 630041,
                totalTokens: 687557,
                totalCost: 4.450223,
            },
        }));
        const output = table.toString();
        expect(table.isCompactMode()).toBe(true);
        expect(output).toContain('Date');
        expect(output).toContain('Providers');
        expect(output).not.toContain('Cache Write');
        expect(output).not.toContain('Total Tokens');
        expect(output).toContain('anthropic');
        expect(output).toContain('cursor');
    });
    it('renders a compact daily provider detailed table on narrow terminals', () => {
        process.env.COLUMNS = '80';
        const table = createDailyProviderReportTable();
        table.push(formatDailyProviderSectionRow({
            date: '2026-03-19',
            rows: [
                {
                    provider: 'anthropic',
                    inputTokens: 885,
                    outputTokens: 4719,
                    cacheCreationTokens: 48912,
                    cacheReadTokens: 625041,
                    totalTokens: 679557,
                    totalCost: 4.443723,
                },
            ],
            totals: {
                inputTokens: 1885,
                outputTokens: 6719,
                cacheCreationTokens: 48912,
                cacheReadTokens: 630041,
                totalTokens: 687557,
                totalCost: 4.450223,
            },
        }));
        const output = table.toString();
        expect(table.isCompactMode()).toBe(true);
        expect(output).toContain('Date');
        expect(output).toContain('Provider');
        expect(output).not.toContain('Cache Write');
        expect(output).not.toContain('Total Tokens');
        expect(output).toContain('Cost');
        expect(output).toContain('(USD)');
        expect(output).toContain('anthropic');
    });
    it('renders a summary model table without a date column', () => {
        process.env.COLUMNS = '160';
        const table = createSummaryModelReportTable();
        table.push(formatSummaryModelRow({
            model: 'gpt-5.4-xhigh',
            inputTokens: 585209,
            outputTokens: 18733,
            cacheCreationTokens: 0,
            cacheReadTokens: 749568,
            totalTokens: 1353510,
            totalCost: 3.7223215,
        }));
        table.push(formatSummaryTotalsRow({
            inputTokens: 674446,
            outputTokens: 41236,
            cacheCreationTokens: 48912,
            cacheReadTokens: 1607268,
            totalTokens: 2371862,
            totalCost: 8.83417715,
        }));
        const output = table.toString();
        expect(output).toContain('Model');
        expect(output).not.toContain('Date');
        expect(output).toContain('gpt-5.4-xhigh');
        expect(output).toContain('$8.83');
    });
});
//# sourceMappingURL=table.test.js.map