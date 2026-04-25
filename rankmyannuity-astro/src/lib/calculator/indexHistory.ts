// Index history metadata helpers
// Derives hasTenYearHistory, warnings, and labels from IndexDefinition data.

import type { IndexDefinition, IndexHistoryMeta } from "./types";

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Reference date for "as of" calculations — end of 2024 data year */
const DATA_AS_OF = "December 2024";
const DATA_AS_OF_DATE = new Date(2024, 11, 31); // Dec 31, 2024

/**
 * Parse a liveDate string like "April 2011" or "Jan 2021" into a Date.
 * Returns null if unparseable.
 */
function parseLiveDate(liveDate: string): Date | null {
  const parts = liveDate.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const monthStr = parts[0].toLowerCase();
  const year = parseInt(parts[1], 10);
  const month = MONTH_MAP[monthStr];
  if (month === undefined || isNaN(year)) return null;
  return new Date(year, month, 1);
}

/**
 * Compute the number of full months between two dates.
 */
function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

/**
 * Get history metadata for an index.
 * If backtested with a liveDate, computes live history length.
 * If not backtested, treats all available data as live history.
 */
export function getIndexHistoryMeta(def: IndexDefinition): IndexHistoryMeta {
  const years = Object.keys(def.returns).map(Number).sort((a, b) => a - b);
  const totalDataYears = years.length;

  // For non-backtested indices, all history is live
  if (!def.backtested || !def.liveDate) {
    const liveYears = totalDataYears;
    return {
      hasTenYearHistory: liveYears >= 10,
      requiresUserAssumption: liveYears < 10,
      liveHistoryYears: liveYears,
      liveHistoryMonths: liveYears * 12,
      historyLabel: liveYears >= 10 ? "10+ years of live history" : "Sparse live history",
      historyWarning: liveYears >= 10
        ? "Historical context only. Not a forecast."
        : "This index has less than 10 years of live history. Historical figures shown here are limited live-history context only and should not be treated as a forecast.",
      inceptionDate: null,
      dataAsOf: DATA_AS_OF,
      sourceLabel: def.issuer,
    };
  }

  // Backtested index with liveDate
  const parsed = parseLiveDate(def.liveDate);
  if (!parsed) {
    // Fallback: treat as short-history to be safe
    return {
      hasTenYearHistory: false,
      requiresUserAssumption: true,
      liveHistoryYears: 0,
      liveHistoryMonths: 0,
      historyLabel: "Sparse live history",
      historyWarning: "This index has less than 10 years of live history. Historical figures shown here are limited live-history context only and should not be treated as a forecast.",
      inceptionDate: def.liveDate,
      dataAsOf: DATA_AS_OF,
      sourceLabel: def.issuer,
    };
  }

  const totalMonths = monthsBetween(parsed, DATA_AS_OF_DATE);
  const liveYears = Math.floor(totalMonths / 12);
  const liveMonths = totalMonths;

  return {
    hasTenYearHistory: liveYears >= 10,
    requiresUserAssumption: liveYears < 10,
    liveHistoryYears: liveYears,
    liveHistoryMonths: liveMonths,
    historyLabel: liveYears >= 10 ? "10+ years of live history" : "Sparse live history",
    historyWarning: liveYears >= 10
      ? "Historical context only. Not a forecast."
      : "This index has less than 10 years of live history. Historical figures shown here are limited live-history context only and should not be treated as a forecast.",
    inceptionDate: def.liveDate,
    dataAsOf: DATA_AS_OF,
    sourceLabel: def.issuer,
  };
}

/**
 * Get the live-only year range for a backtested index.
 * Returns only years >= the live inception year.
 */
export function getLiveYears(def: IndexDefinition): number[] {
  if (!def.backtested || !def.liveDate) {
    return Object.keys(def.returns).map(Number).sort((a, b) => a - b);
  }
  const parsed = parseLiveDate(def.liveDate);
  if (!parsed) return [];
  const liveStartYear = parsed.getFullYear();
  return Object.keys(def.returns)
    .map(Number)
    .filter((y) => y >= liveStartYear)
    .sort((a, b) => a - b);
}
