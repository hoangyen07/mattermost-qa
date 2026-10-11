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
    db: {
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        user: required('POSTGRES_USER'),
        password: required('POSTGRES_PASSWORD'),
        database: required('POSTGRES_DB'),
    },
};
