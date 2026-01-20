/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi";
import { SearchApiNative } from "../api/SearchApiNative";
import { ContainerPolicy, IndexMode, PagingList, PagingQuery, SearchIndex, UserWithPubKey, Document } from "../Types";

export class SearchApi extends BaseApi {
  constructor(private native: SearchApiNative, ptr: number) {
    super(ptr);
  }

  /**
   * Creates a new Search Index in a given Context.
   * 
    * @param {string} contextId ID of the Context to create the Index in
    * @param {UserWithPubKey[]} users vector of UserWithPubKey structs which indicates who will have access to the created Index
    * @param {UserWithPubKey[]} managers vector of UserWithPubKey structs which indicates who will have access 
    * (and management rights) to the created Index
    * @param {Uint8Array} publicMeta public (unencrypted) metadata
    * @param {Uint8Array} privateMeta private (encrypted) metadata
    * @param {IndexMode} mode The operating mode of the Index, defining how document content is handled.
    * @param {ContainerPolicy} policies Index's policies
    * @returns {string} ID of the created Search Index
   */
  async createSearchIndex(
    contextId: string,
    users: UserWithPubKey[],
    managers: UserWithPubKey[],
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    mode: IndexMode,
    policies: ContainerPolicy
  ): Promise<string> {
    return this.native.createSearchIndex(this.servicePtr, [
        contextId,
        users,
        managers,
        publicMeta,
        privateMeta,
        mode,
        policies
    ]);
  }

  /**
   * Updates an existing Search Index.
   * 
     * @param {string} indexId ID of the Index to update
     * @param {UserWithPubKey[]} users vector of UserWithPubKey structs which indicates who will have access to the Index
     * @param {UserWithPubKey[]} managers vector of UserWithPubKey structs which indicates who will have access 
     * (and management rights) to the Index
     * @param {Uint8Array} publicMeta public (unencrypted) metadata
     * @param {Uint8Array} privateMeta private (encrypted) metadata
     * @param {number} version current version of the updated Index
     * @param {boolean} force force update (without checking version)
     * @param {boolean} forceGenerateNewKey force to regenerate a key for the Index
     * @param {ContainerPolicy} policies Index's policies
   */
  async updateSearchIndex(
    indexId: string,
    users: UserWithPubKey[],
    managers: UserWithPubKey[],
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    version: number,
    force: boolean,
    forceGenerateNewKey: boolean,
    policies: ContainerPolicy
  ): Promise<void> {
    return this.native.updateSearchIndex(this.servicePtr, [
        indexId,
        users,
        managers,
        publicMeta,
        privateMeta,
        version,
        force,
        forceGenerateNewKey,
        policies
    ]);
  }

  /**
   * Deletes a Search Index by given Index ID.
   * 
   * @param {string} indexId ID of the Index to delete
   */
  async deleteSearchIndex(
    indexId: string
  ): Promise<void> {
     return this.native.deleteSearchIndex(this.servicePtr, [
        indexId
     ]);
  };

  /**
   * Gets a Search Index by given Index ID.
   * 
   * @param {string} indexId ID of the Index to get
   * @return {SearchIndex} SearchIndex struct containing info about the Index
   */
  async getSearchIndex(
    indexId: string
  ): Promise<SearchIndex> {
     return this.native.getSearchIndex(this.servicePtr, [
        indexId
     ]);
  };

  /**
   * Gets a list of Search Indexes in given Context.
   * 
   * @param {string} contextId ID of the Context to get the Indexes from
   * @param {PagingQuery} pagingQuery struct with list query parameters
   * @return {PagingList<SearchIndex>} struct containing a list of Search Indexes
   */
  async listSearchIndexes(
    contextId: string,
    pagingQuery: PagingQuery
  ): Promise<PagingList<SearchIndex>> {
     return this.native.listSearchIndexes(this.servicePtr, [
        contextId,
        pagingQuery
     ]);
  };

  /**
   * Opens a Search Index for use and returns a handle.
   * 
   * @param {string} indexId ID of the Index to open
   * @return {number} Handle to the opened Search Index
   */
  async openSearchIndex(
    indexId: string
  ): Promise<number> {
     return this.native.openSearchIndex(this.servicePtr, [
        indexId
     ]);
  };

  /**
   * Closes the Search Index associated with the given handle.
   * 
   * @param {number} indexHandle Handle of the Search Index to close
   */
  async closeSearchIndex(
    indexHandle: number
  ): Promise<void> {
     return this.native.closeSearchIndex(this.servicePtr, [
        indexHandle
     ]);
  };

  /**
    * Adds a new document to the Search Index.
    *
    * @param {number} indexHandle Handle of the Index to add the document to
    * @param {string} name name of the document
    * @param {string} content content of the document
    * @return {number} ID of the newly added document
   */
  async addDocument(
    indexHandle: number,
    name: string,
    content: string
  ): Promise<number> {
     return this.native.addDocument(this.servicePtr, [
        indexHandle,
        name,
        content
     ]);
  };

  /**
   * Updates an existing document in the Search Index.
   * 
   * @param {number} indexHandle Handle of the Index containing the document
   * @param {Document} document Document struct with data for update
   */
  async updateDocument(
    indexHandle: number,
    document: Document
  ): Promise<void> {
     return this.native.updateDocument(this.servicePtr, [
        indexHandle,
        document
     ]);
  };

  /**
   * Deletes a document by given document ID from the Search Index.
   * 
   * @param {number} indexHandle Handle of the Index to delete the document from
   * @param {number} documentId ID of the document to delete
   */
  async deleteDocument(
    indexHandle: number,
    documentId: number
  ): Promise<void> {
     return this.native.deleteDocument(this.servicePtr, [
        indexHandle,
        documentId
     ]);
  };

  /**
   * Gets a document by given document ID from the Search Index.
   * 
   * @param {number} indexHandle Handle of the Index containing the document
   * @param {number} documentId ID of the document to get
   * @return {Document} Document struct containing the document data
   */
  async getDocument(
    indexHandle: number,
    documentId: number
  ): Promise<Document> {
     return this.native.getDocument(this.servicePtr, [
        indexHandle,
        documentId
     ]);
  };

  /**
   * Gets a list of documents (e.g., messages, threads, or custom documents) from a Search Index.
   * 
   * @param {string} indexHandle Handle of the Index containing documents
   * @param {PagingQuery} pagingQuery struct with list query parameters (can include search terms)
   * @return struct containing a list of documents
   */
  async listDocuments(
    indexHandle: number,
    pagingQuery: PagingQuery
  ): Promise<PagingList<Document>> {
     return this.native.listDocuments(this.servicePtr, [
        indexHandle,
        pagingQuery
     ]);
  };

  /**
   * Searches for documents in the Index.
   * 
   * @param {number} indexHandle Handle of the Index to search
   * @param {string} searchQuery Search query
   * @param {PagingQuery} pagingQuery struct with list query parameters (e.g., search query, pagination
   * @return {PagingList<Document>} struct containing a list of matching Documents
   */
  async searchDocuments(
    indexHandle: number,
    searchQuery: string,
    pagingQuery: PagingQuery
  ): Promise<PagingList<Document>> {
     return this.native.searchDocuments(this.servicePtr, [
        indexHandle,
        searchQuery,
        pagingQuery
     ]);
  };
}