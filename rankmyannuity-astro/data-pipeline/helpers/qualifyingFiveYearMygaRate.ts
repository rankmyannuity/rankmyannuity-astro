// [Phase 5.0b · Task 19] Back-compat re-export.
//
// The canonical location of these predicates moved to
// data-pipeline/predicates/myga.ts per PHASE5_KICKOFF.md Task 19.
// This file remains only to avoid breaking any external import paths
// (e.g. unit-test files that still reference the old location).
//
// NEW CODE SHOULD IMPORT FROM data-pipeline/predicates/myga.ts
// directly. Do not add new predicates here.

export {
  isQualifyingFiveYearMygaRate,
  qualifyingFiveYearMygaRates,
  hasQualifyingFiveYearMygaRate,
} from "../predicates/myga.ts";
