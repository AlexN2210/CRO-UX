const SHOPIFY_AUDIT_OUTPUT_SHEET = "Shopify_Audit";
const SHOPIFY_AUDIT_DEFAULT_SOURCE_SHEET = "LP_Detail";
const SHOPIFY_AUDIT_BATCH_SIZE = 4;
const SHOPIFY_AUDIT_BATCH_TRIGGER = "continueShopifyAudit";

const SHOPIFY_AUDIT_FIELDS = [
  "Shopify - Statut",
  "Shopify - URL analysee",
  "Shopify - URL finale",
  "Shopify - Redirection",
  "Shopify - HTTP",
  "Shopify - Titre",
  "Shopify - H1",
  "Shopify - Template",
  "Shopify - Sections visibles",
  "Shopify - Sections du theme",
  "Shopify - CTA",
  "Shopify - CTA au-dessus du fold",
  "Shopify - Reassurance",
  "Shopify - Chargement (s)",
  "Shopify - Poids ressources (Mo)",
  "Shopify - Lighthouse performance",
  "Shopify - Lighthouse accessibilite",
  "Shopify - Lighthouse bonnes pratiques",
  "Shopify - Lighthouse SEO",
  "Shopify - LCP (s)",
  "Shopify - CLS",
  "Shopify - INP (ms)",
  "Shopify - Metafields disponibles",
  "Shopify - Pages Lighthouse auditees",
  "Shopify - Avertissements",
  "Shopify - Date du crawl",
];

function installShopifyAuditMenu() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "onShopifySpreadsheetOpen_") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("onShopifySpreadsheetOpen_")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onOpen()
    .create();
  onShopifySpreadsheetOpen_();
}

function onShopifySpreadsheetOpen_() {
  SpreadsheetApp.getUi()
    .createMenu("Analyse Shopify")
    .addItem("Demarrer / actualiser l'audit", "startShopifyAudit")
    .addItem("Reprendre l'audit en cours", "continueShopifyAudit")
    .addToUi();
}

function startShopifyAudit() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    SpreadsheetApp.getUi().alert("Un audit Shopify est deja en cours.");
    return;
  }

  let started = false;
  try {
    const ui = SpreadsheetApp.getUi();
    const properties = PropertiesService.getScriptProperties();
    const endpoint = String(properties.getProperty("SHOPIFY_ADAPTER_URL") || "").trim();
    const token = properties.getProperty("SHOPIFY_ADAPTER_TOKEN");
    if (!endpoint || !/^https:\/\/[^/]+\/shopify$/i.test(endpoint)) {
      throw new Error(
        "Configure SHOPIFY_ADAPTER_URL dans les proprietes du script avec l'URL HTTPS complete se terminant par /shopify.",
      );
    }
    if (!token) {
      throw new Error("Configure SHOPIFY_ADAPTER_TOKEN dans les proprietes du script.");
    }

    if (properties.getProperty("SHOPIFY_AUDIT_ACTIVE") === "true") {
      const answer = ui.alert(
        "Audit en cours",
        "Un audit est deja actif. Le remplacer et repartir de zero ?",
        ui.ButtonSet.YES_NO,
      );
      if (answer !== ui.Button.YES) return;
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSheetName =
      properties.getProperty("SHOPIFY_SOURCE_SHEET") || SHOPIFY_AUDIT_DEFAULT_SOURCE_SHEET;
    const source = findShopifySourceTable_(spreadsheet, sourceSheetName);
    if (!source) {
      throw new Error(
        "Aucun onglet avec une colonne LandingPage / Landing page n'a ete trouve. Verifie l'onglet LP_Detail.",
      );
    }

    const output = spreadsheet.getSheetByName(SHOPIFY_AUDIT_OUTPUT_SHEET);
    if (
      output &&
      ui.alert(
        "Actualiser Shopify_Audit",
        "L'onglet Shopify_Audit existe deja. Son contenu sera remplace par la nouvelle analyse.",
        ui.ButtonSet.YES_NO,
      ) !== ui.Button.YES
    ) {
      return;
    }

    removeShopifyAuditTriggers_();
    const outputSheet = output || spreadsheet.insertSheet(SHOPIFY_AUDIT_OUTPUT_SHEET);
    const lastColumn = source.headers.length;
    const headers = source.headers.concat(SHOPIFY_AUDIT_FIELDS);
    const statusColumn = lastColumn;
    const values = [headers];
    const targets = new Set();

    source.rows.forEach(function (row) {
      if (row.every(function (cell) { return cell === "" || cell === null; })) return;
      const url = String(row[source.urlColumn] || "").trim();
      const validUrl = /^https:\/\/[^/\s?#]+/i.test(url);
      const outputRow = row.slice(0, lastColumn);
      while (outputRow.length < lastColumn) outputRow.push("");
      outputRow.push(validUrl ? "En attente" : (url ? "URL ignoree (HTTP ou invalide)" : ""));
      for (let i = 1; i < SHOPIFY_AUDIT_FIELDS.length; i += 1) outputRow.push("");
      values.push(outputRow);
      if (validUrl) targets.add(url);
    });

    if (targets.size === 0) {
      throw new Error("Aucune URL HTTPS valide n'a ete trouvee dans l'onglet source.");
    }

    outputSheet.clearContents();
    outputSheet.getRange(1, 1, values.length, headers.length).setValues(values);
    outputSheet.setFrozenRows(1);
    if (outputSheet.getFilter()) outputSheet.getFilter().remove();
    outputSheet.getRange(1, 1, values.length, headers.length).createFilter();
    outputSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");

    properties.setProperties({
      SHOPIFY_AUDIT_ACTIVE: "true",
      SHOPIFY_AUDIT_SPREADSHEET_ID: spreadsheet.getId(),
      SHOPIFY_AUDIT_SHEET_ID: String(outputSheet.getSheetId()),
      SHOPIFY_AUDIT_SOURCE_URL_COLUMN: String(source.urlColumn),
      SHOPIFY_AUDIT_TOTAL_URLS: String(targets.size),
      SHOPIFY_AUDIT_DONE_URLS: "0",
    });
    started = true;
    runShopifyAuditBatch_(spreadsheet, outputSheet, properties, targets.size);
  } catch (error) {
    SpreadsheetApp.getUi().alert(
      "Impossible de demarrer l'audit Shopify : " +
        (error && error.message ? error.message : String(error)),
    );
  } finally {
    lock.releaseLock();
  }

  if (started) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "Le scraping Shopify a demarre. Les lots suivants s'executeront automatiquement.",
      "Analyse Shopify",
      8,
    );
  }
}

