import { Pool } from 'pg';

// Column names as stored by Mattermost (lowercase, no underscores)
export type PostRow = {
    id: string;
    channelid: string;
    userid: string;
    message: string;
    createat: string; // bigint: pg returns it as a string, see below
    deleteat: string;
};

export class MattermostDb {
    private readonly pool: Pool;

    constructor(config: { host: string; port: number; user: string; password: string; database: string }) {
        this.pool = new Pool(config);
    }

    async getPost(id: string): Promise<PostRow | undefined> {
        const result = await this.pool.query<PostRow>(
            'SELECT id, channelid, userid, message, createat, deleteat FROM posts WHERE id = $1',
            [id],
        );
        return result.rows[0];
    }

    async close(): Promise<void> {
        await this.pool.end();
    }
}
