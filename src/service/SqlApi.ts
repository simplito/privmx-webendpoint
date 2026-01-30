/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi";
import { SqlApiNative } from "../api/SqlApiNative";
import { ContainerPolicy, PagingList, PagingQuery, SqlColumnPointer, SqlDatabase, SqlDatabaseHandlePointer, SqlDataType, SqlEvaluationStatus, SqlQueryPointer, SqlRowPointer, SqlTransactionPointer, UserWithPubKey } from "../Types";

export class SqlApi extends BaseApi {
  constructor(private native: SqlApiNative, ptr: number) {
    super(ptr);
  }

  /**
   * Creates a new SQL Database in a given Context.
   * 
    * @param {string} contextId ID of the Context to create the SQL Database in
    * @param {UserWithPubKey[]} users vector of UserWithPubKey structs which indicates who will have access to the created SQL Database
    * @param {UserWithPubKey[]} managers vector of UserWithPubKey structs which indicates who will have access 
    * (and management rights) to the created SQL Database
    * @param {Uint8Array} publicMeta public (unencrypted) metadata
    * @param {Uint8Array} privateMeta private (encrypted) metadata
    * @param {ContainerPolicy} policies SQL Database's policies
    * @returns {string} ID of the created SQL Database
   */
  async createSqlDatabase(
    contextId: string,
    users: UserWithPubKey[],
    managers: UserWithPubKey[],
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    policies?: ContainerPolicy
  ): Promise<string> {
    return this.native.createSqlDatabase(this.servicePtr, [
        contextId,
        users,
        managers,
        publicMeta,
        privateMeta,
        policies
    ]);
  }

