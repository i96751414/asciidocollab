import { requireAdminOrRedirect } from '@/lib/admin-guard';
import { AuditLogClient } from './audit-log-client';

interface AuditLogPageProperties {
  searchParams: Promise<{
    fromDate?: string;
    toDate?: string;
    userId?: string;
    actionType?: string;
    page?: string;
    limit?: string;
  }>;
}

/** Server component that guards the audit-log route; data is fetched client-side. */
export default async function AuditLogPage({ searchParams }: AuditLogPageProperties) {
  await requireAdminOrRedirect('/dashboard/admin/audit-log');

  const parameters = await searchParams;
  const page = Number(parameters.page ?? 1);
  const limit = Number(parameters.limit ?? 50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground">Review system-wide audit events.</p>
      </div>
      <AuditLogClient
        fromDate={parameters.fromDate}
        toDate={parameters.toDate}
        userId={parameters.userId}
        actionType={parameters.actionType}
        page={page}
        limit={limit}
      />
    </div>
  );
}
