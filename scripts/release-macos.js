#!/usr/bin/env node

/**
 * Builds and publishes a macOS release, keeping every version number, the updater manifest and
 * the website's download link in step.
 *
 *   node scripts/release-macos.js build 0.1.2 --notes "What changed"
 *   (commit the version bump and push it)
 *   node scripts/release-macos.js publish 0.1.2
 *
 * `build` never publishes. `publish` uploads to a draft first and only then makes it public, so
 * apps checking for updates never see a half-uploaded release.
 *
 * Options for `build`: --fe-branch <name> (default main), --allow-dirty.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FE = path.resolve(ROOT, '../focusanalyze-fe');
const REPO = 'D-GopalKrishna/focusanalyze-desktop';
const PLATFORM = 'darwin-aarch64';
const APP_ARCHIVE = 'FocusAnalyze.app.tar.gz';
/** Version-less name the website links to through `releases/latest/download/`. */
const STABLE_DMG = 'FocusAnalyze_aarch64.dmg';
const BUNDLE = path.join(ROOT, 'src-tauri/target/release/bundle');
const VERSION_FILES = [
	['package.json', /("version":\s*")[^"]+(")/],
	['src-tauri/tauri.conf.json', /("version":\s*")[^"]+(")/],
	['src-tauri/tauri.fe.conf.json', /("version":\s*")[^"]+(")/],
	['src-tauri/Cargo.toml', /(^version = ")[^"]+(")/m],
];
const PRODUCTION_ENV = {
	NEXT_PUBLIC_API_URL: 'https://mind.focusanalyze.com',
	NEXT_PUBLIC_KEYCLOAK_URL: 'https://accounts.focusanalyze.com',
	NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: 'focusanalyze-desktop',
};

function parseVersion(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
	return match ? match.slice(1).map(Number) : null;
}

function isNewerVersion(next, current) {
	const a = parseVersion(next);
	const b = parseVersion(current);
	if (!a || !b) return false;
	for (let i = 0; i < 3; i += 1) {
		if (a[i] !== b[i]) return a[i] > b[i];
	}
	return false;
}

function buildManifest({ version, notes, signature, pubDate }) {
	return {
		version,
		notes,
		pub_date: pubDate,
		platforms: {
			[PLATFORM]: {
				signature: signature.trim(),
				url: `https://github.com/${REPO}/releases/download/v${version}/${APP_ARCHIVE}`,
			},
		},
	};
}

function setVersion(contents, pattern, version) {
	if (!pattern.test(contents)) throw new Error('version field not found');
	return contents.replace(pattern, `$1${version}$2`);
}

function setLockVersion(contents, version) {
	const lock = JSON.parse(contents);
	lock.version = version;
	lock.packages[''].version = version;
	return `${JSON.stringify(lock, null, 2)}\n`;
}

function fail(message) {
	console.error(`\nRelease stopped: ${message}`);
	process.exit(1);
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options });
	if (result.status !== 0) {
		fail(`${command} ${args.join(' ')} failed\n${(result.stderr || result.stdout || '').trim()}`);
	}
	return (result.stdout || '').trim();
}

function artifactsDir(version) {
	return path.join(ROOT, 'src-tauri/target/release-artifacts', version);
}

function dirtyFiles(cwd) {
	return run('git', ['status', '--porcelain'], { cwd });
}

function readOption(args, name) {
	const index = args.indexOf(name);
	return index === -1 ? undefined : args[index + 1];
}

function build(version, args) {
	const notes = readOption(args, '--notes');
	if (!notes) fail('--notes "What changed" is required; users see it in the update dialog.');
	const feBranch = readOption(args, '--fe-branch') || 'main';
	const allowDirty = args.includes('--allow-dirty');

	const current = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri/tauri.fe.conf.json'), 'utf8')).version;
	if (version !== current && !isNewerVersion(version, current)) {
		fail(`${version} is not newer than the current ${current}.`);
	}

	const actualBranch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: FE });
	if (actualBranch !== feBranch) {
		fail(`focusanalyze-fe is on "${actualBranch}", expected "${feBranch}". This script never switches branches; switch it yourself or pass --fe-branch.`);
	}
	if (!allowDirty && (dirtyFiles(FE) || dirtyFiles(ROOT))) {
		fail('focusanalyze-fe or focusanalyze-desktop has uncommitted changes, which would ship in this build. Commit them or pass --allow-dirty.');
	}

	const keyPath = path.join(os.homedir(), '.tauri/focusanalyze-desktop.key');
	const passwordPath = `${keyPath}.password`;
	if (!fs.existsSync(keyPath) || !fs.existsSync(passwordPath)) {
		fail(`updater signing key not found at ${keyPath}.`);
	}

	for (const [file, pattern] of VERSION_FILES) {
		const full = path.join(ROOT, file);
		fs.writeFileSync(full, setVersion(fs.readFileSync(full, 'utf8'), pattern, version));
	}
	const lockPath = path.join(ROOT, 'package-lock.json');
	fs.writeFileSync(lockPath, setLockVersion(fs.readFileSync(lockPath, 'utf8'), version));

	const startedAt = Date.now();
	const feSha = run('git', ['rev-parse', '--short', 'HEAD'], { cwd: FE });
	console.log(`Building ${version} from focusanalyze-fe ${feBranch} ${feSha}...`);
	run('npx', ['tauri', 'build', '--config', 'src-tauri/tauri.fe.conf.json', '--bundles', 'app,dmg'], {
		stdio: 'inherit',
		env: {
			...process.env,
			...PRODUCTION_ENV,
			TAURI_SIGNING_PRIVATE_KEY: fs.readFileSync(keyPath, 'utf8'),
			TAURI_SIGNING_PRIVATE_KEY_PASSWORD: fs.readFileSync(passwordPath, 'utf8').trim(),
		},
	});

	const archive = path.join(BUNDLE, 'macos', APP_ARCHIVE);
	const dmg = path.join(BUNDLE, 'dmg', `FocusAnalyze_${version}_aarch64.dmg`);
	for (const file of [archive, `${archive}.sig`, dmg]) {
		if (!fs.existsSync(file)) fail(`expected build output is missing: ${file}`);
		if (fs.statSync(file).mtimeMs < startedAt) fail(`build output is left over from an earlier build: ${file}`);
	}
	const built = run('/usr/libexec/PlistBuddy', [
		'-c',
		'Print :CFBundleShortVersionString',
		path.join(BUNDLE, 'macos/FocusAnalyze.app/Contents/Info.plist'),
	]);
	if (built !== version) fail(`the built app reports version ${built}, expected ${version}.`);

	const out = artifactsDir(version);
	fs.rmSync(out, { recursive: true, force: true });
	fs.mkdirSync(out, { recursive: true });
	fs.copyFileSync(archive, path.join(out, APP_ARCHIVE));
	fs.copyFileSync(dmg, path.join(out, path.basename(dmg)));
	fs.copyFileSync(dmg, path.join(out, STABLE_DMG));
	const manifest = buildManifest({
		version,
		notes,
		signature: fs.readFileSync(`${archive}.sig`, 'utf8'),
		pubDate: new Date().toISOString(),
	});
	fs.writeFileSync(path.join(out, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

	console.log(`\nArtifacts: ${out}`);
	console.log('Next: install the DMG and try it, commit and push the version bump, then run:');
	console.log(`  node scripts/release-macos.js publish ${version}`);
}

function publish(version) {
	const out = artifactsDir(version);
	const manifestPath = path.join(out, 'latest.json');
	if (!fs.existsSync(manifestPath)) fail(`no build found for ${version}. Run the build step first.`);
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	if (manifest.version !== version) fail(`latest.json is for ${manifest.version}, not ${version}.`);

	const tag = `v${version}`;
	if (dirtyFiles(ROOT)) fail('focusanalyze-desktop has uncommitted changes. Commit the version bump first.');
	const sha = run('git', ['rev-parse', 'HEAD']);
	if (!run('git', ['branch', '-r', '--contains', sha])) fail('this commit is not pushed yet. Push it first.');
	if (spawnSync('gh', ['release', 'view', tag, '--repo', REPO], { cwd: ROOT }).status === 0) {
		fail(`release ${tag} already exists.`);
	}

	const files = fs.readdirSync(out).map((file) => path.join(out, file));
	run('gh', [
		'release', 'create', tag, ...files,
		'--repo', REPO, '--target', sha, '--title', `FocusAnalyze ${version}`,
		'--notes', manifest.notes, '--draft',
	], { stdio: 'inherit' });
	run('gh', ['release', 'edit', tag, '--repo', REPO, '--draft=false', '--latest'], { stdio: 'inherit' });
	console.log(`\nPublished https://github.com/${REPO}/releases/tag/${tag}`);
}

function main() {
	const [command, version, ...args] = process.argv.slice(2);
	if (!['build', 'publish'].includes(command) || !parseVersion(version)) {
		fail('usage: release-macos.js build <x.y.z> --notes "What changed" | publish <x.y.z>');
	}
	if (process.platform !== 'darwin') fail('this script only builds on macOS.');
	if (command === 'build') build(version, args);
	else publish(version);
}

if (require.main === module) main();

module.exports = { buildManifest, isNewerVersion, parseVersion, setLockVersion, setVersion, VERSION_FILES };
