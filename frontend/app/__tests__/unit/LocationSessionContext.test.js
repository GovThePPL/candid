import React, { createContext } from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () => ({
  multiGet: jest.fn().mockResolvedValue([['', null], ['', null]]),
  setItem: jest.fn().mockResolvedValue(),
  removeItem: jest.fn().mockResolvedValue(),
  getItem: jest.fn().mockResolvedValue(null),
}))

const mockGetSession = jest.fn()
const mockGetAll = jest.fn()
const mockGetLocations = jest.fn()
const mockGetPosts = jest.fn()
jest.mock('../../lib/api', () => ({
  sessionsApiWrapper: {
    get: (...args) => mockGetSession(...args),
    getAll: (...args) => mockGetAll(...args),
    getVotingRound: jest.fn().mockRejectedValue(new Error('not found')),
  },
  postsApiWrapper: {
    getPosts: (...args) => mockGetPosts(...args),
  },
  usersApiWrapper: {
    getLocations: (...args) => mockGetLocations(...args),
  },
}))

// Must use require('react').createContext inside factory so it runs after hoisting
jest.mock('../../contexts/UserContext', () => {
  const React = require('react')
  const ctx = React.createContext({ user: null })
  return { AuthContext: ctx }
})

jest.mock('../../constants/Sessions', () => ({
  STAGE_TO_ROUND_TYPE: {},
  PHASES_BY_METHOD: { user_driven: [] },
}))

const { AuthContext } = require('../../contexts/UserContext')
const { LocationSessionProvider, useLocationSession } = require('../../contexts/LocationSessionContext')

function wrapper({ children }) {
  return (
    <AuthContext.Provider value={{ user: { id: 'u1' } }}>
      <LocationSessionProvider>{children}</LocationSessionProvider>
    </AuthContext.Provider>
  )
}

describe('LocationSessionContext.refreshSessionData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSession.mockResolvedValue({ stage: 'opinion_discussion', label: 'Test' })
    mockGetAll.mockResolvedValue([])
    mockGetLocations.mockResolvedValue([])
    mockGetPosts.mockRejectedValue(new Error('not found'))
  })

  it('sets sessionLoading=true by default (non-silent)', async () => {
    const { result } = renderHook(() => useLocationSession(), { wrapper })

    await waitFor(() => expect(result.current.loaded).toBe(true))

    await act(async () => {
      result.current.setSelectedSession('sess-1')
    })

    await waitFor(() => expect(result.current.sessionData).toBeTruthy())

    mockGetSession.mockImplementation(
      () => Promise.resolve({ stage: 'reflection_curation', label: 'Updated' })
    )

    await act(async () => {
      result.current.refreshSessionData()
    })

    await waitFor(() => expect(result.current.sessionData.stage).toBe('reflection_curation'))
    expect(result.current.sessionLoading).toBe(false)
  })

  it('does not set sessionLoading=true when silent option is used', async () => {
    const { result } = renderHook(() => useLocationSession(), { wrapper })

    await waitFor(() => expect(result.current.loaded).toBe(true))

    await act(async () => {
      result.current.setSelectedSession('sess-1')
    })

    await waitFor(() => expect(result.current.sessionData).toBeTruthy())
    expect(result.current.sessionLoading).toBe(false)

    let loadingDuringFetch = null
    mockGetSession.mockImplementation(() => {
      loadingDuringFetch = result.current.sessionLoading
      return Promise.resolve({ stage: 'reflection_curation', label: 'Updated' })
    })

    await act(async () => {
      result.current.refreshSessionData({ silent: true })
    })

    await waitFor(() => expect(result.current.sessionData?.stage).toBe('reflection_curation'))

    // sessionLoading should not have been set to true during silent refresh
    expect(loadingDuringFetch).toBe(false)
  })
})
