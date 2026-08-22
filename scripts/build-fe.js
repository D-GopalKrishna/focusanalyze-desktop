#!/usr/bin/env node

/**
 * Builds focusanalyze-fe static export for Tauri production bundles.
 *
 * Next's `output: 'export'` mode requires every route to be static-renderable.
 * focusanalyze-fe is a full web app (marketing site + dashboard) and has routes
 * that are either marketing-only or genuinely dynamic (cookies/POST bodies) and
 * can't be exported. The desktop app only ever shows the authenticated dashboard
 * post-login, so before building we temporarily move the out-of-scope paths
 * listed in tauri-build-scope.json out of app/, build, then move them back
 * (always, even on failure/interrupt) so the focusanalyze-fe working tree is
 * untouched afterwards.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REF_PATH = path.join(ROOT, 'frontend-ref.json');
const DEFAULT_FE_PATH = path.resolve(ROOT, '../focusanalyze-fe');
const SCOPE_PATH = path.join(__dirname, 'tauri-build-scope.json');

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

const scope = JSON.parse(fs.readFileSync(SCOPE_PATH, 'utf8'));
const stashRoot = path.join(fePath, '.tauri-build-stash');

// { originalPath, stashPath }
const moved = [];

function restoreAll() {
	for (const entry of moved.reverse()) {
		if (fs.existsSync(entry.stashPath) && !fs.existsSync(entry.originalPath)) {
			fs.renameSync(entry.stashPath, entry.originalPath);
		}
	}
	moved.length = 0;
	if (fs.existsSync(stashRoot)) {
		fs.rmSync(stashRoot, { recursive: true, force: true });
	}
}

function excludeScopedPaths() {
	fs.rmSync(stashRoot, { recursive: true, force: true });
	fs.mkdirSync(stashRoot, { recursive: true });

	for (const relativePath of scope.excludePaths) {
		const originalPath = path.join(fePath, relativePath);
		if (!fs.existsSync(originalPath)) {
			continue;
		}

		const stashPath = path.join(stashRoot, relativePath);
		fs.mkdirSync(path.dirname(stashPath), { recursive: true });
		fs.renameSync(originalPath, stashPath);
		moved.push({ originalPath, stashPath });
		console.log(`Excluded from Tauri build: ${relativePath}`);
	}
}

let exitCode = 1;

process.on('SIGINT', () => {
	restoreAll();
	process.exit(130);
});
process.on('SIGTERM', () => {
	restoreAll();
	process.exit(143);
});

try {
	excludeScopedPaths();

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

	exitCode = result.status ?? 1;
} finally {
	restoreAll();
}

process.exit(exitCode);
