const prisma = require('../config/prisma');
const { toPublicUser, revokeAllUserSessions } = require('../services/authService');
const {
  recordPlatformActivity,
  getPlatformActivities
} = require('../services/platformActivityService');

/**
 * Admin User Management & Platform Activity Controller
 *
 * All handlers require authenticated administrator privileges (requireAuth + requireRole('ADMIN')).
 */

/**
 * @desc    List users with search, status filtering, and activity indicators
 * @route   GET /api/admin/users
 * @access  Private (Admin only)
 */
const getUsers = async (req, res, next) => {
  try {
    const { search = '', status = 'ALL', page = 1, limit = 20 } = req.query;

    const where = {};

    if (search && search.trim()) {
      const query = search.trim();
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } }
      ];
    }

    const normalizedStatus = String(status).toUpperCase();
    if (normalizedStatus === 'ACTIVE') {
      where.isActive = true;
    } else if (normalizedStatus === 'DISABLED') {
      where.isActive = false;
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take,
        skip,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              createdJobs: true,
              closedJobs: true,
              selectedHires: true,
              platformActivities: true
            }
          }
        }
      }),
      prisma.user.count({ where })
    ]);

    // Single aggregated query for all status & role metrics
    const statusCounts = await prisma.user.groupBy({
      by: ['isActive', 'role'],
      _count: { _all: true }
    });

    let totalAll = 0;
    let totalActive = 0;
    let totalDisabled = 0;
    let totalAdmins = 0;

    for (const group of statusCounts) {
      const c = group._count._all;
      totalAll += c;
      if (group.isActive) totalActive += c;
      else totalDisabled += c;
      if (group.role === 'ADMIN') totalAdmins += c;
    }

    // Format safe users with counts
    const safeUsers = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      stats: {
        jobsCreated: u._count.createdJobs,
        jobsClosed: u._count.closedJobs,
        hiresSelected: u._count.selectedHires,
        activitiesCount: u._count.platformActivities
      }
    }));

    return res.status(200).json({
      success: true,
      data: safeUsers,
      counts: {
        total: totalAll,
        active: totalActive,
        disabled: totalDisabled,
        admins: totalAdmins
      },
      pagination: {
        total: totalCount,
        page: Math.floor(skip / take) + 1,
        limit: take,
        totalPages: Math.ceil(totalCount / take)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get detailed user account info and recent activity timeline
 * @route   GET /api/admin/users/:id
 * @access  Private (Admin only)
 */
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            createdJobs: true,
            closedJobs: true,
            selectedHires: true,
            platformActivities: true
          }
        },
        memberships: {
          select: {
            role: true,
            workspace: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User account not found.'
      });
    }

    // Load recent activities for this user
    const recentActivities = await prisma.platformActivity.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    return res.status(200).json({
      success: true,
      data: {
        user: toPublicUser(user),
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
        workspaces: user.memberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          role: m.role
        })),
        stats: {
          jobsCreated: user._count.createdJobs,
          jobsClosed: user._count.closedJobs,
          hiresSelected: user._count.selectedHires,
          activitiesCount: user._count.platformActivities
        },
        recentActivities
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Disable or reactivate a user account
 * @route   PATCH /api/admin/users/:id/status
 * @access  Private (Admin only)
 */
const updateUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'isActive boolean is required.'
      });
    }

    // Safety guard: Admin cannot disable their own account
    if (id === req.user.id && !isActive) {
      return res.status(400).json({
        success: false,
        code: 'CANNOT_DISABLE_SELF',
        message: 'You cannot disable your own administrator account.'
      });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User account not found.'
      });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive }
    });

    // If account was disabled, revoke all active sessions immediately
    if (!isActive) {
      await revokeAllUserSessions(id, 'USER_DISABLED');
      console.log(`[Admin] Revoked all sessions for disabled user ${id} (${user.email}).`);
    }

    recordPlatformActivity({
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      action: 'USER_STATUS_CHANGED',
      entityType: 'USER',
      entityId: id,
      entityName: updated.name,
      description: `${req.user.name} ${isActive ? 'reactivated' : 'disabled'} account for ${updated.name} (${updated.email})`,
      metadata: { targetUserId: id, targetEmail: updated.email, isActive }
    });

    return res.status(200).json({
      success: true,
      message: `User account has been ${isActive ? 'reactivated' : 'disabled'} successfully.`,
      data: { user: toPublicUser(updated) }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get platform audit activities
 * @route   GET /api/admin/activities
 * @access  Private (Admin only)
 */
const getActivities = async (req, res, next) => {
  try {
    const { userId, action, startDate, endDate, page = 1, limit = 25 } = req.query;

    const result = await getPlatformActivities({
      userId: userId || null,
      action: action || null,
      startDate: startDate || null,
      endDate: endDate || null,
      page,
      limit
    });

    return res.status(200).json({
      success: true,
      data: result.activities,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  getUserById,
  updateUserStatus,
  getActivities
};
