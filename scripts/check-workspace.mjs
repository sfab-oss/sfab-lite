#!/usr/bin/env node
/**
 * Workspace integrity: expected apps/packages exist and resolve as workspace pkgs.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const expected = [
	"apps/factory",
	"apps/check",
	"apps/lint",
	"packages/template",
	"packages/kernel",
	"packages/core",
];

const names = [
	"@sfab-lite/factory",
	"@sfab-lite/check",
	"@sfab-lite/lint",
	"@sfab-lite/template",
	"@sfab-lite/kernel",
	"@sfab-lite/core",
];

let failed = false;
for (let i = 0; i < expected.length; i++) {
	const dir = join(root, expected[i]);
	const pkgPath = join(dir, "package.json");
	const entry = join(dir, "src", "index.ts");
	const tsconfig = join(dir, "tsconfig.json");
	if (!existsSync(pkgPath) || !existsSync(entry) || !existsSync(tsconfig)) {
		console.error(`missing scaffold: ${expected[i]}`);
		failed = true;
		continue;
	}
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
	if (pkg.name !== names[i]) {
		console.error(
			`name mismatch in ${expected[i]}: got ${pkg.name}, want ${names[i]}`,
		);
		failed = true;
	}
}

const workspace = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
if (!workspace.includes("apps/*") || !workspace.includes("packages/*")) {
	console.error("pnpm-workspace.yaml must include apps/* and packages/*");
	failed = true;
}

if (failed) {
	process.exit(1);
}
console.log(`workspace ok: ${expected.length} units`);
