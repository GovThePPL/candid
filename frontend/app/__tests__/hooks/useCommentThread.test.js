import { renderHook, act, waitFor } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

const mockGetComments = jest.fn()
const mockVoteOnComment = jest.fn()
const mockCreateComment = jest.fn()
const mockPatchComment = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    comments: {
      getComments: (...args) => mockGetComments(...args),
      voteOnComment: (...args) => mockVoteOnComment(...args),
      createComment: (...args) => mockCreateComment(...args),
      patchComment: (...args) => mockPatchComment(...args),
    },
  },
}))

import useCommentThread from '../../hooks/useCommentThread'

const makeComment = (overrides = {}) => ({
  id: 'c1',
  parentCommentId: null,
  body: 'test',
  score: 5,
  upvoteCount: 3,
  downvoteCount: 1,
  userVote: null,
  createdTime: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('useCommentThread', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetComments.mockResolvedValue([])
  })

  it('fetches comments on mount', async () => {
    mockGetComments.mockResolvedValue([makeComment()])

    const { result } = renderHook(() => useCommentThread('p1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockGetComments).toHaveBeenCalledWith('p1')
    expect(result.current.flatList).toHaveLength(1)
    expect(result.current.flatList[0].id).toBe('c1')
  })

  it('builds flat list with depth info', async () => {
    mockGetComments.mockResolvedValue([
      makeComment({ id: 'r1' }),
      makeComment({ id: 'c1', parentCommentId: 'r1' }),
    ])

    const { result } = renderHook(() => useCommentThread('p1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.flatList).toHaveLength(2)
    expect(result.current.flatList[0].depth).toBe(0)
    expect(result.current.flatList[1].depth).toBe(1)
  })

  it('setSort rebuilds tree with new order', async () => {
    mockGetComments.mockResolvedValue([
      makeComment({ id: 'c1', score: 10, createdTime: '2026-01-01T00:00:00Z' }),
      makeComment({ id: 'c2', score: 5, createdTime: '2026-01-02T00:00:00Z' }),
    ])

    const { result } = renderHook(() => useCommentThread('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Default best sort: c1 first (higher score)
    expect(result.current.flatList[0].id).toBe('c1')

    act(() => result.current.setSort('new'))

    // New sort: c2 first (newer)
    expect(result.current.flatList[0].id).toBe('c2')
  })

  it('toggleCollapse hides children', async () => {
    mockGetComments.mockResolvedValue([
      makeComment({ id: 'r1' }),
      makeComment({ id: 'c1', parentCommentId: 'r1' }),
    ])

    const { result } = renderHook(() => useCommentThread('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.flatList).toHaveLength(2)

    act(() => result.current.toggleCollapse('r1'))

    // r1 is collapsed, c1 hidden
    expect(result.current.flatList).toHaveLength(1)
    expect(result.current.flatList[0].isCollapsed).toBe(true)

    // Expand again
    act(() => result.current.toggleCollapse('r1'))
    expect(result.current.flatList).toHaveLength(2)
  })

  it('handleVote performs optimistic upvote', async () => {
    mockGetComments.mockResolvedValue([
      makeComment({ id: 'c1', upvoteCount: 3, downvoteCount: 1, userVote: null }),
    ])
    mockVoteOnComment.mockResolvedValue({
      upvoteCount: 4,
      downvoteCount: 1,
      score: 6,
      userVote: { voteType: 'upvote' },
    })

    const { result } = renderHook(() => useCommentThread('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleVote('c1', 'upvote')
    })

    expect(mockVoteOnComment).toHaveBeenCalledWith('c1', { voteType: 'upvote' })
    // After reconciliation with server
    const comment = result.current.flatList[0]
    expect(comment.upvoteCount).toBe(4)
    expect(comment.userVote.voteType).toBe('upvote')
  })

  it('handleVote reverts on error', async () => {
    mockGetComments.mockResolvedValue([
      makeComment({ id: 'c1', upvoteCount: 3, downvoteCount: 1, userVote: null }),
    ])
    mockVoteOnComment.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useCommentThread('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleVote('c1', 'upvote')
    })

    // Should revert to original
    const comment = result.current.flatList[0]
    expect(comment.upvoteCount).toBe(3)
    expect(comment.userVote).toBeNull()
  })

  it('handleCreateComment refetches after success', async () => {
    mockGetComments
      .mockResolvedValueOnce([makeComment({ id: 'c1' })])
      .mockResolvedValueOnce([
        makeComment({ id: 'c1' }),
        makeComment({ id: 'c2', body: 'New comment' }),
      ])
    mockCreateComment.mockResolvedValue({})

    const { result } = renderHook(() => useCommentThread('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.flatList).toHaveLength(1)

    await act(async () => {
      await result.current.handleCreateComment('New comment', null)
    })

    // Should have refetched
    expect(mockGetComments).toHaveBeenCalledTimes(2)
    expect(result.current.flatList).toHaveLength(2)
  })

  it('handles fetch error gracefully', async () => {
    mockGetComments.mockRejectedValue(new Error('Failed'))

    const { result } = renderHook(() => useCommentThread('p1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeTruthy()
    expect(result.current.flatList).toEqual([])
  })

  // Pagination tests
  it('handles paginated response with hasMore', async () => {
    mockGetComments.mockResolvedValue({
      comments: [makeComment({ id: 'c1' })],
      hasMore: true,
      nextCursor: 'cursor123',
      totalRootCount: 5,
    })

    const { result } = renderHook(() => useCommentThread('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.flatList).toHaveLength(1)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.totalRootCount).toBe(5)
  })

  it('loadMore appends comments from next page', async () => {
    mockGetComments
      .mockResolvedValueOnce({
        comments: [makeComment({ id: 'c1' })],
        hasMore: true,
        nextCursor: 'cursor1',
        totalRootCount: 2,
      })
      .mockResolvedValueOnce({
        comments: [makeComment({ id: 'c2' })],
        hasMore: false,
        nextCursor: null,
        totalRootCount: 2,
      })

    const { result } = renderHook(() => useCommentThread('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.flatList).toHaveLength(1)

    await act(async () => {
      await result.current.loadMore()
    })

    expect(mockGetComments).toHaveBeenCalledTimes(2)
    expect(mockGetComments).toHaveBeenLastCalledWith('p1', { cursor: 'cursor1' })
    expect(result.current.flatList).toHaveLength(2)
    expect(result.current.hasMore).toBe(false)
  })

  it('loadMore does nothing when hasMore is false', async () => {
    mockGetComments.mockResolvedValue({
      comments: [makeComment({ id: 'c1' })],
      hasMore: false,
      nextCursor: null,
      totalRootCount: 1,
    })

    const { result } = renderHook(() => useCommentThread('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.loadMore()
    })

    // Should not have called getComments again
    expect(mockGetComments).toHaveBeenCalledTimes(1)
  })

  it('handleToggleRole optimistically updates and calls API', async () => {
    mockGetComments.mockResolvedValue([
      makeComment({ id: 'c1', showCreatorRole: true, creatorRole: 'moderator' }),
    ])
    mockPatchComment.mockResolvedValue({})

    const { result } = renderHook(() => useCommentThread('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleToggleRole('c1', false)
    })

    expect(mockPatchComment).toHaveBeenCalledWith('c1', { showCreatorRole: false })
    expect(result.current.flatList[0].showCreatorRole).toBe(false)
  })

  it('handleToggleRole reverts on error', async () => {
    mockGetComments.mockResolvedValue([
      makeComment({ id: 'c1', showCreatorRole: true, creatorRole: 'moderator' }),
    ])
    mockPatchComment.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useCommentThread('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleToggleRole('c1', false)
    })

    // Should revert to original
    expect(result.current.flatList[0].showCreatorRole).toBe(true)
  })
})
