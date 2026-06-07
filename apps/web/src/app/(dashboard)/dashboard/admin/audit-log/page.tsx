import { requireAdminOrRedirect } from '@/lib/admin-guard';
import { adminApi } from '@/lib/api';

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

/** Server component rendering the admin audit-log listing with filter query params. */
export default async function AuditLogPage({ searchParams }: AuditLogPageProperties) {
  await requireAdminOrRedirect('/dashboard/admin/audit-log');

  const parameters = await searchParams;
  const page = Number(parameters.page ?? 1);
  const limit = Number(parameters.limit ?? 50);

  const [pageResult, actionTypesResult] = await Promise.all([
    adminApi.getAuditLogs({
      fromDate: parameters.fromDate,
      toDate: parameters.toDate,
      userId: parameters.userId,
      actionType: parameters.actionType,
      page,
      limit,
    }),
    adminApi.getAuditLogActionTypes(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground">Review system-wide audit events.</p>
      </div>

      {pageResult.items.length === 0 ? (
        <p className="text-muted-foreground">No audit log entries found.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left">Timestamp</th>
                <th className="px-4 py-2 text-left">Actor</th>
                <th className="px-4 py-2 text-left">Action Type</th>
                <th className="px-4 py-2 text-left">Resource Type</th>
                <th className="px-4 py-2 text-left">Resource ID</th>
              </tr>
            </thead>
            <tbody>
              {pageResult.items.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">{entry.actorDisplayName ?? entry.userId ?? '—'}</td>
                  <td className="px-4 py-2">{entry.action}</td>
                  <td className="px-4 py-2">{entry.resourceType}</td>
                  <td className="px-4 py-2 font-mono text-xs">{entry.resourceId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Showing {pageResult.items.length} of {pageResult.total} entries
        {actionTypesResult.actionTypes.length > 0 && (
          <span> · {actionTypesResult.actionTypes.length} action type(s)</span>
        )}
      </div>
    </div>
  );
}
