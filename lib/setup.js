import {DatabaseSetupError} from './database.js';
import {SCHEMA_STATEMENTS} from './schema.js';

// Only in-flight work is shared. Never cache that a database is initialized forever:
// a subsequent request/Neon branch may be different. The SQL lock also serializes
// different Workers/isolate instances with each other and with assignment writes.
const pending=new WeakMap();
export async function initializeDatabase(sql){
  let task=pending.get(sql);
  if(!task){
    task=(async()=>{
      try{
        await sql.transaction([
          sql.query("SET LOCAL lock_timeout = '5s'",[]),
          sql.query("SET LOCAL statement_timeout = '12s'",[]),
          sql.query('SELECT pg_advisory_xact_lock(20261121)',[]),
          ...SCHEMA_STATEMENTS.map(statement=>sql.query(statement,[]))
        ],{isolationLevel:'ReadCommitted'});
      }catch(error){
        if(error?.code==='42501')throw new DatabaseSetupError('DB_SETUP_PERMISSION_DENIED','Neon is connected, but this role cannot create the missing application tables. Use a Neon database-owner connection for initial setup, or run the complete schema.sql once in the same Neon branch/database as its owner. Existing assignments have not been cleared.');
        if(['55P03','57014'].includes(error?.code))throw new DatabaseSetupError('DB_SETUP_BUSY','Database setup is waiting for another request or timed out. Retry shortly; setup is transactional and safe to repeat.');
        throw error;
      }
    })();
    pending.set(sql,task);
  }
  try{await task;}finally{if(pending.get(sql)===task)pending.delete(sql);}
}

export async function withSchemaRecovery(sql,operation){
  try{return await operation();}
  catch(error){
    // Do NOT run DDL on bad credentials, network outages, denied DML, malformed
    // columns, failed validation, or unknown exceptions. Never loop indefinitely.
    if(error?.code!=='42P01'&&!(error instanceof DatabaseSetupError&&error.code==='DB_SCHEMA_UNINITIALIZED'))throw error;
    await initializeDatabase(sql);
    return operation(); // retry just the failed query/transaction, exactly once
  }
}
