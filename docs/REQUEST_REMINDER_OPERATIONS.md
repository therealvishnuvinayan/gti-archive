# Request reminder operations

Stage 5 checklist requests and Stage 7 physical-sample rounds share the
database-backed request reminder processor.

## Required deployment configuration

Set these production environment variables:

```text
CRON_SECRET=<a long random secret>
APP_URL=https://<canonical-application-host>
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL=<verified-sender>
```

The existing S3 variables are also required because Stage 7 reminder emails
generate fresh, seven-day presigned reference-file links.

Apply database migrations before enabling the schedule:

```bash
pnpm prisma migrate deploy
```

Configure the deployment scheduler to invoke this endpoint every 15–60 minutes:

```text
GET /api/internal/request-reminders
Authorization: Bearer <CRON_SECRET>
```

POST is supported for schedulers that require it. `x-cron-secret` is accepted
for compatibility with the existing Stage 7 overdue job, but Bearer
authorization is preferred.

Example Vercel cron entry (the platform supplies `CRON_SECRET` as the Bearer
token):

```json
{
  "path": "/api/internal/request-reminders",
  "schedule": "*/15 * * * *"
}
```

The endpoint processes at most 50 reminders per invocation by default. It
claims each due row atomically, records a unique attempt per scheduled time,
revalidates the request immediately before delivery, and schedules the next
run from processing time. Missed intervals therefore produce at most one
message rather than catch-up spam.

Email requests use Resend `Idempotency-Key` headers. An abandoned processing
lease is not replayed; it is marked failed and advanced one interval so an
ambiguous network outcome cannot produce a duplicate email.
