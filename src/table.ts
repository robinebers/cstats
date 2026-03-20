import process from 'node:process';

import Table from 'cli-table3';
import pc from 'picocolors';
import stringWidth from 'string-width';

import { formatDateCompact } from './date-range.js';
import type {
  DailyModelSection,
  DailyProviderSection,
  DailySummarySection,
  ModelReportRow,
  ProviderReportRow,
  ReportTotals,
} from './types.js';

type TableCellAlign = 'left' | 'right' | 'center';
type TableCell = string | { content: string; hAlign?: TableCellAlign };
type TableRow = TableCell[];

type TableOptions = {
  head: string[];
  colAligns: TableCellAlign[];
  compactHead?: string[];
  compactColAligns?: TableCellAlign[];
  compactThreshold?: number;
  forceCompact?: boolean;
  dateFormatter?: (value: string) => string;
};

function isFormattedCell(cell: TableCell): cell is { content: string; hAlign?: TableCellAlign } {
  return typeof cell === 'object' && cell !== null && 'content' in cell;
}

function cellContent(cell: TableCell): string {
  return isFormattedCell(cell) ? cell.content : cell;
}

function measureCellWidth(cell: TableCell | string): number {
  const content = typeof cell === 'string' ? cell : cellContent(cell);
  return Math.max(...content.split('\n').map((line) => stringWidth(line)));
}

export class ResponsiveTable {
  private readonly head: string[];
  private readonly colAligns: TableCellAlign[];
  private readonly compactHead?: string[];
  private readonly compactColAligns?: TableCellAlign[];
  private readonly compactThreshold: number;
  private readonly forceCompact: boolean;
  private readonly dateFormatter?: (value: string) => string;
  private readonly rows: TableRow[] = [];
  private compactMode = false;

  constructor(options: TableOptions) {
    this.head = options.head;
    this.colAligns = options.colAligns;
    this.compactHead = options.compactHead;
    this.compactColAligns = options.compactColAligns;
    this.compactThreshold = options.compactThreshold ?? 100;
    this.forceCompact = options.forceCompact ?? false;
    this.dateFormatter = options.dateFormatter;
  }

  push(row: TableRow): void {
    this.rows.push(row);
  }

  isCompactMode(): boolean {
    return this.compactMode;
  }

  private getCompactIndices(): number[] {
    if (!this.compactMode || this.compactHead === undefined) {
      return Array.from({ length: this.head.length }, (_, index) => index);
    }

    return this.compactHead.map((header) => {
      const index = this.head.indexOf(header);
      return index >= 0 ? index : 0;
    });
  }

  private normalizeRow(row: TableRow): TableRow {
    return row.map((cell, index) => {
      if (
        this.compactMode &&
        index === 0 &&
        this.dateFormatter !== undefined &&
        typeof cell === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(cell.split('\n')[0] ?? '')
      ) {
        return cell
          .split('\n')
          .map((line) => (/^\d{4}-\d{2}-\d{2}$/.test(line) ? this.dateFormatter!(line) : line))
          .join('\n');
      }

      return cell;
    });
  }

  private filterCompact(row: TableRow, indices: number[]): TableRow {
    return indices.map((index) => row[index] ?? '');
  }

  private getBaseCompactMode(terminalWidth: number): boolean {
    return this.forceCompact || (terminalWidth < this.compactThreshold && this.compactHead !== undefined);
  }

  private getCurrentHead(): string[] {
    return this.compactMode && this.compactHead !== undefined ? this.compactHead : this.head;
  }

  private getCurrentAligns(): TableCellAlign[] {
    return this.compactMode && this.compactColAligns !== undefined
      ? this.compactColAligns
      : this.colAligns;
  }

  private getVisibleRows(): TableRow[] {
    const compactIndices = this.getCompactIndices();
    const processedRows = this.rows.map((row) => this.normalizeRow(row));
    return this.compactMode
      ? processedRows.map((row) => this.filterCompact(row, compactIndices))
      : processedRows;
  }

  private isDateColumn(header: string): boolean {
    return header === 'Date';
  }

  private isPrimaryTextColumn(header: string): boolean {
    return header === 'Model' || header === 'Provider' || header === 'Models' || header === 'Providers';
  }

