#!/usr/bin/env node

/**
 * Starts focusanalyze-fe dev server for Tauri (IS_TAURI=true).
 * Used as beforeDevCommand in tauri.fe.conf.json.
 * Reuses an existing dev server on the target port when one is already listening.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REF_PATH = path.join(ROOT, 'frontend-ref.json');
const DEFAULT_FE_PATH = path.resolve(ROOT, '../focusanalyze-fe');
const PORT = process.env.FE_DEV_PORT || '3000';

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

	if (fs.existsSync(DEFAULT_FE_PATH)) {
		return DEFAULT_FE_PATH;
	}

	console.error(
		'focusanalyze-fe not found. Run `npm run sync:frontend` first or clone ../focusanalyze-fe',
	);
	process.exit(1);
}

function isPortListening(port) {
	return new Promise((resolve) => {
		const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
			res.resume();
			resolve(true);
		});
		req.on('error', () => resolve(false));
		req.setTimeout(1500, () => {
			req.destroy();
			resolve(false);
		});
	});
}

function keepAlive() {
	process.stdin.resume();
	process.on('SIGINT', () => process.exit(0));
	process.on('SIGTERM', () => process.exit(0));
}

async function main() {
	const fePath = resolveFrontendPath();
	const packageManager = fs.existsSync(path.join(fePath, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';

	if (await isPortListening(PORT)) {
		console.log(
			`FE dev server already listening on http://localhost:${PORT} — reusing it for Tauri`,
		);
		keepAlive();
		return;
	}

	console.log(`Starting FE dev server for Tauri from: ${fePath}`);

	const child = spawn(packageManager, ['run', 'dev'], {
		cwd: fePath,
		stdio: 'inherit',
		shell: true,
		env: {
			...process.env,
			IS_TAURI: 'true',
			IS_HTTP: 'true',
			INTERNAL_HOST: process.env.INTERNAL_HOST || `localhost:${PORT}`,
			PORT,
			NEXT_PUBLIC_KEYCLOAK_URL: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080',
			NEXT_PUBLIC_KEYCLOAK_CLIENT_ID:
				process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'focusanalyze-desktop',
			NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
		},
	});

	child.on('exit', (code) => {
		process.exit(code ?? 1);
	});
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
