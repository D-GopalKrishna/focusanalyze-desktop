#!/usr/bin/env node

/**
 * Builds focusanalyze-fe static export for Tauri production bundles.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REF_PATH = path.join(ROOT, 'frontend-ref.json');
const DEFAULT_FE_PATH = path.resolve(ROOT, '../focusanalyze-fe');

function resolveFrontendPath() {
	if (fs.existsSync(REF_PATH)) {
		const ref = JSON.parse(fs.readFileSync(REF_PATH, 'utf8'));
		if (ref.absolutePath && fs.existsSync(ref.absolutePath)) {
			return ref.absolutePath;
		}
		if (ref.localPath) {
			const resolved = path.resolve(ROOT, ref.localPath);
			if (fs.existsSync(resolved)) {
				return resolved;
			}
		}
	}

	return DEFAULT_FE_PATH;
}

const fePath = resolveFrontendPath();

if (!fs.existsSync(fePath)) {
	console.error('focusanalyze-fe not found. Run `npm run sync:frontend` first.');
	process.exit(1);
}

const packageManager = fs.existsSync(path.join(fePath, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';

console.log(`Building FE static export for Tauri from: ${fePath}`);

const result = spawnSync(packageManager, ['run', 'build'], {
	cwd: fePath,
	stdio: 'inherit',
	shell: true,
	env: {
		...process.env,
		IS_TAURI: 'true',
	},
});

process.exit(result.status ?? 1);
