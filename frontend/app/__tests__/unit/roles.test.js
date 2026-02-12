import {
  ROLE_HIERARCHY,
  ROLE_LABEL_KEYS,
  hasAnyRole,
  hasRole,
  canModerate,
  canAccessAdmin,
  getHighestRole,
  getAssignableRoles,
  getDescendantLocationIds,
  getAssignableLocations,
  getAssignableCategories,
  canManageRoleAssignment,
  isAdminAtLocation,
} from '../../lib/roles'

const makeUser = (roles) => ({ id: '1', roles })
const role = (name, loc = 'loc1', cat = null) => ({
  role: name,
  locationId: loc,
  positionCategoryId: cat,
})

describe('roles utilities', () => {
  describe('hasAnyRole', () => {
    it('returns false for null/undefined user', () => {
      expect(hasAnyRole(null)).toBe(false)
      expect(hasAnyRole(undefined)).toBe(false)
    })

    it('returns false for user with no roles', () => {
      expect(hasAnyRole(makeUser([]))).toBe(false)
      expect(hasAnyRole(makeUser(undefined))).toBe(false)
    })

    it('returns true for user with any role', () => {
      expect(hasAnyRole(makeUser([role('liaison')]))).toBe(true)
    })
  })

  describe('hasRole', () => {
    it('returns true when user holds exact role', () => {
      expect(hasRole(makeUser([role('moderator')]), 'moderator')).toBe(true)
    })

    it('admin satisfies moderator', () => {
      expect(hasRole(makeUser([role('admin')]), 'moderator')).toBe(true)
    })

    it('admin satisfies facilitator', () => {
      expect(hasRole(makeUser([role('admin')]), 'facilitator')).toBe(true)
    })

    it('moderator does NOT satisfy admin', () => {
      expect(hasRole(makeUser([role('moderator')]), 'admin')).toBe(false)
    })

    it('facilitator satisfies assistant_moderator', () => {
      expect(hasRole(makeUser([role('facilitator')]), 'assistant_moderator')).toBe(true)
    })

    it('liaison does not satisfy facilitator', () => {
      expect(hasRole(makeUser([role('liaison')]), 'facilitator')).toBe(false)
    })

    it('returns false for unknown required role', () => {
      expect(hasRole(makeUser([role('admin')]), 'superadmin')).toBe(false)
    })

    it('returns false for null user', () => {
      expect(hasRole(null, 'admin')).toBe(false)
    })
  })

  describe('canModerate', () => {
    it('returns true for admin', () => {
      expect(canModerate(makeUser([role('admin')]))).toBe(true)
    })

    it('returns true for moderator', () => {
      expect(canModerate(makeUser([role('moderator')]))).toBe(true)
    })

    it('returns true for facilitator', () => {
      expect(canModerate(makeUser([role('facilitator', 'loc1', 'cat1')]))).toBe(true)
    })

    it('returns false for assistant_moderator', () => {
      expect(canModerate(makeUser([role('assistant_moderator', 'loc1', 'cat1')]))).toBe(false)
    })

    it('returns false for normal user', () => {
      expect(canModerate(makeUser([]))).toBe(false)
    })
  })

  describe('canAccessAdmin', () => {
    it('returns true for any role holder', () => {
      expect(canAccessAdmin(makeUser([role('liaison')]))).toBe(true)
      expect(canAccessAdmin(makeUser([role('expert')]))).toBe(true)
      expect(canAccessAdmin(makeUser([role('admin')]))).toBe(true)
    })

    it('returns false for user with no roles', () => {
      expect(canAccessAdmin(makeUser([]))).toBe(false)
    })
  })

  describe('getHighestRole', () => {
    it('returns admin when user has admin + moderator', () => {
      expect(getHighestRole(makeUser([role('moderator'), role('admin')]))).toBe('admin')
    })

    it('returns moderator when user has moderator + facilitator', () => {
      expect(getHighestRole(makeUser([role('facilitator'), role('moderator')]))).toBe('moderator')
    })

    it('returns the single role when user has one role', () => {
      expect(getHighestRole(makeUser([role('expert')]))).toBe('expert')
    })

    it('returns null for user with no roles', () => {
      expect(getHighestRole(makeUser([]))).toBeNull()
    })

    it('returns null for null user', () => {
      expect(getHighestRole(null)).toBeNull()
    })
  })

  describe('ROLE_HIERARCHY', () => {
    it('has entries for all 6 roles', () => {
      expect(Object.keys(ROLE_HIERARCHY)).toHaveLength(6)
    })
  })

  describe('ROLE_LABEL_KEYS', () => {
    it('has keys for all 6 roles', () => {
      expect(Object.keys(ROLE_LABEL_KEYS)).toHaveLength(6)
    })
  })

  // --- Assignment scope utilities ---

  // Location tree for tests:
  //   US (1)
  //   ├── Oregon (2)
  //   │   └── Portland (4)
  //   └── California (3)
  const testLocations = [
    { id: 1, name: 'US', parentLocationId: null },
    { id: 2, name: 'Oregon', parentLocationId: 1 },
    { id: 3, name: 'California', parentLocationId: 1 },
    { id: 4, name: 'Portland', parentLocationId: 2 },
  ]

  describe('getAssignableRoles', () => {
    it('returns all roles for admin user', () => {
      const u = makeUser([role('admin', 'loc1')])
      expect(getAssignableRoles(u)).toEqual(['admin', 'moderator', 'facilitator', 'assistant_moderator', 'expert', 'liaison'])
    })

    it('returns facilitator-assignable roles for facilitator user', () => {
      const u = makeUser([role('facilitator', 'loc1', 'cat1')])
      expect(getAssignableRoles(u)).toEqual(['assistant_moderator', 'expert', 'liaison'])
    })

    it('returns empty for moderator user', () => {
      const u = makeUser([role('moderator', 'loc1')])
      expect(getAssignableRoles(u)).toEqual([])
    })

    it('returns empty for liaison user', () => {
      const u = makeUser([role('liaison', 'loc1', 'cat1')])
      expect(getAssignableRoles(u)).toEqual([])
    })

    it('returns combined roles for user with admin + facilitator', () => {
      const u = makeUser([role('admin', 'loc1'), role('facilitator', 'loc2', 'cat1')])
      const result = getAssignableRoles(u)
      expect(result).toContain('admin')
      expect(result).toContain('moderator')
      expect(result).toContain('facilitator')
      expect(result).toContain('assistant_moderator')
      expect(result).toContain('expert')
      expect(result).toContain('liaison')
      expect(result).toHaveLength(6)
    })

    it('returns empty for null user', () => {
      expect(getAssignableRoles(null)).toEqual([])
    })

    it('returns empty for user with no roles', () => {
      expect(getAssignableRoles(makeUser([]))).toEqual([])
    })
  })

  describe('getDescendantLocationIds', () => {
    it('returns all locations for root', () => {
      const result = getDescendantLocationIds(1, testLocations)
      expect(result).toEqual(new Set([1, 2, 3, 4]))
    })

    it('returns self + children for mid-level', () => {
      const result = getDescendantLocationIds(2, testLocations)
      expect(result).toEqual(new Set([2, 4]))
    })

    it('returns only self for leaf', () => {
      const result = getDescendantLocationIds(4, testLocations)
      expect(result).toEqual(new Set([4]))
    })

    it('returns only self for California (no children)', () => {
      const result = getDescendantLocationIds(3, testLocations)
      expect(result).toEqual(new Set([3]))
    })
  })

  describe('getAssignableLocations', () => {
    it('returns all locations for admin at root assigning admin role', () => {
      const u = makeUser([role('admin', 1)])
      const result = getAssignableLocations(u, 'admin', testLocations)
      expect(result).toHaveLength(4)
    })

    it('returns subtree for admin at Oregon assigning moderator', () => {
      const u = makeUser([role('admin', 2)])
      const result = getAssignableLocations(u, 'moderator', testLocations)
      expect(result.map(l => l.id).sort()).toEqual([2, 4])
    })

    it('returns exact location for facilitator assigning assistant_moderator', () => {
      const u = makeUser([role('facilitator', 2, 'cat1')])
      const result = getAssignableLocations(u, 'assistant_moderator', testLocations)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(2)
    })

    it('returns empty for moderator assigning any role', () => {
      const u = makeUser([role('moderator', 1)])
      expect(getAssignableLocations(u, 'admin', testLocations)).toEqual([])
      expect(getAssignableLocations(u, 'assistant_moderator', testLocations)).toEqual([])
    })

    it('returns empty for null role', () => {
      const u = makeUser([role('admin', 1)])
      expect(getAssignableLocations(u, null, testLocations)).toEqual([])
    })

    it('merges locations from multiple admin roles', () => {
      const u = makeUser([role('admin', 2), role('admin', 3)])
      const result = getAssignableLocations(u, 'facilitator', testLocations)
      // Oregon(2) + Portland(4) + California(3)
      expect(result.map(l => l.id).sort()).toEqual([2, 3, 4])
    })
  })

  describe('getAssignableCategories', () => {
    it('returns null for admin-assignable roles (categories N/A)', () => {
      const u = makeUser([role('admin', 1)])
      expect(getAssignableCategories(u, 'admin', 1)).toBeNull()
      expect(getAssignableCategories(u, 'moderator', 1)).toBeNull()
      expect(getAssignableCategories(u, 'facilitator', 1)).toBeNull()
    })

    it('returns matching category for facilitator at location', () => {
      const u = makeUser([role('facilitator', 2, 'catA')])
      const result = getAssignableCategories(u, 'expert', 2)
      expect(result).toEqual(new Set(['catA']))
    })

    it('returns empty set for facilitator at wrong location', () => {
      const u = makeUser([role('facilitator', 2, 'catA')])
      const result = getAssignableCategories(u, 'expert', 3)
      expect(result).toEqual(new Set())
    })

    it('returns multiple categories from multiple facilitator roles at same location', () => {
      const u = makeUser([
        role('facilitator', 2, 'catA'),
        role('facilitator', 2, 'catB'),
      ])
      const result = getAssignableCategories(u, 'liaison', 2)
      expect(result).toEqual(new Set(['catA', 'catB']))
    })

    it('returns empty for null user', () => {
      expect(getAssignableCategories(null, 'expert', 1)).toEqual(new Set())
    })
  })

  describe('isAdminAtLocation', () => {
    it('admin at root returns true for all locations', () => {
      const u = makeUser([role('admin', 1)])
      expect(isAdminAtLocation(u, 1, testLocations)).toBe(true)
      expect(isAdminAtLocation(u, 2, testLocations)).toBe(true)
      expect(isAdminAtLocation(u, 3, testLocations)).toBe(true)
      expect(isAdminAtLocation(u, 4, testLocations)).toBe(true)
    })

    it('admin at Oregon returns true for Oregon + Portland, false for California', () => {
      const u = makeUser([role('admin', 2)])
      expect(isAdminAtLocation(u, 2, testLocations)).toBe(true)
      expect(isAdminAtLocation(u, 4, testLocations)).toBe(true)
      expect(isAdminAtLocation(u, 1, testLocations)).toBe(false)
      expect(isAdminAtLocation(u, 3, testLocations)).toBe(false)
    })

    it('admin at leaf returns true for self only', () => {
      const u = makeUser([role('admin', 4)])
      expect(isAdminAtLocation(u, 4, testLocations)).toBe(true)
      expect(isAdminAtLocation(u, 2, testLocations)).toBe(false)
      expect(isAdminAtLocation(u, 1, testLocations)).toBe(false)
    })

    it('moderator/facilitator returns false (only admin counts)', () => {
      const u = makeUser([role('moderator', 1), role('facilitator', 1, 'cat1')])
      expect(isAdminAtLocation(u, 1, testLocations)).toBe(false)
      expect(isAdminAtLocation(u, 2, testLocations)).toBe(false)
    })

    it('returns false for no roles', () => {
      expect(isAdminAtLocation(makeUser([]), 1, testLocations)).toBe(false)
    })

    it('returns false for null user', () => {
      expect(isAdminAtLocation(null, 1, testLocations)).toBe(false)
    })

    it('returns false for null locationId', () => {
      const u = makeUser([role('admin', 1)])
      expect(isAdminAtLocation(u, null, testLocations)).toBe(false)
    })
  })

  describe('canManageRoleAssignment', () => {
    const assignment = (roleName, locId, catId = null) => ({
      role: roleName,
      location: { id: locId, name: 'Test' },
      category: catId ? { id: catId, label: 'Test' } : null,
    })

    it('admin at root can remove admin at any location', () => {
      const u = makeUser([role('admin', 1)])
      expect(canManageRoleAssignment(u, assignment('admin', 2), testLocations)).toBe(true)
      expect(canManageRoleAssignment(u, assignment('admin', 4), testLocations)).toBe(true)
    })

    it('admin at Oregon can remove moderator at Oregon or Portland', () => {
      const u = makeUser([role('admin', 2)])
      expect(canManageRoleAssignment(u, assignment('moderator', 2), testLocations)).toBe(true)
      expect(canManageRoleAssignment(u, assignment('moderator', 4), testLocations)).toBe(true)
    })

    it('admin at Oregon cannot remove moderator at California', () => {
      const u = makeUser([role('admin', 2)])
      expect(canManageRoleAssignment(u, assignment('moderator', 3), testLocations)).toBe(false)
    })

    it('facilitator can remove assistant_moderator at exact location + category', () => {
      const u = makeUser([role('facilitator', 2, 'catA')])
      expect(canManageRoleAssignment(u, assignment('assistant_moderator', 2, 'catA'), testLocations)).toBe(true)
    })

    it('facilitator cannot remove at different location', () => {
      const u = makeUser([role('facilitator', 2, 'catA')])
      expect(canManageRoleAssignment(u, assignment('expert', 3, 'catA'), testLocations)).toBe(false)
    })

    it('facilitator cannot remove at different category', () => {
      const u = makeUser([role('facilitator', 2, 'catA')])
      expect(canManageRoleAssignment(u, assignment('liaison', 2, 'catB'), testLocations)).toBe(false)
    })

    it('moderator cannot remove any role', () => {
      const u = makeUser([role('moderator', 1)])
      expect(canManageRoleAssignment(u, assignment('facilitator', 1), testLocations)).toBe(false)
      expect(canManageRoleAssignment(u, assignment('expert', 1, 'catA'), testLocations)).toBe(false)
    })

    it('returns false for null user', () => {
      expect(canManageRoleAssignment(null, assignment('admin', 1), testLocations)).toBe(false)
    })

    it('returns false for assignment with no location', () => {
      const u = makeUser([role('admin', 1)])
      expect(canManageRoleAssignment(u, { role: 'admin', location: null }, testLocations)).toBe(false)
    })
  })
})