function continueShopifyAudit() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;

  try {
    const properties = PropertiesService.getScriptProperties();
    if (properties.getProperty("SHOPIFY_AUDIT_ACTIVE") !== "true") {
      SpreadsheetApp.getUi().alert("Aucun audit Shopify a reprendre.");
      return;
    }
    removeShopifyAuditTriggers_();
    const spreadsheet = SpreadsheetApp.openById(
      properties.getProperty("SHOPIFY_AUDIT_SPREADSHEET_ID"),
    );
    const outputSheet = spreadsheet.getSheetById(
      Number(properties.getProperty("SHOPIFY_AUDIT_SHEET_ID")),
    );
    if (!outputSheet) throw new Error("L'onglet Shopify_Audit est introuvable.");
    runShopifyAuditBatch_(
      spreadsheet,
      outputSheet,
      properties,
      Number(properties.getProperty("SHOPIFY_AUDIT_TOTAL_URLS")),
    );
  } catch (error) {
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty(
      "SHOPIFY_AUDIT_SPREADSHEET_ID",
    );
    if (spreadsheetId) {
      SpreadsheetApp.openById(spreadsheetId).toast(
        "Le lot Shopify a echoue. Corrige le probleme puis utilise « Reprendre l'audit en cours ». " +
          (error && error.message ? error.message : String(error)),
        "Analyse Shopify",
        10,
      );
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function runShopifyAuditBatch_(spreadsheet, outputSheet, properties, totalUrls) {
  const data = outputSheet.getDataRange().getValues();
  const headers = data[0];
  const urlColumn = Number(properties.getProperty("SHOPIFY_AUDIT_SOURCE_URL_COLUMN"));
  const statusColumn = headers.indexOf("Shopify - Statut");
  const uniquePending = new Map();

  for (let rowIndex = 1; rowIndex < data.length; rowIndex += 1) {
    const url = String(data[rowIndex][urlColumn] || "").trim();
    if (data[rowIndex][statusColumn] === "En attente" && url && !uniquePending.has(url)) {
      uniquePending.set(url, true);
    }
  }

  const batchUrls = Array.from(uniquePending.keys()).slice(0, SHOPIFY_AUDIT_BATCH_SIZE);
  if (batchUrls.length === 0) {
    finishShopifyAudit_(spreadsheet, properties, totalUrls);
    return;
  }

  const isFirstBatch = Number(properties.getProperty("SHOPIFY_AUDIT_DONE_URLS") || "0") === 0;
  const endpoint = properties.getProperty("SHOPIFY_ADAPTER_URL");
  const token = properties.getProperty("SHOPIFY_ADAPTER_TOKEN");
  const response = UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({
      urls: batchUrls,
      lighthouseMaxPages: isFirstBatch ? Math.min(2, batchUrls.length) : 0,
    }),
    muteHttpExceptions: true,
  });

  const statusCode = response.getResponseCode();
  const bodyText = response.getContentText();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error("Le connecteur a repondu HTTP " + statusCode + " : " + bodyText.slice(0, 500));
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch (error) {
    throw new Error("La reponse du connecteur n'est pas du JSON valide.");
  }
  if (!payload || !Array.isArray(payload.lps)) {
    throw new Error("La reponse du connecteur ne contient pas de tableau lps.");
  }

  const resultsByUrl = new Map();
  payload.lps.forEach(function (lp) {
    const metadata = lp.shopifyMetadata || {};
    const key = shopifyUrlKey_(metadata.requestedUrl || lp.url);
    if (key) resultsByUrl.set(key, lp);
  });

  const fieldColumn = {};
  SHOPIFY_AUDIT_FIELDS.forEach(function (field, index) {
    fieldColumn[field] = headers.indexOf(field);
  });
  const crawlDate = new Date();
  const completedKeys = new Set();

  for (let rowIndex = 1; rowIndex < data.length; rowIndex += 1) {
    const url = String(data[rowIndex][urlColumn] || "").trim();
    const key = shopifyUrlKey_(url);
    if (!batchUrls.some(function (target) { return shopifyUrlKey_(target) === key; })) continue;
    const lp = resultsByUrl.get(key);
    if (!lp) {
      data[rowIndex][statusColumn] = "Non retournee";
      continue;
    }

    const metadata = lp.shopifyMetadata || {};
    const finalUrl = metadata.finalUrl || "";
    const warnings = [];
    if (metadata.truncated) warnings.push("Lot tronque par la limite SHOPIFY_MAX_PAGES.");
    if (Array.isArray(metadata.scrapeWarnings)) {
      metadata.scrapeWarnings.forEach(function (warning) {
        warnings.push(
          typeof warning === "string"
            ? warning
            : [warning.url, warning.error].filter(Boolean).join(" : "),
        );
      });
    }
    if (lp.lighthouseError) warnings.push("Lighthouse : " + lp.lighthouseError);

    const valuesByField = {
      "Shopify - Statut": metadata.truncated ? "Partiel (limite connecteur)" : "Analyse",
      "Shopify - URL analysee": metadata.requestedUrl || lp.url || url,
      "Shopify - URL finale": finalUrl,
      "Shopify - Redirection": finalUrl ? finalUrl !== (metadata.requestedUrl || lp.url || url) : "",
      "Shopify - HTTP": metadata.httpStatus === undefined ? "" : metadata.httpStatus,
      "Shopify - Titre": metadata.title || "",
      "Shopify - H1": lp.h1 || "",
      "Shopify - Template": lp.template || "",
      "Shopify - Sections visibles": lp.sections === undefined ? "" : lp.sections,
      "Shopify - Sections du theme": Array.isArray(lp.shopSections) ? lp.shopSections.join(" | ") : "",
      "Shopify - CTA": lp.ctaCount === undefined ? "" : lp.ctaCount,
      "Shopify - CTA au-dessus du fold": lp.ctaAboveFold === undefined ? "" : lp.ctaAboveFold,
      "Shopify - Reassurance": lp.reassurance === undefined ? "" : lp.reassurance,
      "Shopify - Chargement (s)": lp.loadTime === undefined ? "" : lp.loadTime,
      "Shopify - Poids ressources (Mo)": lp.assetWeight === undefined ? "" : lp.assetWeight,
      "Shopify - Lighthouse performance": lp.lhPerf === undefined ? "" : lp.lhPerf,
      "Shopify - Lighthouse accessibilite": lp.lhA11y === undefined ? "" : lp.lhA11y,
      "Shopify - Lighthouse bonnes pratiques": lp.lhBP === undefined ? "" : lp.lhBP,
      "Shopify - Lighthouse SEO": lp.lhSEO === undefined ? "" : lp.lhSEO,
      "Shopify - LCP (s)": lp.lcp === undefined ? "" : lp.lcp,
      "Shopify - CLS": lp.cls === undefined ? "" : lp.cls,
      "Shopify - INP (ms)": lp.inp === undefined ? "" : lp.inp,
      "Shopify - Metafields disponibles": lp.metafieldsAvailable === undefined ? "" : lp.metafieldsAvailable,
      "Shopify - Pages Lighthouse auditees": metadata.lighthousePagesAudited === undefined ? "" : metadata.lighthousePagesAudited,
      "Shopify - Avertissements": warnings.join(" | "),
      "Shopify - Date du crawl": crawlDate,
    };

    Object.keys(valuesByField).forEach(function (field) {
      data[rowIndex][fieldColumn[field]] = valuesByField[field];
    });
    completedKeys.add(key);
  }

  outputSheet.getRange(1, 1, data.length, headers.length).setValues(data);
  const done = Number(properties.getProperty("SHOPIFY_AUDIT_DONE_URLS") || "0") + completedKeys.size;
  properties.setProperty("SHOPIFY_AUDIT_DONE_URLS", String(done));
  spreadsheet.toast(
    "Lot termine : " + done + " URL distinctes sur " + totalUrls + ".",
    "Analyse Shopify",
    6,
  );

  const hasPending = data.slice(1).some(function (row) {
    return row[statusColumn] === "En attente";
  });
  if (hasPending) {
    ScriptApp.newTrigger(SHOPIFY_AUDIT_BATCH_TRIGGER).timeBased().after(60 * 1000).create();
  } else {
    finishShopifyAudit_(spreadsheet, properties, totalUrls);
  }
}