  /**
   * Updates an existing SQL Database.
   * 
     * @param {string} indexId ID of the SQL Database to update
     * @param {UserWithPubKey[]} users vector of UserWithPubKey structs which indicates who will have access to the SQL Database
     * @param {UserWithPubKey[]} managers vector of UserWithPubKey structs which indicates who will have access 
     * (and management rights) to the SQL Database
     * @param {Uint8Array} publicMeta public (unencrypted) metadata
     * @param {Uint8Array} privateMeta private (encrypted) metadata
     * @param {number} version current version of the updated SQL Database
     * @param {boolean} force force update (without checking version)
     * @param {boolean} forceGenerateNewKey force to regenerate a key for the SQL Database
     * @param {ContainerPolicy} policies SQL Database's policies
   */
  async updateSqlDatabase(
    indexId: string,
    users: UserWithPubKey[],
    managers: UserWithPubKey[],
    publicMeta: Uint8Array,
    privateMeta: Uint8Array,
    version: number,
    force: boolean,
    forceGenerateNewKey: boolean,
    policies?: ContainerPolicy
  ): Promise<void> {
    return this.native.updateSqlDatabase(this.servicePtr, [
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
   * Deletes a SQL Database by given SQL Database ID.
   * 
   * @param {string} indexId ID of the SQL Database to delete
   */
  async deleteSqlDatabase(
    indexId: string
  ): Promise<void> {
     return this.native.deleteSqlDatabase(this.servicePtr, [
        indexId
     ]);
  };

  /**
   * Gets a SQL Database by given SQL Database ID.
   * 
   * @param {string} indexId ID of the SQL Database to get
   * @return {SqlDatabase} SqlDatabase struct containing info about the SQL Database
   */
  async getSqlDatabase(
    indexId: string
  ): Promise<SqlDatabase> {
     return this.native.getSqlDatabase(this.servicePtr, [
        indexId
     ]);
  };

  /**
   * Gets a list of SQL Databasees in given Context.
   * 
   * @param {string} contextId ID of the Context to get the SQL Databasees from
   * @param {PagingQuery} pagingQuery struct with list query parameters
   * @return {PagingList<SqlDatabase>} struct containing a list of SQL Databasees
   */
  async listSqlDatabasees(
    contextId: string,
    pagingQuery: PagingQuery
  ): Promise<PagingList<SqlDatabase>> {
     return this.native.listSqlDatabasees(this.servicePtr, [
        contextId,
        pagingQuery
     ]);
  };

  /**
   * Opens a SQL Database for use and returns a handle.
   * 
   * @param {string} indexId ID of the SQL Database to open
   * @return {DatabaseHandle} Handle to the opened SQL Database
   */
  async openSqlDatabase(
    indexId: string
  ): Promise<DatabaseHandle> {
     const ptr = await this.native.openSqlDatabase(this.servicePtr, [
        indexId
     ]);
     return new DatabaseHandle(this.native, this.servicePtr, ptr);
  };

}

// TODO: free resources
class DatabaseHandle {
   constructor(private readonly native: SqlApiNative, private readonly servicePtr: number, private readonly ptr: SqlDatabaseHandlePointer) {}
   async beginTransaction(): Promise<Transaction> {
      const ptr = await this.native.databaseHandleBeginTransaction(this.servicePtr, [this.ptr]);
      return new Transaction(this.native, this.servicePtr, ptr);
   }
   async query(sqlQuery: string): Promise<Query> {
      const ptr = await this.native.databaseHandleQuery(this.servicePtr, [this.ptr, sqlQuery]);
      return new Query(this.native, this.servicePtr, ptr);
   }
   async close(): Promise<void> {
      return this.native.databaseHandleClose(this.servicePtr, [this.ptr]);
   }
}

class Transaction {
   constructor(private readonly native: SqlApiNative, private readonly servicePtr: number, private readonly ptr: SqlTransactionPointer) {}
   async query(sqlQuery: string): Promise<Query> {
      const ptr = await this.native.transactionQuery(this.servicePtr, [this.ptr, sqlQuery]);
      return new Query(this.native, this.servicePtr, ptr);
   }
   async commit(): Promise<void> {
      return this.native.transactionCommit(this.servicePtr, [this.ptr]);
   }
   async rollback(): Promise<void> {
      return this.native.transactionRollback(this.servicePtr, [this.ptr]);
   }
}

class Query {
   constructor(private readonly native: SqlApiNative, private readonly servicePtr: number, private readonly ptr: SqlQueryPointer) {}
   async bindInt64(index: number, value: number): Promise<void> {
      return this.native.queryBindInt64(this.servicePtr, [this.ptr, index, value]);
   }
   async bindDouble(index: number, value: number): Promise<void> {
      return this.native.queryBindDouble(this.servicePtr, [this.ptr, index, value]);
   }
   async bindText(index: number, value: string): Promise<void> {
      return this.native.queryBindText(this.servicePtr, [this.ptr, index, value]);
   }
   async bindBlob(index: number, value: Uint8Array): Promise<void> {
      return this.native.queryBindBlob(this.servicePtr, [this.ptr, index, value]);
   }
   async bindNull(index: number): Promise<void> {
      return this.native.queryBindNull(this.servicePtr, [this.ptr, index]);
   }
   async step(): Promise<Row> {
      const ptr = await this.native.queryStep(this.servicePtr, [this.ptr]);
      return new Row(this.native, this.servicePtr, ptr);
   }
   async reset(): Promise<void> {
      return this.native.queryReset(this.servicePtr, [this.ptr]);
   }
}

class Row {
   constructor(private readonly native: SqlApiNative, private readonly servicePtr: number, private readonly ptr: SqlRowPointer) {}
   async getStatus(): Promise<SqlEvaluationStatus> {
      return this.native.rowGetStatus(this.servicePtr, [this.ptr]);
   }
   async getColumnCount(): Promise<number> {
      return this.native.rowGetColumnCount(this.servicePtr, [this.ptr]);
   }
   async getColumn(index: number): Promise<Column> {
      const ptr = await this.native.rowGetColumn(this.servicePtr, [this.ptr, index]);
      return new Column(this.native, this.servicePtr, ptr);
   }
}

class Column {
   constructor(private readonly native: SqlApiNative, private readonly servicePtr: number, private readonly ptr: SqlColumnPointer) {}
   async getName(): Promise<string> {
      return this.native.columnGetName(this.servicePtr, [this.ptr]);
   }
   async getType(): Promise<SqlDataType> {
      return this.native.columnGetType(this.servicePtr, [this.ptr]);
   }
   async getInt64(): Promise<number> {
      return this.native.columnGetInt64(this.servicePtr, [this.ptr]);
   }
   async getDouble(): Promise<number> {
      return this.native.columnGetDouble(this.servicePtr, [this.ptr]);
   }
   async getText(): Promise<string> {
      return this.native.columnGetText(this.servicePtr, [this.ptr]);
   }
   async getBlob(): Promise<Uint8Array> {
      return this.native.columnGetBlob(this.servicePtr, [this.ptr]);
   }
}
