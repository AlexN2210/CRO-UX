import type { GoogleAdsCsvBundle } from "./google-ads-csv";
import { getLPs, type LP } from "./data";

let importedGoogleAdsCsv: GoogleAdsCsvBundle | null = null;
let activeAnalysisLps: LP[] | null = null;

export function setImportedGoogleAdsCsv(bundle: GoogleAdsCsvBundle | null) {
  importedGoogleAdsCsv = bundle;
  activeAnalysisLps = bundle?.lps ?? null;
}

export function getImportedGoogleAdsCsv(): GoogleAdsCsvBundle | null {
  return importedGoogleAdsCsv;
}

export function getActiveAnalysisLps(): LP[] | null {
  return activeAnalysisLps;
}

export function getCurrentLPs(): LP[] {
  return activeAnalysisLps ?? getLPs();
}

export function setActiveAnalysisLps(lps: LP[] | null) {
  activeAnalysisLps = lps;
  if (!lps) importedGoogleAdsCsv = null;
}

export function clearImportedGoogleAdsCsv() {
  importedGoogleAdsCsv = null;
  activeAnalysisLps = null;
}
