import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Search,
  Filter,
  RefreshCw,
  User,
  Briefcase,
  Users,
  ShieldAlert,
  KeyRound,
  LogIn,
  LogOut,
  Clock,
  Calendar
} from 'lucide-react';
import { getAdminActivities, toApiError } from '../services/api';
import { Avatar, Button, Card, InlineAlert, Spinner, cx } from '../components/ui';

const ACTION_CATEGORIES = {
  LOGIN: { label: 'Sign In', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  LOGOUT: { label: 'Sign Out', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  ACCOUNT_CREATED: { label: 'Account Created', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  PROFILE_UPDATED: { label: 'Profile Updated', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  PASSWORD_CHANGED: { label: 'Password Changed', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  USER_STATUS_CHANGED: { label: 'Status Changed', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  JOB_CREATED: { label: 'Job Created', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  JOB_CLOSED: { label: 'Job Closed', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  JOB_PERMANENTLY_DELETED: { label: 'Job Deleted Permanently', color: 'bg-red-50 text-red-700 border-red-200' },
  CANDIDATE_IMPORTED: { label: 'Resumes Imported', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  CANDIDATE_SHORTLISTED: { label: 'Shortlisted', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CANDIDATE_NOT_SUITABLE: { label: 'Not Suitable', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  CANDIDATE_STATUS_CHANGED: { label: 'Candidate Status', color: 'bg-sky-50 text-sky-700 border-sky-200' }
};

const AdminActivities = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [error, setError] = useState('');

  const loadActivities = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAdminActivities({
        action: actionFilter || undefined,
        page,
        limit: 25
      });
      setActivities(res.data || []);
      setPagination(res.pagination || { total: 0, page: 1, limit: 25, totalPages: 1 });
    } catch (err) {
      const apiErr = toApiError(err);
      setError(apiErr.message);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, page]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Platform Activity Audit</h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-700 uppercase tracking-wider">
              Admin Area
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time audit log of user authentications, account actions, and recruitment activities.
          </p>
        </div>

        <Button variant="secondary" size="md" icon={RefreshCw} onClick={loadActivities} loading={loading}>
          Refresh
        </Button>
      </div>

      {error && <InlineAlert tone="error" message={error} />}

      {/* Filter Bar */}
      <Card padding="p-4" className="bg-white border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-700">Filter Event:</span>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-700 focus:ring-1 focus:ring-brand-500"
            >
              <option value="">All Action Events</option>
              <option value="LOGIN">User Sign In (LOGIN)</option>
              <option value="LOGOUT">User Sign Out (LOGOUT)</option>
              <option value="ACCOUNT_CREATED">Account Created (ACCOUNT_CREATED)</option>
              <option value="PROFILE_UPDATED">Profile Updated (PROFILE_UPDATED)</option>
              <option value="PASSWORD_CHANGED">Password Changed (PASSWORD_CHANGED)</option>
              <option value="USER_STATUS_CHANGED">User Status Changed (USER_STATUS_CHANGED)</option>
              <option value="JOB_CREATED">Job Created (JOB_CREATED)</option>
              <option value="JOB_CLOSED">Job Closed (JOB_CLOSED)</option>
              <option value="JOB_PERMANENTLY_DELETED">Job Deleted Permanently (JOB_PERMANENTLY_DELETED)</option>
              <option value="CANDIDATE_IMPORTED">Resumes Imported (CANDIDATE_IMPORTED)</option>
              <option value="CANDIDATE_SHORTLISTED">Candidate Shortlisted (CANDIDATE_SHORTLISTED)</option>
              <option value="CANDIDATE_NOT_SUITABLE">Candidate Not Suitable (CANDIDATE_NOT_SUITABLE)</option>
            </select>
          </div>

          <span className="text-xs text-slate-500">
            Total Logged Events: <span className="font-semibold text-slate-900">{pagination.total.toLocaleString()}</span>
          </span>
        </div>
      </Card>

      {/* Activity Table */}
      <Card padding="p-0" className="bg-white border border-slate-200 overflow-hidden shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Action</th>
                <th className="px-4 py-3.5">User / Actor</th>
                <th className="px-6 py-3.5">Description</th>
                <th className="px-4 py-3.5">Target Entity</th>
                <th className="px-6 py-3.5 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && activities.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-12">
                    <Spinner label="Loading platform activities…" />
                  </td>
                </tr>
              ) : activities.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-slate-500">
                    No platform activities found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                activities.map((act) => {
                  const meta = ACTION_CATEGORIES[act.action] || {
                    label: act.action,
                    color: 'bg-slate-100 text-slate-700 border-slate-200'
                  };
                  return (
                    <tr key={act.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <span
                          className={cx(
                            'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
                            meta.color
                          )}
                        >
                          {meta.label}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Avatar name={act.userName || act.user?.name} size="xs" />
                          <div>
                            <span className="font-semibold text-slate-900 block text-xs">
                              {act.userName || act.user?.name || 'System'}
                            </span>
                            <span className="text-[11px] text-slate-500 block">
                              {act.userEmail || act.user?.email || 'system'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-3.5 text-xs text-slate-800 max-w-md">
                        {act.description}
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-500">
                        {act.entityName ? (
                          <span className="font-medium text-slate-700 truncate max-w-xs block">
                            {act.entityName}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-6 py-3.5 whitespace-nowrap text-right text-xs text-slate-500 tabular-nums">
                        {formatDateTime(act.createdAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
            <span>
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} events
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AdminActivities;
