import { Types } from '..';

export interface CreateContainerPayload {
    contextId: string;
    users: Types.UserWithPubKey[];
    managers: Types.UserWithPubKey[];
    publicMeta?: Uint8Array;
    privateMeta?: Uint8Array;
}

export interface UpdateContainerPayload {
    users: Types.UserWithPubKey[];
    managers: Types.UserWithPubKey[];
    publicMeta?: Uint8Array;
    privateMeta?: Uint8Array;
    version: number;
    options?: {
        force?: boolean;
        forceGenerateNewKey?: boolean;
    };
}
