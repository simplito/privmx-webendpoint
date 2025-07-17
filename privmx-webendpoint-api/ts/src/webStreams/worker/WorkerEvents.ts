import { Key } from "../../Types";


export interface WorkerBaseEvent {
    operation: string;
}

export interface InitializeEvent extends WorkerBaseEvent {
    operation: "initialize";
}

export interface SetKeysEvent extends WorkerBaseEvent {
    operation: "setKeys";
    keys: Key[];
}
