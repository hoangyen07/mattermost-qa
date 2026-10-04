// Runs the Postman collection with values from .env,
// so credentials never have to be typed on the command line.
// Newman is run through npx instead of being a devDependency: its transitive
// dependencies carry known vulnerabilities, and it will be replaced by
// Playwright API tests.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const NEWMAN = 'newman@6.2.2';

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing env var: ${name}`);
    return value;
}

const baseUrl = process.env.BASE_URL ?? 'http://localhost:8065';

const result = spawnSync(
    'npx',
    // Keep each flag next to its value
    // prettier-ignore
    [
        '--yes', NEWMAN, 'run', 'postman/mattermost.postman_collection.json',
        '--environment', 'postman/local.postman_environment.json',
        '--env-var', `baseUrl=${baseUrl}/api/v4`,
        '--env-var', `username=${required('MM_ADMIN_USERNAME')}`,
        '--env-var', `password=${required('MM_ADMIN_PASSWORD')}`,
        '--env-var', `teamName=${required('MM_TEAM')}`,
    ],
    { stdio: 'inherit' },
);

// Pass Newman's exit code through so a failed assertion fails the npm script
process.exitCode = result.status ?? 1;