  private buildColumnWidths(
    terminalWidth: number,
    head: string[],
    colAligns: TableCellAlign[],
    rows: TableRow[],
  ): number[] | null {
    const tableOverhead = head.length * 3 + 1;
    const maxContentWidths = head.map((header, index) => {
      const rowWidths = rows.map((row) => measureCellWidth(row[index] ?? ''));
      return Math.max(measureCellWidth(header), ...rowWidths);
    });

    const widths = new Array<number>(head.length).fill(0);
    const flexibleIndices: number[] = [];
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

      let width: number;
      if (position === flexibleIndices.length - 1) {
        width = remainingFlexibleWidth;
      } else if (remainingNaturalWidth > 0) {
        width = Math.floor((naturalWidth / remainingNaturalWidth) * remainingFlexibleWidth);
      } else {
        width = Math.floor(remainingFlexibleWidth / (flexibleIndices.length - position));
      }

      width = Math.max(minWidth, Math.min(width, maxWidth));
      widths[index] = width;
      remainingFlexibleWidth -= width;
      remainingNaturalWidth -= naturalWidth;
    }

    return widths;
  }

  toString(): string {
    const terminalWidth =
      Number.parseInt(process.env.COLUMNS ?? '', 10) || process.stdout.columns || 120;
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
      colWidths = head.map((header, index) =>
        colAligns[index] === 'right' ? Math.max(measureCellWidth(header) + 2, 14) : 14,
      );
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

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function createDailyReportTable(primaryHeader: 'Model' | 'Provider', forceCompact = false): ResponsiveTable {
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

function createDailySummaryReportTable(primaryHeader: 'Models' | 'Providers', forceCompact = false): ResponsiveTable {
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

export function createDailyModelReportTable(forceCompact = false): ResponsiveTable {
  return createDailyReportTable('Model', forceCompact);
}

export function createDailyProviderReportTable(forceCompact = false): ResponsiveTable {
  return createDailyReportTable('Provider', forceCompact);
}

export function createDailyModelSummaryTable(forceCompact = false): ResponsiveTable {
  return createDailySummaryReportTable('Models', forceCompact);
}

export function createDailyProviderSummaryTable(forceCompact = false): ResponsiveTable {
  return createDailySummaryReportTable('Providers', forceCompact);
}

function createSummaryReportTable(primaryHeader: 'Model' | 'Provider', forceCompact = false): ResponsiveTable {
  return new ResponsiveTable({
    head: [primaryHeader, 'Input', 'Output', 'Cache Write', 'Cache Hit', 'Total Tokens', 'Cost (USD)'],
    colAligns: ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
    compactHead: [primaryHeader, 'Input', 'Output', 'Cost (USD)'],
    compactColAligns: ['left', 'right', 'right', 'right'],
    compactThreshold: 100,
    forceCompact,
  });
}

export function createSummaryModelReportTable(forceCompact = false): ResponsiveTable {
  return createSummaryReportTable('Model', forceCompact);
}

export function createSummaryProviderReportTable(forceCompact = false): ResponsiveTable {
  return createSummaryReportTable('Provider', forceCompact);
}

function formatSectionDate(date: string, rowCount: number): string {
  return [date, ...new Array(Math.max(rowCount - 1, 0)).fill('')].join('\n');
}

function formatSectionValues(values: string[], total: string): string {
  return [...values, total].join('\n');
}

function formatDailySectionRow<T extends ModelReportRow | ProviderReportRow>(
  date: string,
  rows: T[],
  labelForRow: (row: T) => string,
  totals: ReportTotals,
): TableRow {
  return [
    formatSectionDate(date, rows.length + 1),
    formatSectionValues(
      rows.map((row) => labelForRow(row)),
      pc.yellow('Total'),
    ),
    formatSectionValues(
      rows.map((row) => formatNumber(row.inputTokens)),
      formatNumber(totals.inputTokens),
    ),
    formatSectionValues(
      rows.map((row) => formatNumber(row.outputTokens)),
      formatNumber(totals.outputTokens),
    ),
    formatSectionValues(
      rows.map((row) => formatNumber(row.cacheCreationTokens)),
      formatNumber(totals.cacheCreationTokens),
    ),
    formatSectionValues(
      rows.map((row) => formatNumber(row.cacheReadTokens)),
      formatNumber(totals.cacheReadTokens),
    ),
    formatSectionValues(
      rows.map((row) => formatNumber(row.totalTokens)),
      formatNumber(totals.totalTokens),
    ),
    formatSectionValues(
      rows.map((row) => formatCurrency(row.totalCost)),
      formatCurrency(totals.totalCost),
    ),
  ];
}

export function formatDailyModelSectionRow(section: DailyModelSection): TableRow {
  return formatDailySectionRow(section.date, section.rows, (row) => row.model, section.totals);
}

export function formatDailyProviderSectionRow(section: DailyProviderSection): TableRow {
  return formatDailySectionRow(section.date, section.rows, (row) => row.provider, section.totals);
}

export function formatDailySummaryRow(section: DailySummarySection): TableRow {
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

export function formatSummaryModelRow(row: ModelReportRow): TableRow {
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

export function formatSummaryProviderRow(row: ProviderReportRow): TableRow {
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

export function formatSummaryTotalsRow(totals: ReportTotals): TableRow {
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
