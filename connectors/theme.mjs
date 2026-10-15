import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export async function readThemeTemplates(themeDirectory) {
  if (!themeDirectory) return new Map();
  const templatesDirectory = path.join(themeDirectory, "templates");
  let filenames;
  try {
    filenames = await readdir(templatesDirectory);
  } catch {
    throw new Error("SHOPIFY_THEME_DIR must point to a Shopify theme containing templates/.");
  }

  const listFiles = async (directory) => {
    try {
      return (await readdir(path.join(themeDirectory, directory)))
        .filter((filename) => !filename.startsWith("."))
        .map((filename) => `${directory}/${filename}`);
    } catch {
      return [];
    }
  };
  const themeFiles = {
    templates: filenames.map((filename) => `templates/${filename}`),
    sections: await listFiles("sections"),
    snippets: await listFiles("snippets"),
    config: await listFiles("config"),
  };

  const sectionSchemas = [];
  for (const filename of themeFiles.sections.filter((name) => name.endsWith(".liquid"))) {
    try {
      const source = await readFile(path.join(themeDirectory, filename), "utf8");
      const schemaSource = source.match(
        /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/u,
      )?.[1];
      if (!schemaSource) continue;
      const schema = JSON.parse(schemaSource);
      sectionSchemas.push({
        file: filename,
        name: schema.name ?? path.basename(filename, ".liquid"),
        settingsCount: schema.settings?.length ?? 0,
        blockTypes: (schema.blocks ?? []).map((block) => block.type).filter(Boolean),
        maxBlocks: schema.max_blocks ?? null,
      });
    } catch {
      continue;
    }
  }

  const readConfigJson = async (filename, fallback) => {
    try {
      return JSON.parse(await readFile(path.join(themeDirectory, "config", filename), "utf8"));
    } catch {
      return fallback;
    }
  };
  const settingsSchema = await readConfigJson("settings_schema.json", []);
  const settingsData = await readConfigJson("settings_data.json", {});
  const themeStructure = {
    sectionSchemas,
    settingsGroups: Array.isArray(settingsSchema) ? settingsSchema.length : 0,
    globalSettingCount: Array.isArray(settingsSchema)
      ? settingsSchema.reduce((total, group) => total + (group.settings?.length ?? 0), 0)
      : 0,
    configuredSectionCount: Object.keys(settingsData.current?.sections ?? {}).length,
  };

  const templates = new Map();
  for (const filename of filenames.filter((name) => name.endsWith(".json"))) {
    try {
      const source = await readFile(path.join(templatesDirectory, filename), "utf8");
      const json = JSON.parse(source);
      const sections = Object.values(json.sections ?? {});
      templates.set(filename.replace(/\.json$/u, ""), {
        sections: sections.map((section) => section.type).filter(Boolean),
        dynamicSections: sections.filter((section) => Object.keys(section.blocks ?? {}).length > 0)
          .length,
        themeFiles,
        themeStructure,
      });
    } catch {
      continue;
    }
  }
  return templates;
}

export function matchThemeTemplate(pathname, bodyClass, templates) {
  const resource = pathname.startsWith("/products/")
    ? "product"
    : pathname.startsWith("/collections/")
      ? "collection"
      : pathname.startsWith("/pages/")
        ? "page"
        : undefined;
  if (!resource) {
    return {
      template: "page.custom-legacy",
      sections: [],
      dynamicSections: 0,
      themeFiles: [],
      themeStructure: undefined,
    };
  }

  const classMatch = bodyClass.match(new RegExp(`template-${resource}(?:-([\\w-]+))?`, "u"));
  const suffix = classMatch?.[1];
  const candidateNames = suffix ? [`${resource}.${suffix}`, resource] : [resource];
  const matchedName = candidateNames.find((name) => templates.has(name));
  const matched = matchedName ? templates.get(matchedName) : undefined;

  return {
    template: matchedName ?? resource,
    sections: matched?.sections ?? [],
    dynamicSections: matched?.dynamicSections ?? 0,
    themeFiles: matched?.themeFiles ?? [],
    themeStructure: matched?.themeStructure,
  };
}
