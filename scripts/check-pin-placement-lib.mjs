/**
 * Placement rules for npm libraries in a lite app.
 * A name is never both kernel and catalog.
 */
const EXACT_PIN =
  /^(?<name>(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*)@(?<version>\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export function packageRoot(specifier) {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  const slash = specifier.indexOf("/");
  return slash === -1 ? specifier : specifier.slice(0, slash);
}

export function servedPackageRoots(clientMap, serverMap) {
  const roots = new Set();
  for (const spec of [...Object.keys(clientMap), ...Object.keys(serverMap)]) {
    roots.add(packageRoot(spec));
  }
  return roots;
}

export function parsePinName(spec) {
  const match = EXACT_PIN.exec(spec);
  return match?.groups?.name ?? null;
}

/**
 * @param {object} input
 * @param {{ name: string, version: string }[]} input.catalogPins
 * @param {Set<string>} input.kernelPackageRoots
 * @param {{ name: string, pinNames: string[] }[]} input.catalogEnablingRecipes
 * @param {{ starter: string, recipes: string[] }[]} input.starters
 * @returns {string[]}
 */
export function evaluatePlacement(input) {
  const errors = [];
  const catalogNames = new Set(input.catalogPins.map((pin) => pin.name));

  for (const pin of input.catalogPins) {
    if (input.kernelPackageRoots.has(pin.name)) {
      errors.push(
        `catalog pin "${pin.name}" is also a kernel served package (never both)`
      );
    }
  }

  for (const pin of input.catalogPins) {
    const ramps = input.catalogEnablingRecipes.filter((recipe) =>
      recipe.pinNames.includes(pin.name)
    );
    if (ramps.length === 0) {
      errors.push(`catalog pin "${pin.name}" has no recipe on-ramp`);
    }
  }

  for (const recipe of input.catalogEnablingRecipes) {
    const seededBy = input.starters
      .filter((starter) => starter.recipes.includes(recipe.name))
      .map((starter) => starter.starter)
      .sort();
    if (seededBy.length >= 2) {
      errors.push(
        `catalog-enabling recipe "${recipe.name}" is seeded by ${seededBy.join(" and ")} (≥2 starters → kernel)`
      );
    }
  }

  for (const recipe of input.catalogEnablingRecipes) {
    for (const pinName of recipe.pinNames) {
      if (!catalogNames.has(pinName)) {
        errors.push(
          `recipe "${recipe.name}" lists "${pinName}" which is not a catalog pin`
        );
      }
    }
  }

  return errors;
}
