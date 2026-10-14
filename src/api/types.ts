export type User = {
    id: string;
    username: string;
};

export type ApiError = {
    id: string;
    message: string;
    status_code: number;
};

export type Team = {
    id: string;
    name: string;
    display_name: string;
};

// 'O' = open (public), 'P' = private
export type ChannelType = 'O' | 'P';

export type Channel = {
    id: string;
    name: string;
    display_name: string;
    team_id: string;
    type: ChannelType;
};

export type NewChannel = {
    team_id: string;
    name: string;
    display_name: string;
    type: ChannelType;
};

export type Post = {
    id: string;
    message: string;
    channel_id: string;
};

export type NewPost = {
    channel_id: string;
    message: string;
};
