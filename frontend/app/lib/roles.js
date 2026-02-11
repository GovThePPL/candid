/**
 * Role-checking utilities for the frontend.
 *
 * Mirrors the backend hierarchy in auth.py:
 *   Admin > Moderator > Facilitator > Assistant Moderator / Expert / Liaison
 *
 * user.roles[] is an array of { role, locationId, positionCategoryId, ... }
 * set by the backend on GET /users/me.
 */

// Role hierarchy: each role is satisfied by any role above it
export const ROLE_HIERARCHY = {
  admin: new Set(['admin']),
  moderator: new Set(['admin', 'moderator']),
  facilitator: new Set(['admin', 'moderator', 'facilitator']),
  assistant_moderator: new Set(['admin', 'moderator', 'facilitator', 'assistant_moderator']),
  liaison: new Set(['admin', 'moderator', 'facilitator', 'liaison']),
  expert: new Set(['admin', 'moderator', 'facilitator', 'expert']),
}

// Ordered from highest to lowest
const ROLE_RANK = ['admin', 'moderator', 'facilitator', 'assistant_moderator', 'expert', 'liaison']

// Maps role names to i18n keys (admin namespace)
export const ROLE_LABEL_KEYS = {
  admin: 'roleAdmin',
  moderator: 'roleModerator',
  facilitator: 'roleFacilitator',
  assistant_moderator: 'roleAssistantModerator',
  expert: 'roleExpert',
  liaison: 'roleLiaison',
}

/**
 * Check if the user has any role in user.roles[].
 */
export function hasAnyRole(user) {
  return Array.isArray(user?.roles) && user.roles.length > 0
}

/**
 * Check if the user holds `requiredRole` or any role that satisfies it
 * in the hierarchy.
 */
export function hasRole(user, requiredRole) {
  if (!Array.isArray(user?.roles)) return false
  const satisfying = ROLE_HIERARCHY[requiredRole]
  if (!satisfying) return false
  return user.roles.some(r => satisfying.has(r.role))
}

/**
 * True for admin, moderator, or facilitator — the roles that can moderate content.
 */
export function canModerate(user) {
  return hasRole(user, 'moderator')
}

/**
 * True for any role holder — grants access to the admin panel.
 */
export function canAccessAdmin(user) {
  return hasAnyRole(user)
}

/**
 * Return the user's highest role name, or null.
 */
export function getHighestRole(user) {
  if (!Array.isArray(user?.roles) || user.roles.length === 0) return null
  const userRoleNames = new Set(user.roles.map(r => r.role))
  for (const role of ROLE_RANK) {
    if (userRoleNames.has(role)) return role
  }
  return null
}

// --- Assignment scope utilities ---

// Roles that an admin can assign
const ADMIN_ASSIGNABLE = ['admin', 'moderator', 'facilitator']
// Roles that a facilitator can assign
const FACILITATOR_ASSIGNABLE = ['assistant_moderator', 'expert', 'liaison']

/**
 * Return the list of role names this user is allowed to assign.
 * - Admin → admin, moderator, facilitator
 * - Facilitator → assistant_moderator, expert, liaison
 * - Others → [] (empty)
 */
export function getAssignableRoles(user) {
  if (!Array.isArray(user?.roles) || user.roles.length === 0) return []
  const roleNames = new Set(user.roles.map(r => r.role))
  const result = []
  if (roleNames.has('admin')) {
    result.push(...ADMIN_ASSIGNABLE)
  }
  if (roleNames.has('facilitator')) {
    result.push(...FACILITATOR_ASSIGNABLE)
  }
  // Deduplicate in case of overlap (shouldn't happen, but safe)
  return [...new Set(result)]
}

/**
 * BFS to find all descendant location IDs (inclusive of the given locationId).
 * @param {number} locationId
 * @param {Array} allLocations - flat array with { id, parentLocationId }
 * @returns {Set<number>}
 */
export function getDescendantLocationIds(locationId, allLocations) {
  const result = new Set([locationId])
  const queue = [locationId]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const loc of allLocations) {
      if (loc.parentLocationId === current && !result.has(loc.id)) {
        result.add(loc.id)
        queue.push(loc.id)
      }
    }
  }
  return result
}

