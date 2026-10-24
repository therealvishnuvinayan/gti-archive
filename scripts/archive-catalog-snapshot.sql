BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object('section','identity','data',jsonb_build_object(
 'database',current_database(),'schema',current_schema(),'version',current_setting('server_version'),
 'major',current_setting('server_version_num')::int/10000,
 'readOnly',current_setting('transaction_read_only'),'defaultReadOnly',current_setting('default_transaction_read_only'),
 'capturedAt',clock_timestamp(),'role',current_user,'lsn',pg_current_wal_lsn()::text));
SELECT jsonb_build_object('section','ledger','data',coalesce(jsonb_agg(to_jsonb(m) ORDER BY migration_name),'[]')) FROM public."_prisma_migrations" m;
SELECT jsonb_build_object('section','accounts','data',coalesce(jsonb_agg(to_jsonb(a) ORDER BY email),'[]'))
 FROM (SELECT u.id,u.email,u.name,u.role AS "legacyRole",a."businessRole",a."technicalPrivileges",a."accountStatus",a."authorizationVersion"
 FROM public."User" u LEFT JOIN public."UserAuthorization" a ON a."userId"=u.id) a;
SELECT jsonb_build_object('section','presetApprovals','data',coalesce(jsonb_agg(to_jsonb(p) ORDER BY "approvedAt"),'[]'))
 FROM (SELECT p.id,p."presetKey",p."definitionHash",p."approvedById",u.email,u.name,p."approvedAt",p."revokedAt",
 (SELECT count(*) FROM public."ProjectGovernanceEvent" e WHERE e."presetApprovalId"=p.id) AS "auditEvents"
 FROM public."LegacyProjectPresetApproval" p JOIN public."User" u ON u.id=p."approvedById") p;
SELECT format('SELECT jsonb_build_object(''section'',''table'',''table'',%L,''data'',jsonb_build_object(''count'',count(*),''fingerprint'',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''[]'')),''fingerprintSha256'',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''[]''),''UTF8'')),''hex''))) FROM public.%I t;',tablename,tablename)
 FROM pg_tables WHERE schemaname='public' ORDER BY tablename
\gexec
SELECT jsonb_build_object('section','columns','data',coalesce(jsonb_agg(to_jsonb(c) ORDER BY table_name,ordinal_position),'[]'))
 FROM (SELECT table_name,column_name,ordinal_position,column_default,is_nullable,data_type,udt_name,character_maximum_length,numeric_precision,numeric_scale,datetime_precision
 FROM information_schema.columns WHERE table_schema='public') c;
SELECT jsonb_build_object('section','constraints','data',coalesce(jsonb_agg(to_jsonb(c) ORDER BY "table",name),'[]'))
 FROM (SELECT cl.relname AS "table",c.conname AS name,c.contype AS type,c.convalidated AS validated,c.condeferrable AS deferrable,c.condeferred AS deferred,pg_get_constraintdef(c.oid,true) AS definition
 FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public') c;
SELECT jsonb_build_object('section','indexes','data',coalesce(jsonb_agg(to_jsonb(i) ORDER BY "table",name),'[]'))
 FROM (SELECT t.relname AS "table",c.relname AS name,i.indisvalid AS valid,i.indisready AS ready,pg_get_indexdef(i.indexrelid) AS definition
 FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public') i;
SELECT jsonb_build_object('section','enums','data',coalesce(jsonb_agg(to_jsonb(e) ORDER BY name,sort),'[]'))
 FROM (SELECT t.typname AS name,e.enumlabel AS value,e.enumsortorder AS sort FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') e;
SELECT jsonb_build_object('section','functions','data',coalesce(jsonb_agg(to_jsonb(f) ORDER BY name,arguments),'[]'))
 FROM (SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosrc AS source,pg_get_functiondef(p.oid) AS definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')) f;
SELECT jsonb_build_object('section','triggers','data',coalesce(jsonb_agg(to_jsonb(t) ORDER BY "table",name),'[]'))
 FROM (SELECT c.relname AS "table",t.tgname AS name,t.tgenabled AS enabled,t.tgdeferrable AS deferrable,t.tginitdeferred AS deferred,pg_get_triggerdef(t.oid,true) AS definition
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) t;
SELECT jsonb_build_object('section','operations','data',jsonb_build_object(
 'otherSessions',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()),
 'otherActiveTransactions',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND xact_start IS NOT NULL),
 'waitingLocks',(SELECT count(*) FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND NOT granted),
 'preparedTransactions',(SELECT count(*) FROM pg_prepared_xacts WHERE database=current_database()),
 'publicTotalBytes',(SELECT sum(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(tablename))) FROM pg_tables WHERE schemaname='public')));
SELECT jsonb_build_object('section','lockDetails','data',coalesce(jsonb_agg(to_jsonb(l) ORDER BY pid,relation,mode),'[]'))
 FROM (SELECT lock.pid,c.relname AS relation,lock.locktype,lock.mode,lock.granted,act.state,act.wait_event_type,act.wait_event,
 act.xact_start,act.application_name,pg_blocking_pids(lock.pid) AS blocking_pids
 FROM pg_locks lock LEFT JOIN pg_class c ON c.oid=lock.relation LEFT JOIN pg_stat_activity act ON act.pid=lock.pid
 WHERE lock.database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND lock.pid<>pg_backend_pid()) l;
SELECT jsonb_build_object('section','sessionSettings','data',jsonb_build_object(
 'readOnly',current_setting('transaction_read_only'),'defaultReadOnly',current_setting('default_transaction_read_only'),
 'lockTimeout',current_setting('lock_timeout'),'statementTimeout',current_setting('statement_timeout')));
SELECT jsonb_build_object('section','sessions','data',coalesce(jsonb_agg(to_jsonb(a) ORDER BY pid),'[]')) FROM (SELECT pid,backend_type,application_name,state,xact_start,backend_xid,backend_xmin,pg_blocking_pids(pid) AS blocking_pids FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) a;
COMMIT;
