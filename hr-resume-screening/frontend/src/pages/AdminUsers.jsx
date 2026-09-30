import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Search,
  Shield,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Activity,
  Briefcase,
  Calendar,
  Clock,
  ExternalLink,
  RefreshCw,
  UserCheck,
  UserX,
  X,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAdminUsers, getAdminUser, updateAdminUserStatus, toApiError } from '../services/api';
import { Avatar, Button, Card, InlineAlert, Modal, Spinner, cx } from '../components/ui';

const AdminUsers = () => {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [counts, setCounts] = useState({ total: 0, active: 0, disabled: 0, admins: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [error, setError] = useState('');

  // Selected user for details drawer/modal
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Status toggle confirmation modal
  const [statusConfirmUser, setStatusConfirmUser] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAdminUsers({
        search: search.trim() || undefined,
        status: statusFilter,
        page,
        limit: 20
      });
      setUsers(res.data || []);
      setCounts(res.counts || { total: 0, active: 0, disabled: 0, admins: 0 });
      setPagination(res.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 });
    } catch (err) {
      const apiErr = toApiError(err);
      setError(apiErr.message);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openUserDetails = async (id) => {
    setSelectedUserId(id);
    setDetailLoading(true);
    try {
      const res = await getAdminUser(id);
      setSelectedUserDetail(res.data);
    } catch (err) {
      const apiErr = toApiError(err);
      setError(apiErr.message);
      setSelectedUserId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!statusConfirmUser) return;
    setStatusUpdating(true);
    setActionSuccess('');
    setError('');
    try {
      const targetIsActive = !statusConfirmUser.isActive;
      await updateAdminUserStatus(statusConfirmUser.id, targetIsActive);
      setActionSuccess(
        `User ${statusConfirmUser.name} has been ${targetIsActive ? 'reactivated' : 'disabled'}.`
      );
      setStatusConfirmUser(null);
      await loadUsers();
      if (selectedUserId === statusConfirmUser.id) {
        await openUserDetails(statusConfirmUser.id);
      }
    } catch (err) {
      const apiErr = toApiError(err);
      setError(apiErr.message);
    } finally {
      setStatusUpdating(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Never';
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Never';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Never';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">User Management</h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-700 uppercase tracking-wider">
              Admin Area
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Monitor registered platform users, account statuses, and system privileges.
          </p>
        </div>

        <Button variant="secondary" size="md" icon={RefreshCw} onClick={loadUsers} loading={loading}>
          Refresh
        </Button>
      </div>

      {actionSuccess && <InlineAlert tone="success" message={actionSuccess} className="animate-fade-in" />}
      {error && <InlineAlert tone="error" message={error} className="animate-fade-in" />}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padding="p-4" className="bg-white border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Accounts</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{counts.total.toLocaleString()}</p>
          <span className="text-[11px] text-slate-500">Registered platform users</span>
        </Card>

        <Card padding="p-4" className="bg-white border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Users</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{counts.active.toLocaleString()}</p>
          <span className="text-[11px] text-slate-500">Authorized recruiters & admins</span>
        </Card>

        <Card padding="p-4" className="bg-white border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Disabled</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-bold text-rose-600 mt-2">{counts.disabled.toLocaleString()}</p>
          <span className="text-[11px] text-slate-500">Suspended / Deactivated</span>
        </Card>

        <Card padding="p-4" className="bg-white border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Administrators</span>
            <Shield className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-purple-600 mt-2">{counts.admins.toLocaleString()}</p>
          <span className="text-[11px] text-slate-500">Platform administrators</span>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card padding="p-4" className="bg-white border border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search users by name or email..."
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md self-start sm:self-auto text-xs">
            {['ALL', 'ACTIVE', 'DISABLED'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={cx(
                  'px-3 py-1 font-medium rounded transition-colors',
                  statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                {st === 'ALL' ? 'All Users' : st === 'ACTIVE' ? 'Active' : 'Disabled'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Users Table */}
      <Card padding="p-0" className="bg-white border border-slate-200 overflow-hidden shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">User</th>
                <th className="px-4 py-3.5">Role</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Work Done</th>
                <th className="px-4 py-3.5">Joined</th>
                <th className="px-4 py-3.5">Last Login</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-12">
                    <Spinner label="Loading users…" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-slate-500">
                    No users found matching your search criteria.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isCurrent = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} size="sm" />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900">{u.name}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-500">{u.email}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={cx(
                            'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase',
                            u.role === 'ADMIN'
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : 'bg-slate-100 text-slate-700'
                          )}
                        >
                          <Shield className="w-3 h-3" />
                          {u.role}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Disabled
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600">
                        <span className="font-semibold text-slate-900">{u.stats?.jobsCreated || 0}</span> jobs created
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-500">
                        {formatDate(u.createdAt)}
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-500">
                        {formatDateTime(u.lastLoginAt)}
                      </td>

                      <td className="px-6 py-3.5 whitespace-nowrap text-right text-xs">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openUserDetails(u.id)}
                            className="font-medium text-brand-600 hover:text-brand-800 hover:underline px-2 py-1"
                          >
                            Details
                          </button>

                          <button
                            type="button"
                            disabled={isCurrent}
                            onClick={() => setStatusConfirmUser(u)}
                            title={isCurrent ? 'You cannot disable your own admin account' : undefined}
                            className={cx(
                              'font-medium px-2 py-1 rounded transition-colors',
                              isCurrent
                                ? 'text-slate-300 cursor-not-allowed'
                                : u.isActive
                                ? 'text-rose-600 hover:bg-rose-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            )}
                          >
                            {u.isActive ? 'Disable' : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
            <span>
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
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

      {/* User Detail Modal */}
      {selectedUserId && (
        <Modal
          isOpen={Boolean(selectedUserId)}
          onClose={() => {
            setSelectedUserId(null);
            setSelectedUserDetail(null);
          }}
          title={selectedUserDetail ? `${selectedUserDetail.user.name}'s Account` : 'User Details'}
          maxWidth="max-w-2xl"
        >
          {detailLoading || !selectedUserDetail ? (
            <div className="py-12 text-center">
              <Spinner label="Loading user details…" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Profile Overview */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <Avatar name={selectedUserDetail.user.name} size="md" />
                  <div>
                    <h3 className="font-bold text-slate-900">{selectedUserDetail.user.name}</h3>
                    <p className="text-xs text-slate-500">{selectedUserDetail.user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      'px-2 py-0.5 rounded text-xs font-semibold uppercase',
                      selectedUserDetail.user.role === 'ADMIN'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-brand-50 text-brand-700'
                    )}
                  >
                    {selectedUserDetail.user.role}
                  </span>
                  <span
                    className={cx(
                      'px-2 py-0.5 rounded text-xs font-semibold',
                      selectedUserDetail.isActive
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'
                    )}
                  >
                    {selectedUserDetail.isActive ? 'Active' : 'Disabled'}
                  </span>
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg text-center">
                  <span className="text-xs text-slate-500 block">Jobs Created</span>
                  <span className="text-lg font-bold text-slate-900">
                    {selectedUserDetail.stats?.jobsCreated || 0}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg text-center">
                  <span className="text-xs text-slate-500 block">Jobs Closed</span>
                  <span className="text-lg font-bold text-slate-900">
                    {selectedUserDetail.stats?.jobsClosed || 0}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg text-center">
                  <span className="text-xs text-slate-500 block">Recorded Actions</span>
                  <span className="text-lg font-bold text-slate-900">
                    {selectedUserDetail.stats?.activitiesCount || 0}
                  </span>
                </div>
              </div>

              {/* Recent Activity Timeline */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-brand-600" />
                  Recent User Activity
                </h4>

                {selectedUserDetail.recentActivities?.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">
                    No platform activities recorded yet for this user.
                  </p>
                ) : (
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-md">
                    {selectedUserDetail.recentActivities.map((act) => (
                      <div key={act.id} className="p-2.5 text-xs hover:bg-slate-50">
                        <div className="flex items-center justify-between text-slate-500 mb-1">
                          <span className="font-semibold text-slate-800">{act.action}</span>
                          <span>{formatDateTime(act.createdAt)}</span>
                        </div>
                        <p className="text-slate-600">{act.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Disable / Reactivate Confirmation Modal */}
      {statusConfirmUser && (
        <Modal
          isOpen={Boolean(statusConfirmUser)}
          onClose={() => setStatusConfirmUser(null)}
          title={statusConfirmUser.isActive ? 'Disable User Account?' : 'Reactivate User Account?'}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={cx(
                  'p-2 rounded-full shrink-0',
                  statusConfirmUser.isActive ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                )}
              >
                {statusConfirmUser.isActive ? <UserX className="w-6 h-6" /> : <UserCheck className="w-6 h-6" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{statusConfirmUser.name}</p>
                <p className="text-xs text-slate-500">{statusConfirmUser.email}</p>
                <p className="text-xs text-slate-600 mt-2">
                  {statusConfirmUser.isActive
                    ? 'Disabling this account will immediately revoke all active sessions for this user. They will be logged out and blocked from signing in or using the API.'
                    : 'Reactivating this account will allow the user to log in again using their existing credentials.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="secondary" size="md" onClick={() => setStatusConfirmUser(null)} disabled={statusUpdating}>
                Cancel
              </Button>
              <Button
                variant={statusConfirmUser.isActive ? 'danger' : 'primary'}
                size="md"
                loading={statusUpdating}
                onClick={handleToggleStatus}
              >
                {statusConfirmUser.isActive ? 'Yes, Disable Account' : 'Yes, Reactivate Account'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminUsers;