/**
 * Return locations the user can assign the given role at.
 * - For admin-assignable roles: locations at/below each of user's admin locations
 * - For facilitator-assignable roles: exact locations from user's facilitator roles
 * @param {object} user
 * @param {string} role - the role being assigned
 * @param {Array} allLocations
 * @returns {Array} filtered location objects
 */
export function getAssignableLocations(user, role, allLocations) {
  if (!Array.isArray(user?.roles) || !role || !Array.isArray(allLocations)) return []

  const allowedIds = new Set()

  if (ADMIN_ASSIGNABLE.includes(role)) {
    // Admin roles: locations at/below each admin assignment
    for (const r of user.roles) {
      if (r.role === 'admin' && r.locationId) {
        for (const id of getDescendantLocationIds(r.locationId, allLocations)) {
          allowedIds.add(id)
        }
      }
    }
  } else if (FACILITATOR_ASSIGNABLE.includes(role)) {
    // Facilitator roles: exact locations from facilitator assignments
    for (const r of user.roles) {
      if (r.role === 'facilitator' && r.locationId) {
        allowedIds.add(r.locationId)
      }
    }
  }

  return allLocations.filter(l => allowedIds.has(l.id))
}

/**
 * Return category IDs the user can assign for a given role + location.
 * - For admin-assignable roles: null (categories not applicable)
 * - For facilitator-assignable roles: category IDs from matching facilitator roles
 * @param {object} user
 * @param {string} role
 * @param {number} locationId
 * @returns {Set<number>|null} Set of category IDs, or null if all are valid
 */
export function getAssignableCategories(user, role, locationId) {
  if (!Array.isArray(user?.roles) || !role) return new Set()

  if (ADMIN_ASSIGNABLE.includes(role)) {
    return null // categories N/A for admin-assignable roles
  }

  if (FACILITATOR_ASSIGNABLE.includes(role)) {
    const ids = new Set()
    for (const r of user.roles) {
      if (r.role === 'facilitator' && r.locationId === locationId && r.positionCategoryId) {
        ids.add(r.positionCategoryId)
      }
    }
    return ids
  }

  return new Set()
}

/**
 * Check if the user is admin at a given location or any ancestor of it.
 * Mirrors the backend `is_admin_at_location` authority check.
 * @param {object} user
 * @param {number} locationId - the target location to check authority over
 * @param {Array} allLocations - flat array with { id, parentLocationId }
 * @returns {boolean}
 */
export function isAdminAtLocation(user, locationId, allLocations) {
  if (!Array.isArray(user?.roles) || !locationId || !Array.isArray(allLocations)) return false

  for (const r of user.roles) {
    if (r.role === 'admin' && r.locationId) {
      if (getDescendantLocationIds(r.locationId, allLocations).has(locationId)) {
        return true
      }
    }
  }
  return false
}

/**
 * Check if the logged-in user can manage (remove) a specific role assignment.
 * Uses the same authority rules as assignment:
 *   - Admin at ancestor/self location → can manage admin/moderator/facilitator
 *   - Facilitator at exact location + category → can manage asst_mod/expert/liaison
 * @param {object} user - the logged-in user
 * @param {object} roleAssignment - { role, location: { id }, category: { id } }
 * @param {Array} allLocations - flat location list with parentLocationId
 * @returns {boolean}
 */
export function canManageRoleAssignment(user, roleAssignment, allLocations) {
  if (!Array.isArray(user?.roles) || !roleAssignment?.role) return false

  const role = roleAssignment.role
  const locationId = roleAssignment.location?.id
  if (!locationId) return false

  if (ADMIN_ASSIGNABLE.includes(role)) {
    // Check if user is admin at this location or any ancestor
    for (const r of user.roles) {
      if (r.role === 'admin' && r.locationId) {
        if (getDescendantLocationIds(r.locationId, allLocations).has(locationId)) {
          return true
        }
      }
    }
    return false
  }

  if (FACILITATOR_ASSIGNABLE.includes(role)) {
    const categoryId = roleAssignment.category?.id
    // Facilitator must match exact location + category
    return user.roles.some(
      r => r.role === 'facilitator' &&
           r.locationId === locationId &&
           r.positionCategoryId === categoryId
    )
  }

  return false
}
