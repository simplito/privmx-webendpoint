export interface AppRequest {
    kind: string;
    clientId?: string;
    data?: any;
}

export interface RequestOpaque {
    requestId: number;
    clientId?: string;
    request: AppRequest;
}

