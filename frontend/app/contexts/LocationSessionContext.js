import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { sessionsApiWrapper, postsApiWrapper, usersApiWrapper } from '../lib/api'
import { AuthContext } from './UserContext'
import { STAGE_TO_ROUND_TYPE } from '../constants/Sessions'

// Stages where proposals exist (voting round may be present)
const PROPOSAL_STAGES = new Set(['proposal_qualify', 'reflection_proposals'])

// All stages at or past proposal_issue — voting round data may exist
const VOTING_ROUND_STAGES = new Set([
  'proposal_issue', 'proposal_qualify', 'proposal_stakeholders',
  'opinion_discussion', 'reflection_curation', 'reflection_proposals',
  'consensus',
])


// Stages past the proposal phase — accepted proposal should be available
const POST_PROPOSAL_STAGES = new Set([
  'opinion_discussion', 'reflection_curation', 'reflection_proposals',
  'consensus',
])

const LOCATION_KEY = '@candid:selectedLocation'
const SESSION_KEY = '@candid:selectedSession'

const LocationSessionContext = createContext()

export function LocationSessionProvider({ children }) {
  const { user } = useContext(AuthContext)
  const [selectedLocation, setSelectedLocationRaw] = useState(null)
  const [selectedSession, setSelectedSessionRaw] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [sessionData, setSessionData] = useState(null)
  const [viewingStage, setViewingStage] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionSelectorVisible, setSessionSelectorVisible] = useState(false)
  const [sessionOverviewVisible, setSessionOverviewVisible] = useState(false)
  const [votingRound, setVotingRound] = useState(null)
  const [acceptedProposal, setAcceptedProposal] = useState(null)
  const [proposalModalVisible, setProposalModalVisible] = useState(false)
  const [ballotModalVisible, setBallotModalVisible] = useState(false)
  const [ballotVersion, setBallotVersion] = useState(0)
  const ballotCheckedRef = useRef(null)
  const fetchIdRef = useRef(0)
  const vrFetchIdRef = useRef(0)
  const apFetchIdRef = useRef(0)

  // Load persisted selection on mount
  useEffect(() => {
    AsyncStorage.multiGet([LOCATION_KEY, SESSION_KEY])
      .then(([loc, sess]) => {
        if (loc[1]) setSelectedLocationRaw(loc[1])
        if (sess[1]) setSelectedSessionRaw(sess[1])
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  // Auto-resolve session when user logs in with no session selected
  const autoResolvedRef = useRef(false)
  useEffect(() => {
    if (!loaded || !user || selectedSession || autoResolvedRef.current) return
    autoResolvedRef.current = true

    ;(async () => {
      try {
        const locations = await usersApiWrapper.getLocations()
        if (!locations?.length) return

        const sessResults = await Promise.all(
          locations.map(loc => sessionsApiWrapper.getAll(loc.id).catch(() => []))
        )

        const activeSessions = []
        locations.forEach((loc, i) => {
          for (const s of (sessResults[i] || [])) {
            if (s.status === 'active') {
              activeSessions.push({ locationId: loc.id, sessionId: s.id })
            }
          }
        })

        if (activeSessions.length === 1) {
          setSelectedLocation(activeSessions[0].locationId)
          setSelectedSession(activeSessions[0].sessionId)
        } else if (activeSessions.length > 1) {
          openSessionSelector()
        }
      } catch (err) {
        console.error('Auto-resolve session failed:', err)
      }
    })()
  }, [loaded, user, selectedSession])

  const setSelectedLocation = useCallback((id) => {
    setSelectedLocationRaw(id)
    if (id) {
      AsyncStorage.setItem(LOCATION_KEY, id).catch(() => {})
    } else {
      AsyncStorage.removeItem(LOCATION_KEY).catch(() => {})
    }
  }, [])

  const setSelectedSession = useCallback((id) => {
    setSelectedSessionRaw(id)
    setViewingStage(null)
    if (id) {
      AsyncStorage.setItem(SESSION_KEY, id).catch(() => {})
    } else {
      AsyncStorage.removeItem(SESSION_KEY).catch(() => {})
    }
  }, [])

  // Fetch session details when selectedSession changes (only when authenticated)
  useEffect(() => {
    if (!selectedSession || !user) {
      setSessionData(null)
      setSessionLoading(false)
      return
    }
    const id = ++fetchIdRef.current
    setSessionLoading(true)
    sessionsApiWrapper.get(selectedSession)
      .then((data) => {
        if (fetchIdRef.current === id) {
          setSessionData(data)
        }
      })
      .catch(() => {
        if (fetchIdRef.current === id) {
          setSessionData(null)
        }
      })
      .finally(() => {
        if (fetchIdRef.current === id) {
          setSessionLoading(false)
        }
      })
  }, [selectedSession, user])

  // Derive roundType from effective stage
  const roundType = useMemo(() => {
    const stage = viewingStage || sessionData?.stage
    return stage ? STAGE_TO_ROUND_TYPE[stage] || null : null
  }, [viewingStage, sessionData?.stage])

  // Fetch voting round for any session that has reached proposal stages or beyond
  useEffect(() => {
    const stage = viewingStage || sessionData?.stage
    if (!selectedSession || !user || !stage) {
      setVotingRound(null)
      return
    }
    if (!VOTING_ROUND_STAGES.has(stage)) {
      setVotingRound(null)
      return
    }
    const id = ++vrFetchIdRef.current
    const rt = STAGE_TO_ROUND_TYPE[stage] || undefined
    sessionsApiWrapper.getVotingRound(selectedSession, { roundType: rt })
      .then((data) => {
        if (vrFetchIdRef.current === id) setVotingRound(data)
      })
      .catch(() => {
        if (vrFetchIdRef.current === id) setVotingRound(null)
      })
  }, [selectedSession, user, sessionData?.stage, viewingStage])

  // Fetch accepted (finalized) proposal for sessions past proposal phase
  useEffect(() => {
    if (!selectedSession || !selectedLocation || !user || !sessionData?.stage) {
      setAcceptedProposal(null)
      return
    }
    if (!POST_PROPOSAL_STAGES.has(sessionData.stage)) {
      setAcceptedProposal(null)
      return
    }
    const id = ++apFetchIdRef.current
    postsApiWrapper.getPosts(selectedLocation, {
      sessionId: selectedSession,
      postType: 'proposal',
      proposalStatus: 'finalized',
      limit: 1,
      sort: 'top',
    })
      .then((data) => {
        if (apFetchIdRef.current === id) {
          setAcceptedProposal(data?.posts?.[0] || null)
        }
      })
      .catch(() => {
        if (apFetchIdRef.current === id) setAcceptedProposal(null)
      })
  }, [selectedSession, selectedLocation, user, sessionData?.stage])

  const openBallotModal = useCallback(() => setBallotModalVisible(true), [])
  const closeBallotModal = useCallback(() => setBallotModalVisible(false), [])
  const bumpBallotVersion = useCallback(() => setBallotVersion(v => v + 1), [])

  const openProposalModal = useCallback(() => setProposalModalVisible(true), [])
  const closeProposalModal = useCallback(() => setProposalModalVisible(false), [])

  const refreshSessionData = useCallback((options = {}) => {
    if (!selectedSession) return
    const id = ++fetchIdRef.current
    if (!options.silent) setSessionLoading(true)
    sessionsApiWrapper.get(selectedSession)
      .then((data) => {
        if (fetchIdRef.current === id) {
          setSessionData(data)
        }
      })
      .catch(() => {
        if (fetchIdRef.current === id) {
          setSessionData(null)
        }
      })
      .finally(() => {
        if (fetchIdRef.current === id) {
          setSessionLoading(false)
        }
      })
  }, [selectedSession])

  // Derived stage values
  const currentStage = useMemo(() => sessionData?.stage || null, [sessionData])
  const effectiveStage = useMemo(() => viewingStage || currentStage, [viewingStage, currentStage])
  const isReadOnly = useMemo(
    () => viewingStage != null || currentStage === 'consensus' || (sessionData?.status && sessionData.status !== 'active'),
    [viewingStage, currentStage, sessionData?.status]
  )
  const canCreateProposals = useMemo(
    () => sessionData?.proposalMethod !== 'direct_proposal'
      && (currentStage === 'proposal_qualify' || currentStage === 'reflection_proposals')
      && !viewingStage
      && !['proposals_closed', 'voting_open', 'voting_closed'].includes(votingRound?.status),
    [currentStage, viewingStage, sessionData?.proposalMethod, votingRound?.status]
  )

  // Auto-open ballot modal when entering a voting_open stage without an existing ballot
  useEffect(() => {
    if (!selectedSession || !user || isReadOnly) {
      setBallotModalVisible(false)
      ballotCheckedRef.current = null
      return
    }
    if (votingRound?.status !== 'voting_open') {
      setBallotModalVisible(false)
      ballotCheckedRef.current = null
      return
    }
    const key = `${selectedSession}:${roundType}`
    if (ballotCheckedRef.current === key) return
    ballotCheckedRef.current = key

    const rt = roundType || undefined
    sessionsApiWrapper.getBallot(selectedSession, { roundType: rt })
      .then(data => {
        if (!data?.rankings?.length) {
          setBallotModalVisible(true)
        }
      })
      .catch(() => {
        setBallotModalVisible(true)
      })
  }, [selectedSession, user, isReadOnly, votingRound?.status, roundType])

  const openSessionSelector = useCallback(() => setSessionSelectorVisible(true), [])
  const closeSessionSelector = useCallback(() => setSessionSelectorVisible(false), [])
  const openSessionOverview = useCallback(() => setSessionOverviewVisible(true), [])
  const closeSessionOverview = useCallback(() => setSessionOverviewVisible(false), [])

  const value = useMemo(() => ({
    selectedLocation,
    selectedSession,
    setSelectedLocation,
    setSelectedSession,
    loaded,
    sessionData,
    sessionLoading,
    viewingStage,
    setViewingStage,
    refreshSessionData,
    currentStage,
    effectiveStage,
    isReadOnly,
    canCreateProposals,
    sessionSelectorVisible,
    openSessionSelector,
    closeSessionSelector,
    sessionOverviewVisible,
    openSessionOverview,
    closeSessionOverview,
    votingRound,
    roundType,
    acceptedProposal,
    proposalModalVisible,
    openProposalModal,
    closeProposalModal,
    ballotModalVisible,
    openBallotModal,
    closeBallotModal,
    ballotVersion,
    bumpBallotVersion,
  }), [
    selectedLocation, selectedSession, setSelectedLocation, setSelectedSession, loaded,
    sessionData, sessionLoading, viewingStage, setViewingStage, refreshSessionData,
    currentStage, effectiveStage, isReadOnly, canCreateProposals,
    sessionSelectorVisible, openSessionSelector, closeSessionSelector,
    sessionOverviewVisible, openSessionOverview, closeSessionOverview,
    votingRound, roundType,
    acceptedProposal, proposalModalVisible, openProposalModal, closeProposalModal,
    ballotModalVisible, openBallotModal, closeBallotModal, ballotVersion, bumpBallotVersion,
  ])

  return (
    <LocationSessionContext.Provider value={value}>
      {children}
    </LocationSessionContext.Provider>
  )
}

export function useLocationSession() {
  const ctx = useContext(LocationSessionContext)
  if (!ctx) {
    throw new Error('useLocationSession must be used within a LocationSessionProvider')
  }
  return ctx
}
