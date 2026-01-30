/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { ContainerPolicy, PagingList, PagingQuery, SqlColumnPointer, SqlDatabase, SqlDatabaseHandlePointer, SqlDataType, SqlEvaluationStatus, SqlQueryPointer, SqlRowPointer, SqlTransactionPointer, UserWithPubKey } from "../Types";
import { BaseNative } from "./BaseNative";

export class SqlApiNative extends BaseNative {
    async newApi(connectionPtr: number, storeApiPtr: number, kvdbApiPtr: number): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.SqlApi_newSqlApi(taskId, connectionPtr, storeApiPtr, kvdbApiPtr));
    }
    async deleteApi(ptr: number): Promise<void> {
        this.runAsync<void>((taskId)=>this.api.lib.SqlApi_deleteSqlApi(taskId, ptr));
        this.deleteApiRef();
    }
    async create(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_create(taskId, ptr, args));
    }
    async createSqlDatabase(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, ContainerPolicy|undefined]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.SqlApi_createSqlDatabase(taskId, ptr, args));
    }
    async updateSqlDatabase(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, number, boolean, boolean, ContainerPolicy|undefined]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_updateSqlDatabase(taskId, ptr, args));
    }
    async deleteSqlDatabase(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_deleteSqlDatabase(taskId, ptr, args));
    }
    async getSqlDatabase(ptr: number, args: [string]): Promise<SqlDatabase> {
        return this.runAsync<SqlDatabase>((taskId)=>this.api.lib.SqlApi_getSqlDatabase(taskId, ptr, args));
    }
    async listSqlDatabasees(ptr: number, args: [string, PagingQuery]): Promise<PagingList<SqlDatabase>> {
        return this.runAsync<PagingList<SqlDatabase>>((taskId)=>this.api.lib.SqlApi_listSqlDatabasees(taskId, ptr, args));
    }
    async openSqlDatabase(ptr: number, args: [string]): Promise<SqlDatabaseHandlePointer> {
        return this.runAsync<SqlDatabaseHandlePointer>((taskId)=>this.api.lib.SqlApi_openSqlDatabase(taskId, ptr, args));
    }
    async databaseHandleBeginTransaction(ptr: number, args: [SqlDatabaseHandlePointer]): Promise<SqlTransactionPointer> {
        return this.runAsync<SqlTransactionPointer>((taskId)=>this.api.lib.SqlApi_databaseHandleBeginTransaction(taskId, ptr, args));
    }
    async databaseHandleQuery(ptr: number, args: [SqlDatabaseHandlePointer, string]): Promise<SqlQueryPointer> {
        return this.runAsync<SqlQueryPointer>((taskId)=>this.api.lib.SqlApi_databaseHandleQuery(taskId, ptr, args));
    }
    async databaseHandleClose(ptr: number, args: [SqlDatabaseHandlePointer]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_databaseHandleClose(taskId, ptr, args));
    }
    async freeDatabaseHandle(ptr: number, args: [SqlDatabaseHandlePointer]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_freeDatabaseHandle(taskId, ptr, args));
    }
    async transactionQuery(ptr: number, args: [SqlTransactionPointer, string]): Promise<SqlQueryPointer> {
        return this.runAsync<SqlQueryPointer>((taskId)=>this.api.lib.SqlApi_transactionQuery(taskId, ptr, args));
    }
    async transactionCommit(ptr: number, args: [SqlTransactionPointer]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_transactionCommit(taskId, ptr, args));
    }
    async transactionRollback(ptr: number, args: [SqlTransactionPointer]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_transactionRollback(taskId, ptr, args));
    }
    async freeTransaction(ptr: number, args: [SqlTransactionPointer]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_freeTransaction(taskId, ptr, args));
    }
    async queryBindInt64(ptr: number, args: [SqlQueryPointer, number, number]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_queryBindInt64(taskId, ptr, args));
    }
    async queryBindDouble(ptr: number, args: [SqlQueryPointer, number, number]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_queryBindDouble(taskId, ptr, args));
    }
    async queryBindText(ptr: number, args: [SqlQueryPointer, number, string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_queryBindText(taskId, ptr, args));
    }
    async queryBindBlob(ptr: number, args: [SqlQueryPointer, number, Uint8Array]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_queryBindBlob(taskId, ptr, args));
    }
    async queryBindNull(ptr: number, args: [SqlQueryPointer, number]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_queryBindNull(taskId, ptr, args));
    }
    async queryStep(ptr: number, args: [SqlQueryPointer]): Promise<SqlRowPointer> {
        return this.runAsync<SqlRowPointer>((taskId)=>this.api.lib.SqlApi_queryStep(taskId, ptr, args));
    }
    async queryReset(ptr: number, args: [SqlQueryPointer]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_queryReset(taskId, ptr, args));
    }
    async freeQuery(ptr: number, args: [SqlQueryPointer]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_freeQuery(taskId, ptr, args));
    }
    async rowGetStatus(ptr: number, args: [SqlRowPointer]): Promise<SqlEvaluationStatus> {
        return this.runAsync<SqlEvaluationStatus>((taskId)=>this.api.lib.SqlApi_rowGetStatus(taskId, ptr, args));
    }
    async rowGetColumnCount(ptr: number, args: [SqlRowPointer]): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.SqlApi_rowGetColumnCount(taskId, ptr, args));
    }
    async rowGetColumn(ptr: number, args: [SqlRowPointer, number]): Promise<SqlColumnPointer> {
        return this.runAsync<SqlColumnPointer>((taskId)=>this.api.lib.SqlApi_rowGetColumn(taskId, ptr, args));
    }
    async freeRow(ptr: number, args: [SqlRowPointer]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_freeRow(taskId, ptr, args));
    }
    async columnGetName(ptr: number, args: [SqlColumnPointer]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.SqlApi_columnGetName(taskId, ptr, args));
    }
    async columnGetType(ptr: number, args: [SqlColumnPointer]): Promise<SqlDataType> {
        return this.runAsync<SqlDataType>((taskId)=>this.api.lib.SqlApi_columnGetType(taskId, ptr, args));
    }
    async columnGetInt64(ptr: number, args: [SqlColumnPointer]): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.SqlApi_columnGetInt64(taskId, ptr, args));
    }
    async columnGetDouble(ptr: number, args: [SqlColumnPointer]): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.SqlApi_columnGetDouble(taskId, ptr, args));
    }
    async columnGetText(ptr: number, args: [SqlColumnPointer]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.SqlApi_columnGetText(taskId, ptr, args));
    }
    async columnGetBlob(ptr: number, args: [SqlColumnPointer]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId)=>this.api.lib.SqlApi_columnGetBlob(taskId, ptr, args));
    }
    async freeColumn(ptr: number, args: [SqlColumnPointer]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SqlApi_freeColumn(taskId, ptr, args));
    }
}
