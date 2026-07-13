#!/usr/bin/env node

/**
 * Syncs shareable frontend code into ./lib/shared from focusanalyze-fe.
 *
 * By default uses ../focusanalyze-fe and matches the current desktop git branch
 * (e.g. desktop on develop → sync FE develop; desktop on main → sync FE main).
 *
 * Usage:
 *   node scripts/sync-frontend-shared.js
 *   node scripts/sync-frontend-shared.js --branch main
 *   node scripts/sync-frontend-shared.js --local-path ../focusanalyze-fe
 *   node scripts/sync-frontend-shared.js --no-match-branch
 *   node scripts/sync-frontend-shared.js --update-local
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(__dirname, 'sync-frontend-manifest.json');
const VENDOR_DIR = path.join(ROOT, 'vendor', 'focusanalyze-fe');
const SHARED_DIR = path.join(ROOT, 'lib', 'shared');
const SYNC_META_PATH = path.join(SHARED_DIR, '.sync-meta.json');
const FRONTEND_REF_PATH = path.join(ROOT, 'frontend-ref.json');

const IMPORT_REWRITES = [
	[/from ['"]@\/lib\/rest_client_backend['"]/g, 'from "@shared/api-client"'],
	[/from ['"]@\/lib\/rest_client_backend\/([^'"]+)['"]/g, 'from "@shared/api-client/$1"'],
	[/from ['"]@\/lib\/services\/([^'"]+)['"]/g, 'from "@shared/services/$1"'],
	[/from ['"]@\/lib\/utils\/([^'"]+)['"]/g, 'from "@shared/utils/$1"'],
	[/from ['"]@\/lib\/types\/([^'"]+)['"]/g, 'from "@shared/types/$1"'],
	[/from ['"]@\/types\/([^'"]+)['"]/g, 'from "@shared/types/$1"'],
];

function parseArgs(argv) {
	const options = {
		branch: null,
		localPath: process.env.FRONTEND_LOCAL_PATH || null,
		keepVendor: false,
		updateLocal: false,
		matchDesktopBranch: true,
		help: false,
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];

		if (arg === '--help' || arg === '-h') {
			options.help = true;
			continue;
		}

		if (arg === '--keep-vendor') {
			options.keepVendor = true;
			continue;
		}

		if (arg === '--update-local') {
			options.updateLocal = true;
			continue;
		}

		if (arg === '--no-match-branch') {
			options.matchDesktopBranch = false;
			continue;
		}

		if (arg === '--branch' || arg === '-b') {
			options.branch = argv[i + 1];
			i += 1;
			continue;
		}

		if (arg === '--local-path') {
			options.localPath = argv[i + 1];
			i += 1;
			continue;
		}

		if (arg.startsWith('--branch=')) {
			options.branch = arg.split('=')[1];
			continue;
		}

		if (arg.startsWith('--local-path=')) {
			options.localPath = arg.split('=')[1];
			continue;
		}
	}

	return options;
}

function printHelp(manifest) {
	console.log(`Sync shareable code from focusanalyze-fe into ./lib/shared

Options:
  --branch, -b <name>   Git branch to sync (default: current desktop branch, else ${manifest.defaultBranch})
  --local-path <path>   Local FE checkout (default: ${manifest.defaultLocalPath})
  --update-local        Fetch/checkout/pull requested branch before sync
  --no-match-branch     Do not auto-checkout FE to match desktop branch
  --keep-vendor         Keep vendor/focusanalyze-fe after remote clone
  --help, -h            Show this help

Environment:
  FRONTEND_LOCAL_PATH   Same as --local-path

Examples:
  npm run sync:frontend
  npm run sync:frontend -- --branch main
  npm run sync:frontend -- --local-path ../focusanalyze-fe --update-local
`);
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		encoding: 'utf8',
		stdio: options.stdio || 'pipe',
	});

	if (result.status !== 0) {
		const stderr = result.stderr?.trim();
		const stdout = result.stdout?.trim();
		const details = stderr || stdout || `exit code ${result.status}`;
		throw new Error(`${command} ${args.join(' ')} failed: ${details}`);
	}

	return result.stdout?.trim() ?? '';
}

function detectDesktopBranch() {
	if (!fs.existsSync(path.join(ROOT, '.git'))) {
		return null;
	}

	try {
		return run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT });
	} catch {
		return null;
	}
}

function ensureDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true });
}

function removeDir(dirPath) {
	if (fs.existsSync(dirPath)) {
		fs.rmSync(dirPath, { recursive: true, force: true });
	}
}

function copyPath(sourcePath, destPath) {
	const sourceStat = fs.statSync(sourcePath);

	ensureDir(path.dirname(destPath));

	if (sourceStat.isDirectory()) {
		fs.cpSync(sourcePath, destPath, { recursive: true });
		return;
	}

	fs.copyFileSync(sourcePath, destPath);
}

function collectFiles(dirPath, files = []) {
	for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
		const fullPath = path.join(dirPath, entry.name);

		if (entry.isDirectory()) {
			collectFiles(fullPath, files);
			continue;
		}

		if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
			files.push(fullPath);
		}
	}

	return files;
}

function rewriteImports(filePath) {
	let contents = fs.readFileSync(filePath, 'utf8');
	let changed = false;

	for (const [pattern, replacement] of IMPORT_REWRITES) {
		const updated = contents.replace(pattern, replacement);
		if (updated !== contents) {
			contents = updated;
			changed = true;
		}
	}

	if (changed) {
		fs.writeFileSync(filePath, contents, 'utf8');
	}
}

function alignLocalBranch(localPath, branch, options) {
	const shouldAlign =
		options.updateLocal || (options.matchDesktopBranch && !options.branch);

	if (!shouldAlign) {
		const currentBranch = run('git', ['-C', localPath, 'rev-parse', '--abbrev-ref', 'HEAD']);
		if (currentBranch !== branch) {
			console.log(
				`Warning: local FE is on "${currentBranch}", desktop requested "${branch}". ` +
					'Pass --update-local to switch branches.',
			);
		}
		return;
	}

	console.log(`Aligning local FE checkout to branch "${branch}"...`);
	try {
		run('git', ['-C', localPath, 'fetch', 'origin', branch], { stdio: 'inherit' });
		run('git', ['-C', localPath, 'checkout', branch], { stdio: 'inherit' });
		run('git', ['-C', localPath, 'pull', '--ff-only', 'origin', branch], {
			stdio: 'inherit',
		});
	} catch (error) {
		const currentBranch = run('git', ['-C', localPath, 'rev-parse', '--abbrev-ref', 'HEAD']);
		console.warn(
			`\nCould not switch FE to "${branch}" (${error.message}). ` +
				`Continuing with current FE branch "${currentBranch}". ` +
				'Stash or commit FE changes, then re-run sync:frontend.',
		);
	}
}

function resolveFrontendSource(options, manifest) {
	const desktopBranch = detectDesktopBranch();
	const branch = options.branch || desktopBranch || manifest.defaultBranch;
	const defaultLocalPath = path.resolve(ROOT, manifest.defaultLocalPath);
	const localPath = options.localPath
		? path.resolve(options.localPath)
		: fs.existsSync(defaultLocalPath)
			? defaultLocalPath
			: null;

	if (localPath) {
		if (!fs.existsSync(localPath)) {
			throw new Error(`Local frontend path does not exist: ${localPath}`);
		}

		console.log(`Using local frontend checkout: ${localPath}`);
		if (desktopBranch) {
			console.log(`Desktop branch: ${desktopBranch}`);
		}

		const isGitRepo = fs.existsSync(path.join(localPath, '.git'));
		if (isGitRepo) {
			alignLocalBranch(localPath, branch, options);
		}

		return {
			sourceRoot: localPath,
			branch: isGitRepo
				? run('git', ['-C', localPath, 'rev-parse', '--abbrev-ref', 'HEAD'])
				: branch,
			commit: isGitRepo ? run('git', ['-C', localPath, 'rev-parse', 'HEAD']) : 'local',
			sourceLabel: localPath,
			localPath,
		};
	}

	console.log(`Cloning ${manifest.repoUrl} (branch: ${branch})...`);
	removeDir(VENDOR_DIR);
	ensureDir(path.dirname(VENDOR_DIR));

	run('git', ['clone', '--depth', '1', '--branch', branch, manifest.repoUrl, VENDOR_DIR], {
		stdio: 'inherit',
	});

	return {
		sourceRoot: VENDOR_DIR,
		branch,
		commit: run('git', ['-C', VENDOR_DIR, 'rev-parse', 'HEAD']),
		sourceLabel: manifest.repoUrl,
		localPath: null,
	};
}

function resolveSourcePath(sourceRoot, entry) {
	const candidates = entry.sources ?? [entry.source];

	for (const candidate of candidates) {
		const sourcePath = path.join(sourceRoot, candidate);
		if (fs.existsSync(sourcePath)) {
			return { sourcePath, source: candidate };
		}
	}

	throw new Error(`Missing source path in frontend repo. Tried: ${candidates.join(', ')}`);
}

function syncPaths(sourceRoot, manifest) {
	const copied = [];

	for (const entry of manifest.paths) {
		const { sourcePath, source } = resolveSourcePath(sourceRoot, entry);
		const destPath = path.join(ROOT, entry.dest);

		removeDir(destPath);
		copyPath(sourcePath, destPath);

		copied.push({
			source,
			dest: entry.dest,
		});

		console.log(`Copied ${source} -> ${entry.dest}`);
	}

	return copied;
}

function rewriteSharedImports() {
	const files = collectFiles(SHARED_DIR);

	for (const filePath of files) {
		rewriteImports(filePath);
	}

	console.log(`Rewrote imports in ${files.length} file(s)`);
}

function writeJson(filePath, data) {
	fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeFrontendRef(meta) {
	const feRoot = meta.localPath || meta.source;
	const relativeFePath = meta.localPath
		? path.relative(ROOT, meta.localPath)
		: '../focusanalyze-fe';

	writeJson(FRONTEND_REF_PATH, {
		localPath: relativeFePath,
		absolutePath: feRoot,
		branch: meta.branch,
		commit: meta.commit,
		syncedAt: meta.syncedAt,
		tauriDevUrl: 'http://localhost:3000',
		tauriFrontendDist: path.join(relativeFePath, 'out'),
	});
}

function main() {
	const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
	const options = parseArgs(process.argv.slice(2));

	if (options.help) {
		printHelp(manifest);
		return;
	}

	const startedAt = new Date().toISOString();
	const { sourceRoot, branch, commit, sourceLabel, localPath } = resolveFrontendSource(
		options,
		manifest,
	);

	removeDir(SHARED_DIR);
	ensureDir(SHARED_DIR);

	const copied = syncPaths(sourceRoot, manifest);
	rewriteSharedImports();

	const meta = {
		syncedAt: startedAt,
		repoUrl: manifest.repoUrl,
		source: sourceLabel,
		localPath,
		branch,
		commit,
		copied,
	};

	writeJson(SYNC_META_PATH, meta);
	writeFrontendRef(meta);

	if (!options.keepVendor && !options.localPath && !localPath) {
		removeDir(path.join(ROOT, 'vendor'));
		console.log('Removed temporary vendor clone');
	}

	console.log('\nFrontend shared sync complete');
	console.log(`  branch: ${branch}`);
	console.log(`  commit: ${commit.slice(0, 12)}`);
	console.log(`  meta:   ${path.relative(ROOT, SYNC_META_PATH)}`);
	console.log(`  ref:    ${path.relative(ROOT, FRONTEND_REF_PATH)}`);
}

try {
	main();
} catch (error) {
	console.error(`\nSync failed: ${error.message}`);
	process.exit(1);
}
