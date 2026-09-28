import 'dotenv/config';

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing env var: ${name}`);
    return value;
}

export const env = {
    baseUrl: process.env.BASE_URL ?? 'http://localhost:8065',
    adminUsername: required('MM_ADMIN_USERNAME'),
    adminPassword: required('MM_ADMIN_PASSWORD'),
    team: required('MM_TEAM'),
};