function finishShopifyAudit_(spreadsheet, properties, totalUrls) {
  removeShopifyAuditTriggers_();
  properties.deleteProperty("SHOPIFY_AUDIT_ACTIVE");
  spreadsheet.toast(
    "Audit termine : " +
      properties.getProperty("SHOPIFY_AUDIT_DONE_URLS") +
      " URL traitees sur " +
      totalUrls +
      ".",
    "Analyse Shopify",
    10,
  );
}

function findShopifySourceTable_(spreadsheet, preferredName) {
  const sheets = spreadsheet.getSheets().filter(function (sheet) {
    return sheet.getName() !== SHOPIFY_AUDIT_OUTPUT_SHEET;
  });
  const ordered = [];
  [preferredName, SHOPIFY_AUDIT_DEFAULT_SOURCE_SHEET, "LandingPages"].forEach(function (name) {
    const sheet = sheets.find(function (candidate) { return candidate.getName() === name; });
    if (sheet && ordered.indexOf(sheet) === -1) ordered.push(sheet);
  });
  sheets.forEach(function (sheet) {
    if (ordered.indexOf(sheet) === -1) ordered.push(sheet);
  });

  for (let sheetIndex = 0; sheetIndex < ordered.length; sheetIndex += 1) {
    const sheet = ordered[sheetIndex];
    const values = sheet.getDataRange().getValues();
    for (let rowIndex = 0; rowIndex < Math.min(values.length, 10); rowIndex += 1) {
      const headers = values[rowIndex].map(shopifyHeaderKey_);
      let urlColumn = -1;
      for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
        if ([
          "landingpage",
          "landingpagenettoyee",
          "landingpageurl",
          "landingpageexpanded",
          "finalurl",
          "urlfinale",
          "urlfinal",
          "expandedfinalurl",
          "pagededestination",
          "url",
        ].indexOf(headers[columnIndex]) !== -1) {
          urlColumn = columnIndex;
          break;
        }
      }
      if (urlColumn !== -1 && values.length > rowIndex + 1) {
        return {
          sheet: sheet,
          headers: values[rowIndex].map(function (value, index) {
            return String(value || "").trim() || "Colonne " + (index + 1);
          }),
          rows: values.slice(rowIndex + 1),
          urlColumn: urlColumn,
        };
      }
    }
  }
  return null;
}

function shopifyHeaderKey_(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function shopifyUrlKey_(value) {
  const url = String(value || "").trim();
  const match = url.match(/^(https?):\/\/([^/?#]+)(.*)$/i);
  if (!match) return url;
  let host = match[2].toLowerCase();
  host = host.replace(/:443$/, "");
  let suffix = match[3] || "/";
  if (!suffix) suffix = "/";
  return match[1].toLowerCase() + "://" + host + suffix;
}

function removeShopifyAuditTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === SHOPIFY_AUDIT_BATCH_TRIGGER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
