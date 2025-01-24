import { Endpoint } from '..';
import { FileUploader } from './files';

/**
 * Represents payload that is sent to an Inbox.
 */
export interface InboxEntryPayload {
    /**
     * Content of the entry.
     */
    data: Uint8Array;

    /**
     * Optional files associated with the entry.
     */
    files?: Array<{
        /**
         *Optional, contains confidential data that will be encrypted before being sent to server.
         */
        privateMeta?: Uint8Array;

        /**
         *Optional, contains data that can be accessed by everyone and is not encrypted.
         */
        publicMeta?: Uint8Array;

        /**
         * Content of the file.
         */
        content: File;
    }>;
}

/**
 * Sends an entry to the specified inbox.
 *
 * @param {Awaited<ReturnType<typeof Endpoint.createInboxApi>>} inboxApi - The API instance used to interact with the inbox.
 * @param {string} inboxId - The ID of the target inbox where the entry will be sent.
 * @param {InboxEntryPayload} payload - The data payload for the inbox entry, including files, metadata, and other information.
 *
 * @returns {Promise<void>} A promise that resolves when the entry has been successfully sent.
 *
 */
export async function sendEntry(
    inboxApi: Awaited<ReturnType<typeof Endpoint.createInboxApi>>,
    inboxId: string,
    payload: InboxEntryPayload
): Promise<void> {
    const preparedFiles = payload.files
        ? await Promise.all(
              payload.files.map((file) => {
                  return FileUploader.prepareInboxUpload({
                      inboxApi,
                      file: file.content,
                      privateMeta: file.privateMeta,
                      publicMeta: file.publicMeta
                  });
              })
          )
        : [];

    const inboxEntryHandle = await inboxApi.prepareEntry(
        inboxId,
        payload.data,
        preparedFiles.map((file) => file.handle)
    );

    const uploaders = await Promise.all(
        preparedFiles.map((file) =>
            FileUploader.uploadInboxFile({
                inboxApi,
                inboxHandle: inboxEntryHandle,
                preparedFileUpload: file
            })
        )
    );

    await Promise.all(uploaders.map((uploader) => uploader.uploadFileContent()));

    await inboxApi.sendEntry(inboxEntryHandle);
}


