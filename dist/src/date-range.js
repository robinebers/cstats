const DATE_ARG_PATTERN = /^\d{8}$/;
export function formatDateArg(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}
export function parseDateArg(value) {
    if (!DATE_ARG_PATTERN.test(value)) {
        throw new Error(`Invalid date "${value}". Expected YYYYMMDD.`);
    }
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day) {
        throw new Error(`Invalid date "${value}". Expected a real calendar date.`);
    }
    return date;
}
export function getDefaultDateRange(now = new Date()) {
    const until = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const since = new Date(until);
    since.setDate(since.getDate() - 30);
    return {
        since: formatDateArg(since),
        until: formatDateArg(until),
    };
}
export function resolveDateRange(since, until, now = new Date()) {
    const defaults = getDefaultDateRange(now);
    const resolvedSince = since ?? defaults.since;
    const resolvedUntil = until ?? defaults.until;
    const sinceDate = parseDateArg(resolvedSince);
    const untilDate = parseDateArg(resolvedUntil);
    if (sinceDate.getTime() > untilDate.getTime()) {
        throw new Error('The --since date must be on or before --until.');
    }
    return {
        since: resolvedSince,
        until: resolvedUntil,
    };
}
export function toEpochRange(range) {
    const since = parseDateArg(range.since);
    const until = parseDateArg(range.until);
    const startDate = new Date(since.getFullYear(), since.getMonth(), since.getDate(), 0, 0, 0, 0).getTime();
    const endDate = new Date(until.getFullYear(), until.getMonth(), until.getDate(), 23, 59, 59, 999).getTime();
    return { startDate, endDate };
}
export function toLocalDateString(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid timestamp "${value}".`);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
export function formatDateCompact(date) {
    return date;
}
//# sourceMappingURL=date-range.js.map