const assert = require('node:assert');
const test = require('node:test');
const { buildManifest, isNewerVersion, setLockVersion, setVersion, VERSION_FILES } = require('./release-macos.js');

test('compares versions numerically', () => {
	assert.ok(isNewerVersion('0.1.10', '0.1.9'));
	assert.ok(isNewerVersion('1.0.0', '0.9.9'));
	assert.ok(!isNewerVersion('0.1.1', '0.1.1'));
	assert.ok(!isNewerVersion('0.1.0', '0.1.1'));
	assert.ok(!isNewerVersion('v0.2', '0.1.1'));
});

test('manifest points at the tagged release and trims the signature', () => {
	const manifest = buildManifest({ version: '0.1.2', notes: 'n', signature: 'abc\n', pubDate: 'd' });
	const entry = manifest.platforms['darwin-aarch64'];
	assert.strictEqual(entry.signature, 'abc');
	assert.match(entry.url, /\/releases\/download\/v0\.1\.2\/FocusAnalyze\.app\.tar\.gz$/);
});

test('only the package version changes, not dependency versions', () => {
	const cargoPattern = VERSION_FILES.find(([file]) => file.endsWith('Cargo.toml'))[1];
	const cargo = '[package]\nname = "x"\nversion = "0.1.1"\nrust-version = "1.77.2"\n[dependencies]\nfoo = { version = "2" }\n';
	const out = setVersion(cargo, cargoPattern, '0.1.2');
	assert.match(out, /^version = "0\.1\.2"$/m);
	assert.match(out, /rust-version = "1\.77\.2"/);
	assert.match(out, /foo = \{ version = "2" \}/);

	const jsonPattern = VERSION_FILES.find(([file]) => file === 'package.json')[1];
	const json = '{\n  "name": "x",\n  "version": "0.1.1",\n  "dependencies": { "y": { "version": "9.9.9" } }\n}\n';
	const jsonOut = setVersion(json, jsonPattern, '0.1.2');
	assert.match(jsonOut, /"version": "0\.1\.2"/);
	assert.match(jsonOut, /"version": "9\.9\.9"/);
});

test('package-lock changes both root version fields and leaves dependencies alone', () => {
	const lock = JSON.stringify({
		version: '0.1.1',
		packages: { '': { version: '0.1.1' }, 'node_modules/y': { version: '9.9.9' } },
	});
	const out = JSON.parse(setLockVersion(lock, '0.1.2'));
	assert.strictEqual(out.version, '0.1.2');
	assert.strictEqual(out.packages[''].version, '0.1.2');
	assert.strictEqual(out.packages['node_modules/y'].version, '9.9.9');
});
