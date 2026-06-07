'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { adminApi, projectsApi, AuditLogItem, AdminUser } from '@/lib/api';
import { formatAuditAction } from '@/lib/audit-log-format';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface Filters {
  fromDate: string;
  toDate: string;
  userId: string;
  actionType: string;
}

const EMPTY_FILTERS: Filters = { fromDate: '', toDate: '', userId: '', actionType: '' };

type SortDirection = 'desc' | 'asc';

const FIELD_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** Fetches and renders the audit log table client-side with filter controls and sortable columns. */
export function AuditLogClient() {
  const [pending, setPending] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const projectNamesCache = useRef<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Load filter option lists on mount
  useEffect(() => {
    Promise.all([
      adminApi.getAuditLogActionTypes(),
      adminApi.getAdminUsers(),
    ])
      .then(([atResult, usersResult]) => {
        setActionTypes(atResult.actionTypes);
        setUsers(usersResult.users);
      })
      .catch(() => {});
  }, []);

  // Load audit log whenever applied filters change
  useEffect(() => {
    setLoading(true);
    setError(false);
    adminApi
      .getAuditLogs({
        fromDate: applied.fromDate || undefined,
        toDate: applied.toDate || undefined,
        userId: applied.userId || undefined,
        actionType: applied.actionType || undefined,
      })
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);

        const ids = [...new Set(result.items.map((item) => item.projectId).filter((id): id is string => id !== null && id !== undefined))];
        const missing = ids.filter((id) => !(id in projectNamesCache.current));
        if (missing.length > 0) {
          Promise.allSettled(missing.map((id) => projectsApi.get(id))).then((results) => {
            const newNames: Record<string, string> = {};
            for (const [index, settled] of results.entries()) {
              if (settled.status === 'fulfilled') {
                newNames[missing[index]] = settled.value.data.name;
                projectNamesCache.current[missing[index]] = settled.value.data.name;
              }
            }
            if (Object.keys(newNames).length > 0) {
              setProjectNames((previous) => ({ ...previous, ...newNames }));
            }
          });
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [applied]);

  const applyFilters = useCallback(() => setApplied({ ...pending }), [pending]);

  const resetFilters = useCallback(() => {
    setPending(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
  }, []);

  const toggleSort = useCallback(() => setSortDirection((direction) => (direction === 'desc' ? 'asc' : 'desc')), []);

  const sorted = items.toSorted((a, b) => {
    const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return sortDirection === 'desc' ? -diff : diff;
  });

  function renderTable() {
    if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
    if (error) return <p role="alert" className="text-sm text-destructive">Failed to load audit log.</p>;
    if (items.length === 0) return <p className="text-muted-foreground">No audit log entries found.</p>;
    return (
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left">
                <button
                  type="button"
                  className="flex items-center gap-1 font-medium hover:text-foreground"
                  onClick={toggleSort}
                  aria-label={`Timestamp — sorted ${sortDirection === 'desc' ? 'newest first' : 'oldest first'}`}
                >
                  Timestamp
                  <span aria-hidden>{sortDirection === 'desc' ? '↓' : '↑'}</span>
                </button>
              </th>
              <th className="px-4 py-2 text-left font-medium">Actor</th>
              <th className="px-4 py-2 text-left font-medium">Action Type</th>
              <th className="px-4 py-2 text-left font-medium">Resource Type</th>
              <th className="px-4 py-2 text-left font-medium">Resource ID</th>
              <th className="px-4 py-2 text-left font-medium">Project</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="px-4 py-2 font-mono text-xs">
                  {new Date(entry.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <span title={entry.userId ?? undefined}>
                    {entry.actorDisplayName ?? entry.userId ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span title={entry.action}>{formatAuditAction(entry.action, entry.metadata)}</span>
                </td>
                <td className="px-4 py-2">{entry.resourceType}</td>
                <td className="px-4 py-2 font-mono text-xs">{entry.resourceId}</td>
                <td className="px-4 py-2">
                  {entry.projectId ? (
                    <span title={entry.projectId}>
                      {projectNames[entry.projectId] ?? entry.projectId}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter panel */}
      <div className="rounded-md border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 flex-1 min-w-[140px]">
            <Label htmlFor="auditFromDate">From</Label>
            <input
              id="auditFromDate"
              type="datetime-local"
              value={pending.fromDate}
              onChange={(event) => setPending((f) => ({ ...f, fromDate: event.target.value }))}
              className={FIELD_CLASS}
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[140px]">
            <Label htmlFor="auditToDate">To</Label>
            <input
              id="auditToDate"
              type="datetime-local"
              value={pending.toDate}
              onChange={(event) => setPending((f) => ({ ...f, toDate: event.target.value }))}
              className={FIELD_CLASS}
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[120px]">
            <Label htmlFor="auditUser">User</Label>
            <select
              id="auditUser"
              aria-label="User"
              value={pending.userId}
              onChange={(event) => setPending((f) => ({ ...f, userId: event.target.value }))}
              className={FIELD_CLASS}
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.displayName}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1 flex-1 min-w-[140px]">
            <Label htmlFor="auditActionType">Action Type</Label>
            <select
              id="auditActionType"
              aria-label="Action Type"
              value={pending.actionType}
              onChange={(event) => setPending((f) => ({ ...f, actionType: event.target.value }))}
              className={FIELD_CLASS}
            >
              <option value="">All action types</option>
              {actionTypes.map((at) => (
                <option key={at} value={at}>{formatAuditAction(at)}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 items-end pb-[1px]">
            <Button onClick={applyFilters}>Apply</Button>
            <Button variant="outline" onClick={resetFilters}>Reset</Button>
          </div>
        </div>
      </div>

      {renderTable()}

      {!loading && !error && (
        <p className="text-xs text-muted-foreground">
          Showing {items.length} of {total} entries
        </p>
      )}
    </div>
  );
}
