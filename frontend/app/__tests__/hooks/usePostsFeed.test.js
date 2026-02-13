import { renderHook, act, waitFor } from '@testing-library/react-native'

const mockGetPosts = jest.fn()
const mockVoteOnPost = jest.fn()

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    posts: {
      getPosts: (...args) => mockGetPosts(...args),
      voteOnPost: (...args) => mockVoteOnPost(...args),
    },
  },
}))

import usePostsFeed from '../../hooks/usePostsFeed'

beforeEach(() => {
  jest.clearAllMocks()
  mockGetPosts.mockResolvedValue({ posts: [], hasMore: false, nextCursor: null })
})

const defaultPosts = [
  { id: 'p1', title: 'First', upvoteCount: 3, userVote: null },
  { id: 'p2', title: 'Second', upvoteCount: 1, userVote: { voteType: 'upvote' } },
]

describe('usePostsFeed', () => {
  it('returns initial state with loading true', () => {
    // Never resolve so we can inspect initial state
    mockGetPosts.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePostsFeed('loc1', 'all', 'discussion'))
    expect(result.current.loading).toBe(true)
    expect(result.current.posts).toEqual([])
    expect(result.current.sort).toBe('hot')
    expect(result.current.answeredFilter).toBeNull()
    expect(result.current.hasMore).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('fetches posts on mount when locationId is provided', async () => {
    mockGetPosts.mockResolvedValue({ posts: defaultPosts, hasMore: true, nextCursor: 'c1' })
    const { result } = renderHook(() => usePostsFeed('loc1', 'cat1', 'discussion'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockGetPosts).toHaveBeenCalledWith('loc1', {
      categoryId: 'cat1',
      postType: 'discussion',
      sort: 'hot',
      limit: 25,
      answered: null,
    })
    expect(result.current.posts).toEqual(defaultPosts)
    expect(result.current.hasMore).toBe(true)
  })

  it('does not fetch when locationId is null', async () => {
    const { result } = renderHook(() => usePostsFeed(null, 'all', 'discussion'))
    // Let any pending microtasks flush
    await act(() => Promise.resolve())
    expect(mockGetPosts).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(true)
  })

  it('sets error state on fetch failure', async () => {
    const err = new Error('Network error')
    mockGetPosts.mockRejectedValue(err)
    const { result } = renderHook(() => usePostsFeed('loc1', 'all', 'discussion'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe(err)
    expect(result.current.posts).toEqual([])
  })

  it('loadMore fetches next page and appends posts', async () => {
    mockGetPosts
      .mockResolvedValueOnce({ posts: [defaultPosts[0]], hasMore: true, nextCursor: 'c1' })
      .mockResolvedValueOnce({ posts: [defaultPosts[1]], hasMore: false, nextCursor: null })

    const { result } = renderHook(() => usePostsFeed('loc1', 'all', 'discussion'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.posts).toHaveLength(1)

    await act(async () => {
      await result.current.loadMore()
    })

    expect(result.current.posts).toHaveLength(2)
    expect(result.current.posts[1].id).toBe('p2')
    expect(result.current.hasMore).toBe(false)
    // Second call should include cursor
    expect(mockGetPosts).toHaveBeenCalledWith('loc1', expect.objectContaining({ cursor: 'c1' }))
  })

  it('loadMore does nothing when no cursor (hasMore false)', async () => {
    mockGetPosts.mockResolvedValue({ posts: defaultPosts, hasMore: false, nextCursor: null })
    const { result } = renderHook(() => usePostsFeed('loc1', 'all', 'discussion'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const callCount = mockGetPosts.mock.calls.length

    await act(async () => {
      await result.current.loadMore()
    })

    // No new API call
    expect(mockGetPosts).toHaveBeenCalledTimes(callCount)
  })

  it('handleRefresh triggers fetch with refreshing state', async () => {
    mockGetPosts.mockResolvedValue({ posts: defaultPosts, hasMore: false, nextCursor: null })
    const { result } = renderHook(() => usePostsFeed('loc1', 'all', 'discussion'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockGetPosts.mockResolvedValue({ posts: [defaultPosts[0]], hasMore: false, nextCursor: null })

    await act(async () => {
      result.current.handleRefresh()
    })

    await waitFor(() => expect(result.current.refreshing).toBe(false))
    expect(result.current.posts).toHaveLength(1)
  })

  it('handleUpvote optimistically toggles upvote on', async () => {
    mockGetPosts.mockResolvedValue({
      posts: [{ id: 'p1', title: 'Test', upvoteCount: 3, userVote: null }],
      hasMore: false,
      nextCursor: null,
    })
    mockVoteOnPost.mockResolvedValue({
      userVote: { voteType: 'upvote' },
      upvoteCount: 4,
      downvoteCount: 0,
      score: 4,
    })

    const { result } = renderHook(() => usePostsFeed('loc1', 'all', 'discussion'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleUpvote('p1')
    })

    expect(mockVoteOnPost).toHaveBeenCalledWith('p1', { voteType: 'upvote' })
    // After server response reconciliation
    expect(result.current.posts[0].upvoteCount).toBe(4)
    expect(result.current.posts[0].userVote).toEqual({ voteType: 'upvote' })
  })

  it('handleUpvote optimistically toggles upvote off', async () => {
    mockGetPosts.mockResolvedValue({
      posts: [{ id: 'p1', title: 'Test', upvoteCount: 5, userVote: { voteType: 'upvote' } }],
      hasMore: false,
      nextCursor: null,
    })
    mockVoteOnPost.mockResolvedValue({
      userVote: null,
      upvoteCount: 4,
      downvoteCount: 0,
      score: 4,
    })

    const { result } = renderHook(() => usePostsFeed('loc1', 'all', 'discussion'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleUpvote('p1')
    })

    expect(result.current.posts[0].upvoteCount).toBe(4)
    expect(result.current.posts[0].userVote).toBeNull()
  })

  it('handleUpvote reverts on API error by refetching', async () => {
    mockGetPosts.mockResolvedValue({
      posts: [{ id: 'p1', title: 'Test', upvoteCount: 3, userVote: null }],
      hasMore: false,
      nextCursor: null,
    })

    const { result } = renderHook(() => usePostsFeed('loc1', 'all', 'discussion'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Vote fails, then refetch returns original data
    mockVoteOnPost.mockRejectedValue(new Error('Vote failed'))
    mockGetPosts.mockResolvedValue({
      posts: [{ id: 'p1', title: 'Test', upvoteCount: 3, userVote: null }],
      hasMore: false,
      nextCursor: null,
    })

    await act(async () => {
      await result.current.handleUpvote('p1')
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    // Should have refetched
    expect(result.current.posts[0].upvoteCount).toBe(3)
    expect(result.current.posts[0].userVote).toBeNull()
  })

  it('refetches when sort changes', async () => {
    mockGetPosts.mockResolvedValue({ posts: defaultPosts, hasMore: false, nextCursor: null })
    const { result } = renderHook(() => usePostsFeed('loc1', 'all', 'discussion'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const callsBefore = mockGetPosts.mock.calls.length

    await act(() => {
      result.current.setSort('new')
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetPosts.mock.calls.length).toBeGreaterThan(callsBefore)
    const lastCall = mockGetPosts.mock.calls[mockGetPosts.mock.calls.length - 1]
    expect(lastCall[1]).toEqual(expect.objectContaining({ sort: 'new' }))
  })

  it('refetches when answeredFilter changes', async () => {
    mockGetPosts.mockResolvedValue({ posts: [], hasMore: false, nextCursor: null })
    const { result } = renderHook(() => usePostsFeed('loc1', 'all', 'question'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const callsBefore = mockGetPosts.mock.calls.length

    await act(() => {
      result.current.setAnsweredFilter('true')
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetPosts.mock.calls.length).toBeGreaterThan(callsBefore)
    const lastCall = mockGetPosts.mock.calls[mockGetPosts.mock.calls.length - 1]
    expect(lastCall[1]).toEqual(expect.objectContaining({ answered: 'true' }))
  })
})
