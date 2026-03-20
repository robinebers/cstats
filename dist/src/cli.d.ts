#!/usr/bin/env node
import type { ParsedArgs } from './types.js';
export declare function formatUsageHeader(since: string, until: string): string;
export declare function parseArgs(argv: string[]): ParsedArgs;
