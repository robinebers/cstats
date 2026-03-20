import process from 'node:process';
import Table from 'cli-table3';
import pc from 'picocolors';
import stringWidth from 'string-width';
import { formatDateCompact } from './date-range.js';
function isFormattedCell(cell) {
    return typeof cell === 'object' && cell !== null && 'content' in cell;
}
function cellContent(cell) {
    return isFormattedCell(cell) ? cell.content : cell;
}
function measureCellWidth(cell) {
    const content = typeof cell === 'string' ? cell : cellContent(cell);
    return Math.max(...content.split('\n').map((line) => stringWidth(line)));
}
export class ResponsiveTable {
    head;
    colAligns;
    compactHead;
    compactColAligns;
    compactThreshold;
    forceCompact;
    dateFormatter;
    rows = [];
    compactMode = false;
    constructor(options) {
        this.head = options.head;
        this.colAligns = options.colAligns;
        this.compactHead = options.compactHead;
        this.compactColAligns = options.compactColAligns;
        this.compactThreshold = options.compactThreshold ?? 100;
        this.forceCompact = options.forceCompact ?? false;
        this.dateFormatter = options.dateFormatter;
    }
    push(row) {
        this.rows.push(row);
    }
    isCompactMode() {
        return this.compactMode;
    }
    getCompactIndices() {
        if (!this.compactMode || this.compactHead === undefined) {
            return Array.from({ length: this.head.length }, (_, index) => index);
        }
        return this.compactHead.map((header) => {
            const index = this.head.indexOf(header);
            return index >= 0 ? index : 0;
        });
    }
    normalizeRow(row) {
        return row.map((cell, index) => {
            if (this.compactMode &&
                index === 0 &&
                this.dateFormatter !== undefined &&
                typeof cell === 'string' &&
                /^\d{4}-\d{2}-\d{2}$/.test(cell.split('\n')[0] ?? '')) {
                return cell
                    .split('\n')
                    .map((line) => (/^\d{4}-\d{2}-\d{2}$/.test(line) ? this.dateFormatter(line) : line))
                    .join('\n');
            }
            return cell;
        });
    }
    filterCompact(row, indices) {
        return indices.map((index) => row[index] ?? '');
    }
    getBaseCompactMode(terminalWidth) {
        return this.forceCompact || (terminalWidth < this.compactThreshold && this.compactHead !== undefined);
    }
    getCurrentHead() {
        return this.compactMode && this.compactHead !== undefined ? this.compactHead : this.head;
    }
    getCurrentAligns() {
        return this.compactMode && this.compactColAligns !== undefined
            ? this.compactColAligns
            : this.colAligns;
    }
    getVisibleRows() {
        const compactIndices = this.getCompactIndices();
        const processedRows = this.rows.map((row) => this.normalizeRow(row));
        return this.compactMode
            ? processedRows.map((row) => this.filterCompact(row, compactIndices))
            : processedRows;
    }
    isDateColumn(header) {
        return header === 'Date';
    }
    isPrimaryTextColumn(header) {
        return header === 'Model' || header === 'Provider' || header === 'Models' || header === 'Providers';
    }
    buildColumnWidths(terminalWidth, head, colAligns, rows) {
        const tableOverhead = head.length * 3 + 1;
        const maxContentWidths = head.map((header, index) => {
            const rowWidths = rows.map((row) => measureCellWidth(row[index] ?? ''));
            return Math.max(measureCellWidth(header), ...rowWidths);
        });
        const widths = new Array(head.length).fill(0);
        const flexibleIndices = [];
        let reservedWidth = 0;
        for (let index = 0; index < head.length; index += 1) {
            const header = head[index] ?? '';
            const align = colAligns[index] ?? 'left';
            const contentWidth = maxContentWidths[index] ?? 0;
            if (align === 'right') {
                const width = Math.max(contentWidth + 2, measureCellWidth(header) + 2, 14);
                widths[index] = width;
                reservedWidth += width;
                continue;
            }
            if (this.isDateColumn(header)) {
                const width = 12;
                widths[index] = width;
                reservedWidth += width;
                continue;
            }
            if (this.isPrimaryTextColumn(header)) {
                flexibleIndices.push(index);
                continue;
            }
            const width = Math.max(contentWidth + 2, measureCellWidth(header) + 2, 12);
            widths[index] = width;
            reservedWidth += width;
        }
        const availableFlexibleWidth = terminalWidth - tableOverhead - reservedWidth;
        const minimumFlexibleWidth = flexibleIndices.length * (this.compactMode ? 18 : 24);
        if (flexibleIndices.length === 0) {
            return widths;
        }
        if (!this.compactMode && this.compactHead !== undefined && availableFlexibleWidth < minimumFlexibleWidth) {
            return null;
        }
        const totalNaturalFlexibleWidth = flexibleIndices.reduce((sum, index) => {
            const header = head[index] ?? '';
            const contentWidth = maxContentWidths[index] ?? 0;
            return sum + Math.max(contentWidth + 2, measureCellWidth(header) + 2, this.compactMode ? 18 : 24);
        }, 0);
        let remainingFlexibleWidth = Math.max(availableFlexibleWidth, flexibleIndices.length * 8);
        let remainingNaturalWidth = totalNaturalFlexibleWidth;
        for (const [position, index] of flexibleIndices.entries()) {
            const header = head[index] ?? '';
            const contentWidth = maxContentWidths[index] ?? 0;
            const naturalWidth = Math.max(contentWidth + 2, measureCellWidth(header) + 2, this.compactMode ? 18 : 24);
            const maxWidth = this.compactMode ? 48 : 60;
            const minWidth = this.compactMode ? 14 : 22;
            let width;
            if (position === flexibleIndices.length - 1) {
                width = remainingFlexibleWidth;
            }
            else if (remainingNaturalWidth > 0) {
                width = Math.floor((naturalWidth / remainingNaturalWidth) * remainingFlexibleWidth);
            }
            else {
                width = Math.floor(remainingFlexibleWidth / (flexibleIndices.length - position));
            }
            width = Math.max(minWidth, Math.min(width, maxWidth));
            widths[index] = width;
            remainingFlexibleWidth -= width;
            remainingNaturalWidth -= naturalWidth;
        }
        return widths;
    }
    toString() {
        const terminalWidth = Number.parseInt(process.env.COLUMNS ?? '', 10) || process.stdout.columns || 120;
        this.compactMode = this.getBaseCompactMode(terminalWidth);
        let head = this.getCurrentHead();
        let colAligns = this.getCurrentAligns();
        let visibleRows = this.getVisibleRows();
        let colWidths = this.buildColumnWidths(terminalWidth, head, colAligns, visibleRows);
        if (colWidths === null && this.compactHead !== undefined) {
            this.compactMode = true;
            head = this.getCurrentHead();
            colAligns = this.getCurrentAligns();
            visibleRows = this.getVisibleRows();
            colWidths = this.buildColumnWidths(terminalWidth, head, colAligns, visibleRows);
        }
        if (colWidths === null) {
            colWidths = head.map((header, index) => colAligns[index] === 'right' ? Math.max(measureCellWidth(header) + 2, 14) : 14);
        }
        const table = new Table({
            head,
            colAligns,
            colWidths,
            wordWrap: true,
            wrapOnWordBoundary: false,
            style: {
                head: ['cyan'],
            },
        });
        for (const row of visibleRows) {
            table.push(row);
        }
        return table.toString();
    }
}
export function formatNumber(value) {
    return value.toLocaleString('en-US');
}
export function formatCurrency(value) {
    return `$${value.toFixed(2)}`;
}
function createDailyReportTable(primaryHeader, forceCompact = false) {
    return new ResponsiveTable({
        head: ['Date', primaryHeader, 'Input', 'Output', 'Cache Write', 'Cache Hit', 'Total Tokens', 'Cost (USD)'],
        colAligns: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right'],
        compactHead: ['Date', primaryHeader, 'Input', 'Output', 'Cost (USD)'],
        compactColAligns: ['left', 'left', 'right', 'right', 'right'],
        compactThreshold: 100,
        forceCompact,
        dateFormatter: formatDateCompact,
    });
}
function createDailySummaryReportTable(primaryHeader, forceCompact = false) {
    return new ResponsiveTable({
        head: ['Date', primaryHeader, 'Input', 'Output', 'Cache Write', 'Cache Hit', 'Total Tokens', 'Cost (USD)'],
        colAligns: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right'],
        compactHead: ['Date', primaryHeader, 'Input', 'Output', 'Cost (USD)'],
        compactColAligns: ['left', 'left', 'right', 'right', 'right'],
        compactThreshold: 100,
        forceCompact,
        dateFormatter: formatDateCompact,
    });
}
export function createDailyModelReportTable(forceCompact = false) {
    return createDailyReportTable('Model', forceCompact);
}
export function createDailyProviderReportTable(forceCompact = false) {
    return createDailyReportTable('Provider', forceCompact);
}
export function createDailyModelSummaryTable(forceCompact = false) {
    return createDailySummaryReportTable('Models', forceCompact);
}
export function createDailyProviderSummaryTable(forceCompact = false) {
    return createDailySummaryReportTable('Providers', forceCompact);
}
function createSummaryReportTable(primaryHeader, forceCompact = false) {
    return new ResponsiveTable({
        head: [primaryHeader, 'Input', 'Output', 'Cache Write', 'Cache Hit', 'Total Tokens', 'Cost (USD)'],
        colAligns: ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
        compactHead: [primaryHeader, 'Input', 'Output', 'Cost (USD)'],
        compactColAligns: ['left', 'right', 'right', 'right'],
        compactThreshold: 100,
        forceCompact,
    });
}
export function createSummaryModelReportTable(forceCompact = false) {
    return createSummaryReportTable('Model', forceCompact);
}
export function createSummaryProviderReportTable(forceCompact = false) {
    return createSummaryReportTable('Provider', forceCompact);
}
function formatSectionDate(date, rowCount) {
    return [date, ...new Array(Math.max(rowCount - 1, 0)).fill('')].join('\n');
}
function formatSectionValues(values, total) {
    return [...values, total].join('\n');
}
function formatDailySectionRow(date, rows, labelForRow, totals) {
    return [
        formatSectionDate(date, rows.length + 1),
        formatSectionValues(rows.map((row) => labelForRow(row)), pc.yellow('Total')),
        formatSectionValues(rows.map((row) => formatNumber(row.inputTokens)), formatNumber(totals.inputTokens)),
        formatSectionValues(rows.map((row) => formatNumber(row.outputTokens)), formatNumber(totals.outputTokens)),
        formatSectionValues(rows.map((row) => formatNumber(row.cacheCreationTokens)), formatNumber(totals.cacheCreationTokens)),
        formatSectionValues(rows.map((row) => formatNumber(row.cacheReadTokens)), formatNumber(totals.cacheReadTokens)),
        formatSectionValues(rows.map((row) => formatNumber(row.totalTokens)), formatNumber(totals.totalTokens)),
        formatSectionValues(rows.map((row) => formatCurrency(row.totalCost)), formatCurrency(totals.totalCost)),
    ];
}
export function formatDailyModelSectionRow(section) {
    return formatDailySectionRow(section.date, section.rows, (row) => row.model, section.totals);
}
export function formatDailyProviderSectionRow(section) {
    return formatDailySectionRow(section.date, section.rows, (row) => row.provider, section.totals);
}
export function formatDailySummaryRow(section) {
    return [
        section.date,
        section.labels.join('\n'),
        formatNumber(section.totals.inputTokens),
        formatNumber(section.totals.outputTokens),
        formatNumber(section.totals.cacheCreationTokens),
        formatNumber(section.totals.cacheReadTokens),
        formatNumber(section.totals.totalTokens),
        formatCurrency(section.totals.totalCost),
    ];
}
export function formatSummaryModelRow(row) {
    return [
        row.model,
        formatNumber(row.inputTokens),
        formatNumber(row.outputTokens),
        formatNumber(row.cacheCreationTokens),
        formatNumber(row.cacheReadTokens),
        formatNumber(row.totalTokens),
        formatCurrency(row.totalCost),
    ];
}
export function formatSummaryProviderRow(row) {
    return [
        row.provider,
        formatNumber(row.inputTokens),
        formatNumber(row.outputTokens),
        formatNumber(row.cacheCreationTokens),
        formatNumber(row.cacheReadTokens),
        formatNumber(row.totalTokens),
        formatCurrency(row.totalCost),
    ];
}
export function formatSummaryTotalsRow(totals) {
    return [
        pc.yellow('Total'),
        formatNumber(totals.inputTokens),
        formatNumber(totals.outputTokens),
        formatNumber(totals.cacheCreationTokens),
        formatNumber(totals.cacheReadTokens),
        formatNumber(totals.totalTokens),
        formatCurrency(totals.totalCost),
    ];
}
//# sourceMappingURL=table.js.map