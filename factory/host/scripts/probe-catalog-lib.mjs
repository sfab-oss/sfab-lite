/**
 * Catalog hosted-probe helpers. The CLI (`probe-catalog.mjs`) prints a plan
 * by default. `--live` is ask-first and refused unless PROBE_CATALOG_LIVE=1.
 */
import { parseCli } from "./parse-cli.mjs";

export const PROBE_LIVE_ENV = "PROBE_CATALOG_LIVE";
export const FAST_BAND_CPU_MS = 6000;
export const DEFAULT_ORG = "01KYTG1VEYSX6BG282XGD7M318";
export const DEFAULT_RECIPES = "lite/pdf-invoice,lite/xlsx-export";
export const DEFAULT_FACTORY = "https://lite.sfab.dev";

const RECIPE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LAST_IMPORT = /(?:^|\n)(import [\s\S]*?;)(?=\n(?!import ))/;
const LEADING_AT = /^@/;
const LITE_PREFIX = /^lite\//;

export function parseProbeArgs(argv) {
  const { values } = parseCli(
    {
      "dry-run": { type: "boolean", default: false },
      live: { type: "boolean", default: false },
      recipes: { type: "string", default: DEFAULT_RECIPES },
      "n-warm": { type: "string", default: "20" },
      "n-cold": { type: "string", default: "10" },
      "space-ms": { type: "string", default: "60000" },
      worker: { type: "string", default: "sfab-lite-check" },
      template: { type: "string", default: "erp" },
      org: { type: "string", default: DEFAULT_ORG },
      factory: { type: "string", default: DEFAULT_FACTORY },
      artifact: { type: "string", default: "" },
    },
    argv
  );
  const dryRun = values["dry-run"] === true;
  const live = values.live === true;
  if (dryRun && live) {
    throw new Error("probe-catalog — pass only one of --dry-run / --live");
  }
  return {
    mode: live ? "live" : "dry-run",
    recipes: splitRecipes(values.recipes),
    nWarm: parseCount(values["n-warm"], "n-warm"),
    nCold: parseCount(values["n-cold"], "n-cold"),
    spaceMs: parseCount(values["space-ms"], "space-ms"),
    worker: values.worker,
    template: values.template,
    org: values.org,
    factory: values.factory.replace(/\/$/, ""),
    artifact: values.artifact,
  };
}

export function buildPlan(args, when = new Date()) {
  const day = when.toISOString().slice(0, 10);
  return {
    mode: args.mode,
    template: args.template,
    org: args.org,
    recipes: args.recipes,
    mounts: args.recipes.map(recipeMountSpec),
    nWarm: args.nWarm,
    nCold: args.nCold,
    spaceMs: args.spaceMs,
    tailWorker: args.worker,
    factory: args.factory,
    artifact: args.artifact || `artifacts/${day}-probe-catalog.md`,
    liveEnv: PROBE_LIVE_ENV,
    kill: {
      exceededMemory: true,
      fastBandCpuMs: FAST_BAND_CPU_MS,
    },
  };
}

export function assertLiveAllowed(env) {
  if (env[PROBE_LIVE_ENV] !== "1") {
    throw new Error(
      `probe-catalog — --live requires ${PROBE_LIVE_ENV}=1 (ask-first; creates a throwaway prod app)`
    );
  }
}

export function recipeMountSpec(name) {
  const stripped = name.replace(LEADING_AT, "");
  const slug = stripped.replace(LITE_PREFIX, "");
  if (!RECIPE_SLUG.test(slug)) {
    throw new Error(`probe-catalog — bad recipe name ${name}`);
  }
  const ident = `${kebabToCamel(slug)}Routes`;
  return {
    recipe: stripped.startsWith("lite/") ? stripped : `lite/${slug}`,
    slug,
    ident,
    importLine: `import { ${ident} } from "./${slug}";`,
    routeCall: `.route("/${slug}", ${ident})`,
  };
}

export function mountOrgProtected(source, recipes) {
  let text = source.replaceAll("\r\n", "\n");
  if (!text.endsWith("\n")) {
    text += "\n";
  }
  for (const name of recipes) {
    const spec = recipeMountSpec(name);
    if (!text.includes(spec.importLine)) {
      text = insertImport(text, spec.importLine);
    }
    if (!text.includes(`.route("/${spec.slug}"`)) {
      text = insertRoute(text, spec.routeCall);
    }
  }
  return text;
}

export function classifyTailEvent(event) {
  const body =
    event?.event != null && typeof event.event === "object"
      ? { ...event.event, ...event }
      : event;
  const outcome = body?.outcome ?? "unknown";
  const cpuTime = body?.cpuTime;
  if (outcome === "exceededMemory") {
    return cpuTime != null && cpuTime < FAST_BAND_CPU_MS
      ? "exceededMemoryFast"
      : "exceededMemory";
  }
  if (outcome === "ok") {
    return "pass";
  }
  if (typeof cpuTime === "number" && cpuTime < FAST_BAND_CPU_MS) {
    return "fastBandKill";
  }
  return "other";
}

export function scoreTailEvents(events) {
  const counts = {
    pass: 0,
    exceededMemory: 0,
    exceededMemoryFast: 0,
    fastBandKill: 0,
    other: 0,
  };
  for (const event of events) {
    const kind = classifyTailEvent(event);
    counts[kind] += 1;
  }
  const kill =
    counts.exceededMemory + counts.exceededMemoryFast + counts.fastBandKill > 0;
  return { ...counts, kill };
}

export async function runProbeCatalog(argv, env, io, hooks = {}) {
  let args;
  try {
    args = parseProbeArgs(argv);
  } catch (err) {
    io.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
  const plan = buildPlan(args);
  if (args.mode === "dry-run") {
    io.log(JSON.stringify(plan, null, 2));
    return 0;
  }
  try {
    assertLiveAllowed(env);
  } catch (err) {
    io.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
  if (hooks.runLive) {
    return hooks.runLive(plan, env, io, hooks);
  }
  const { runLiveProbe } = await import("./probe-catalog-live.mjs");
  return runLiveProbe(plan, env, io, hooks);
}

function splitRecipes(raw) {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseCount(raw, flag) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`probe-catalog — --${flag} must be a non-negative integer`);
  }
  return n;
}

function kebabToCamel(slug) {
  return slug
    .split("-")
    .map((part, i) =>
      i === 0 ? part : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`
    )
    .join("");
}

function insertImport(text, importLine) {
  const match = LAST_IMPORT.exec(text);
  if (match?.index == null || match[1] == null) {
    return `${importLine}\n${text}`;
  }
  const at = match.index + match[0].length;
  return `${text.slice(0, at)}\n${importLine}${text.slice(at)}`;
}

function insertRoute(text, routeCall) {
  const end = text.lastIndexOf(";");
  if (end === -1) {
    throw new Error(
      "probe-catalog — org-protected index has no chain terminator"
    );
  }
  return `${text.slice(0, end)}\n  ${routeCall}${text.slice(end)}`;
}
