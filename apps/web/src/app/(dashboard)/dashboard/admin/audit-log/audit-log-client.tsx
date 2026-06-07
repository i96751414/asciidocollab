'use client';

import { useState, useEffect } from 'react';
import { adminApi, AuditLogItem } from '@/lib/api';

interface AuditLogClientProperties {
  fromDate?: string;
  toDate?: string;
  userId?: string;
  actionType?: string;
  page?: number;
  limit?: number;
}

/** Fetches and renders the audit log table client-side. */
export function AuditLogClient({
  fromDate,
  toDate,
  userId,
  actionType,
  page = 1,
  limit = 50,
}: AuditLogClientProperties) {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [actionTypeCount, setActionTypeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      adminApi.getAuditLogs({ fromDate, toDate, userId, actionType, page, limit }),
      adminApi.getAuditLogActionTypes(),
    ])
      .then(([pageResult, actionTypesResult]) => {
        setItems(pageResult.items);
        setTotal(pageResult.total);
        setActionTypeCount(actionTypesResult.actionTypes.length);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [fromDate, toDate, userId, actionType, page, limit]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (error) {
    return <p role="alert" className="text-sm text-destructive">Failed to load audit log.</p>;
  }
  if (items.length === 0) {
    return <p className="text-muted-foreground">No audit log entries found.</p>;
  }

  return (
    <div className="space-y-4">
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
            {items.map((entry) => (
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
      <p className="text-xs text-muted-foreground">
        Showing {items.length} of {total} entries
        {actionTypeCount > 0 && <span> · {actionTypeCount} action type(s)</span>}
      </p>
    </div>
  );
}
