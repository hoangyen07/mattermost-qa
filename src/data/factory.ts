import { randomUUID } from 'node:crypto';
import type { NewChannel } from '../api/types';

// The fixture adds team_id: the factory only describes what the data looks like
export type ChannelData = Omit<NewChannel, 'team_id'>;

// Short random id: unique across parallel workers, unlike Date.now()
export function uniqueId(): string {
    return randomUUID().slice(0, 8);
}

export function buildChannel(overrides: Partial<ChannelData> = {}): ChannelData {
    const id = uniqueId();
    return {
        // Channel names must be lowercase letters, digits, '-' or '_'.
        // Archived channels keep their name, so every run needs a new one.
        name: `qa-${id}`,
        display_name: `QA ${id}`,
        type: 'O',
        // Last, so values passed by the test win over the defaults
        ...overrides,
    };
}

export function buildMessage(prefix = 'Hello from Playwright'): string {
    return `${prefix} ${uniqueId()}`;
}
