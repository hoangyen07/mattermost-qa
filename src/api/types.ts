export type User = {
    id: string;
    username: string;
};

export type ApiError = {
    id: string;
    message: string;
    status_code: number;
};

export type Channel = {
    id: string;
    name: string;
    display_name: string;
    team_id: string;
};

export type Post = {
    id: string;
    message: string;
    channel_id: string;
};
