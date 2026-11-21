// Public diagnostics are deliberately allowlisted: never return/log driver messages,
// connection strings, SQL text, credentials, database names, hosts or user data.
export class DatabaseSetupError extends Error {
  constructor(code,message,details={}){super(message);this.code=code;this.details=details;}
}
export function databaseConnectionString(raw){
  if(typeof raw!=='string'||!raw.trim())throw new DatabaseSetupError('DB_NOT_CONFIGURED','DATABASE_URL is missing in this deployment environment. Set it in Cloudflare Pages, then redeploy.');
  const value=raw.trim();
  let parsed;
  try{parsed=new URL(value);}catch{}
  if(!parsed||!['postgres:','postgresql:'].includes(parsed.protocol)||!parsed.hostname||!parsed.username||!parsed.password||parsed.pathname.length<2||/[\r\n]/.test(value)||/["'\s]$/.test(value)){
    throw new DatabaseSetupError('DB_URL_INVALID','DATABASE_URL must contain only the complete postgres:// or postgresql:// connection URL, including user, password, host and database. Do not paste psql, an assignment, surrounding quotes, or a Neon API key.');
  }
  return value;
}
export const REQUIRED_SCHEMA={
  event_days:['day','title','updated_at'],
  booth_assignments:['day','booth_id','org','rep','description','notes','color','status','updated_at'],
  room_reservations:['day','room_id','reserved_for','note','paper','updated_at'],
  login_attempts:['ip','fails','first_fail'],
  event_meta:['id','revision','updated_at'],
  organizer_sessions:['token_hash','expires_at']
};
export async function checkDatabase(sql){
  // This read-only check also verifies connection/credentials, without relying on
  // any application tables already existing or disclosing their contents.
  const columns=await sql.query('SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=ANY($2::text[])',['public',Object.keys(REQUIRED_SCHEMA)]);
  const found=new Map();for(const {table_name,column_name} of columns){if(!found.has(table_name))found.set(table_name,new Set());found.get(table_name).add(column_name);}
  const missingTables=[],missingColumns={};
  for(const [table,required] of Object.entries(REQUIRED_SCHEMA)){
    if(!found.has(table)){missingTables.push(table);continue;}
    const missing=required.filter(c=>!found.get(table).has(c));if(missing.length)missingColumns[table]=missing;
  }
  if(missingTables.length||Object.keys(missingColumns).length)throw new DatabaseSetupError('DB_SCHEMA_INCOMPLETE','The database connection works, but required tables/columns are missing or inaccessible. Run the complete latest schema.sql in the SAME Neon branch and database used by DATABASE_URL, and check role permissions.',{missingTables,missingColumns});
  // Check DML rights, not DDL: normal app requests never create or alter tables.
  const rights=await sql.query(`SELECT bool_and(has_table_privilege(current_user,format('public.%I',name),'SELECT') AND has_table_privilege(current_user,format('public.%I',name),'INSERT') AND has_table_privilege(current_user,format('public.%I',name),'UPDATE') AND has_table_privilege(current_user,format('public.%I',name),'DELETE')) AS allowed FROM unnest($1::text[]) AS names(name)`,[Object.keys(REQUIRED_SCHEMA)]);
  if(!rights[0]?.allowed)throw new DatabaseSetupError('DB_PERMISSION_DENIED','The connection role needs SELECT, INSERT, UPDATE and DELETE access to the application tables in the public schema. Use the correct Neon role or ask the database owner to grant access.');
  const meta=await sql.query('SELECT revision FROM public.event_meta WHERE id=true',[]);
  if(!meta.length)throw new DatabaseSetupError('DB_SCHEMA_UNINITIALIZED','The tables exist, but the event_meta initialization row is missing. Run the complete latest schema.sql, including the INSERT statement.');
  return {ok:true,database:'connected',schema:'ready'};
}
export function databaseFailure(error){
  if(error instanceof DatabaseSetupError)return {status:503,code:error.code,error:error.message,...error.details};
  const sqlstate=typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code)?error.code:undefined;
  const known={
    '42P01':['DB_SCHEMA_MISSING','The connection works, but an application table is missing. Run ALL of the latest schema.sql in the Neon branch/database selected by DATABASE_URL; /api/health lists missing tables.'],
    '42703':['DB_SCHEMA_OUTDATED','The connection works, but a required column is missing. Open /api/health to identify the table/column and compare it with the latest schema.sql.'],
    '42501':['DB_PERMISSION_DENIED','The database role does not have the required permissions. Use the correct Neon connection role or grant it access to the public application tables.'],
    '28P01':['DB_AUTH_FAILED','Neon rejected the database username/password. Copy a fresh connection URL from Neon Connect into the correct Cloudflare deployment environment, then redeploy.'],
    '28000':['DB_AUTH_FAILED','Neon rejected this database login. Check the connection role and password in DATABASE_URL.'],
    '3D000':['DB_DATABASE_NOT_FOUND','The database named in DATABASE_URL does not exist on this Neon endpoint. Copy the connection URL for the intended Neon branch and database.'],
    '3F000':['DB_SCHEMA_MISSING','The required database schema is missing. Run schema.sql in the intended Neon database.'],
    '53300':['DB_CAPACITY','The database connection limit was reached. Use the Neon pooled connection URL and retry.'],
    '57P03':['DB_STARTING','The database is not accepting connections yet. Wait briefly for the Neon endpoint to start, then retry.'],
    '40001':['DB_BUSY','A database transaction conflicted. Reload the latest plan and retry.'],
    '40P01':['DB_BUSY','A database transaction conflicted. Reload the latest plan and retry.']
  };
  if(known[sqlstate]){const [code,message]=known[sqlstate];return {status:503,code,error:message};}
  // Used only for classification. The original strings are NEVER serialized/logged.
  const message=typeof error?.message==='string'?error.message:'';
  const transport=/error connecting|fetch failed|failed to fetch|network|timeout|timed out|ECONN|ENOTFOUND|HTTP status (?:5\d\d|404|429)/i.test(message)||sqlstate?.startsWith('08')||['AbortError','TimeoutError'].includes(error?.name);
  if(transport)return {status:503,code:'DB_CONNECTION_FAILED',error:'Cloudflare could not reach the Neon SQL endpoint. Check that the endpoint is active, the connection URL is current, and Neon IP/network restrictions allow Cloudflare Pages. Retry after the endpoint wakes up.'};
  if(error?.name==='NeonDbError')return {status:503,code:'DB_REQUEST_FAILED',error:'Neon rejected the database request. Use the error reference and SQLSTATE in Cloudflare Function logs to diagnose it; no credentials are shown here.'};
  return {status:500,code:'API_INTERNAL_ERROR',error:'An unexpected application error occurred. Check Cloudflare Function logs using this error reference; do not change the database blindly.'};
}
export function safeDatabaseLog(error,diagnostic,requestId){
  const record={event:'database_request_failed',code:diagnostic.code,requestId};
  if(typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code))record.sqlstate=error.code;
  return record;
}
