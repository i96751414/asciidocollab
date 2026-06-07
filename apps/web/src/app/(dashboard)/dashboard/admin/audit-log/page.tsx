import { requireAdminOrRedirect } from '@/lib/admin-guard';
import { AuditLogClient } from './audit-log-client';

/** Server component that guards the audit-log route; filters and data are managed client-side. */
export default async function AuditLogPage() {
  await requireAdminOrRedirect('/dashboard/admin/audit-log');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground">Review system-wide audit events.</p>
      </div>
      <AuditLogClient />
    </div>
  );
}
