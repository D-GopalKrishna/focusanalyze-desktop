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
const lockPath = path.join(fePath, '.tauri-build-stash.lock');

// { originalPath, stashPath }
const moved = [];
let haveLock = false;

/**
 * Two overlapping runs of this script used to be able to destroy each other's work:
 * excludeScopedPaths() unconditionally `rm -rf`'d any existing stash dir before making
 * its own, so a second run starting while a first was still mid-build would delete the
 * first run's already-moved files — the only copy of their current state, since they'd
 * already been renamed out of app/. `wx` is an atomic exclusive-create: it fails if the
 * lock file already exists, so only one run can ever hold it at a time.
 */
function acquireLock() {
	try {
		fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
		haveLock = true;
	} catch (err) {
		if (err.code === 'EEXIST') {
			const holder = fs.readFileSync(lockPath, 'utf8').trim();
			console.error(
				`Another build-fe.js run (pid ${holder}) appears to be in progress (lock file: ${lockPath}).\n` +
					`Wait for it to finish. If it actually crashed without cleaning up (verify no such process ` +
					`is running), delete the lock file and re-run — any leftover stash will be restored first.`,
			);
			process.exit(1);
		}
		throw err;
	}
}

function releaseLock() {
	if (haveLock && fs.existsSync(lockPath)) {
		fs.rmSync(lockPath, { force: true });
	}
}

/** Moves everything currently in the stash back to its original app/ location. */
function restoreFromStash(root) {
	if (!fs.existsSync(root)) {
		return;
	}
	for (const relativePath of scope.excludePaths) {
		const stashPath = path.join(root, relativePath);
		const originalPath = path.join(fePath, relativePath);
		if (fs.existsSync(stashPath) && !fs.existsSync(originalPath)) {
			fs.mkdirSync(path.dirname(originalPath), { recursive: true });
			fs.renameSync(stashPath, originalPath);
			console.log(`Restored from stash: ${relativePath}`);
		}
	}
	fs.rmSync(root, { recursive: true, force: true });
}

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
	// A stash dir here means a *previous* run crashed before restoring (the lock we just
	// acquired guarantees nothing concurrent is using it right now) — recover it instead
	// of the old behavior of just deleting it.
	restoreFromStash(stashRoot);
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
	releaseLock();
	process.exit(130);
});
process.on('SIGTERM', () => {
	restoreAll();
	releaseLock();
	process.exit(143);
});

try {
	acquireLock();
	excludeScopedPaths();

	console.log(`Building FE static export for Tauri from: ${fePath}`);

	const result = spawnSync(packageManager, ['run', 'build'], {
		cwd: fePath,
		stdio: 'inherit',
		shell: true,
		env: {
			...process.env,
			IS_TAURI: 'true',
			NODE_ENV: 'production',
		},
	});

	exitCode = result.status ?? 1;
} finally {
	restoreAll();
	releaseLock();
}

process.exit(exitCode);
