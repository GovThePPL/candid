import { render, screen, fireEvent } from '@testing-library/react-native'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockColors = {
  primary: '#5C005C',
  text: '#2C3842',
  title: '#5C005C',
  secondaryText: '#666666',
  placeholderText: '#999999',
  pass: '#999999',
  navBackground: '#FFFFFF',
  cardBorder: '#E0E0E0',
  badgeText: '#5C005C',
  buttonDefault: '#FFB8FF',
  buttonSelected: '#5C005C',
  buttonDefaultText: '#2C3842',
  buttonSelectedText: '#FFFFFF',
  badgeBg: '#5C005C18',
  cardBackground: '#FFFFFF',
  background: '#F5F5F5',
  chat: '#9B59B6',
  chattingListBg: '#5C005C20',
  chattingListSelectedBg: '#5C005C',
  errorBannerBg: '#FFEAEA',
  primaryLight: '#FFB8FF',
}

jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', setTheme: jest.fn() }),
}))

jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: {
    moderation: {
      getRules: jest.fn(() => Promise.resolve([])),
      createAppeal: jest.fn(() => Promise.resolve()),
    },
  },
  translateError: (msg) => msg,
}))

jest.mock('../../components/Avatar', () => {
  const { View } = require('react-native')
  return (props) => <View testID="avatar" {...props} />
})

jest.mock('../../components/CardShell', () => {
  const { View } = require('react-native')
  return ({ header, children, footer, ...props }) => (
    <View testID="card-shell" {...props}>
      {header}
      {children}
      {footer}
    </View>
  )
})

jest.mock('../../components/PositionInfoCard', () => {
  const { View, Text } = require('react-native')
  return (props) => (
    <View testID="position-info-card">
      <Text>{props.position?.statement}</Text>
    </View>
  )
})

jest.mock('../../components/KudosMedallion', () => {
  const { View } = require('react-native')
  return (props) => <View testID="kudos-medallion" {...props} />
})

jest.mock('../../components/BottomDrawerModal', () => {
  const { View } = require('react-native')
  return ({ children, visible, ...props }) => (
    visible ? <View testID="bottom-drawer-modal" {...props}>{children}</View> : null
  )
})

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import PositionCard from '../../components/cards/PositionCard'
import SurveyCard from '../../components/cards/SurveyCard'
import DemographicCard from '../../components/cards/DemographicCard'
import PairwiseCard from '../../components/cards/PairwiseCard'
import ChatRequestCard from '../../components/cards/ChatRequestCard'
import KudosCard from '../../components/cards/KudosCard'
import DiagnosticsConsentCard from '../../components/cards/DiagnosticsConsentCard'
import BanNotificationCard from '../../components/cards/BanNotificationCard'
import PositionRemovedCard from '../../components/cards/PositionRemovedCard'

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const position = {
  statement: 'Test statement',
  category: { label: 'Politics' },
  location: { code: 'US' },
  creator: { displayName: 'Jane', username: 'jane' },
}

const survey = {
  surveyId: 1,
  id: 1,
  question: 'Favorite color?',
  options: [
    { id: 'r', option: 'Red' },
    { id: 'b', option: 'Blue' },
  ],
  surveyTitle: 'Preferences',
  category: 'General',
}

const demographic = {
  field: 'age',
  question: 'Your age range?',
  options: [
    { value: '18-25', label: '18-25' },
    { value: '26-35', label: '26-35' },
  ],
}

const pairwise = {
  data: {
    surveyId: 1,
    question: 'Which is better?',
    optionA: { id: 'a1', text: 'Option A' },
    optionB: { id: 'b1', text: 'Option B' },
    surveyTitle: 'Compare',
  },
}

const chatRequest = {
  requester: { displayName: 'Bob', username: 'bob' },
  position: { statement: 'Chat topic' },
}

const kudos = {
  otherParticipant: { displayName: 'Alice', username: 'alice' },
  position: { statement: 'Good chat' },
  userAlreadySentKudos: false,
}

const banData = {
  banType: 'temporary_ban',
  reason: 'violation',
  ruleTitle: 'Be respectful',
  modActionId: 1,
  actionChain: { actionType: 'temporary_ban', durationDays: 7 },
}

const positionRemovedData = {
  statement: 'Removed post',
  category: 'General',
  location: 'US',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PositionCard accessibility', () => {
  jest.useFakeTimers()

  afterAll(() => jest.useRealTimers())

  it('has accessibilityLabel containing the author name and statement', () => {
    render(
      <PositionCard
        position={position}
        onAgree={jest.fn()}
        onDisagree={jest.fn()}
        onPass={jest.fn()}
        onChatRequest={jest.fn()}
        onReport={jest.fn()}
        onAddPosition={jest.fn()}
      />
    )
    const card = screen.getByLabelText(/Jane/)
    expect(card.props.accessibilityLabel).toContain('Jane')
    expect(card.props.accessibilityLabel).toContain('Test statement')
  })

  it('has accessibilityHint for swipe gestures', () => {
    render(
      <PositionCard
        position={position}
        onAgree={jest.fn()}
        onDisagree={jest.fn()}
        onPass={jest.fn()}
        onChatRequest={jest.fn()}
        onReport={jest.fn()}
        onAddPosition={jest.fn()}
      />
    )
    const card = screen.getByLabelText(/Jane/)
    expect(card.props.accessibilityHint).toBeTruthy()
  })
})

describe('SurveyCard accessibility', () => {
  jest.useFakeTimers()

  afterAll(() => jest.useRealTimers())

  it('has accessibilityLabel containing the question', () => {
    render(
      <SurveyCard
        survey={survey}
        onRespond={jest.fn()}
        onSkip={jest.fn()}
      />
    )
    const card = screen.getByLabelText(/Favorite color\?/)
    expect(card.props.accessibilityLabel).toContain('Favorite color?')
  })

  it('option buttons are queryable as radio role', () => {
    render(
      <SurveyCard
        survey={survey}
        onRespond={jest.fn()}
        onSkip={jest.fn()}
      />
    )
    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBe(2)
  })

  it('selected option is checked', () => {
    render(
      <SurveyCard
        survey={survey}
        onRespond={jest.fn()}
        onSkip={jest.fn()}
      />
    )
    const radios = screen.getAllByRole('radio')
    // Initially none are checked
    expect(radios[0].props.accessibilityState.checked).toBe(false)

    // Select the first option
    fireEvent.press(radios[0])
    const updatedRadios = screen.getAllByRole('radio')
    expect(updatedRadios[0].props.accessibilityState.checked).toBe(true)
    expect(updatedRadios[1].props.accessibilityState.checked).toBe(false)
  })
})

describe('DemographicCard accessibility', () => {
  jest.useFakeTimers()

  afterAll(() => jest.useRealTimers())

  it('has accessibilityLabel containing the question', () => {
    render(
      <DemographicCard
        demographic={demographic}
        onRespond={jest.fn()}
        onSkip={jest.fn()}
      />
    )
    const card = screen.getByLabelText(/Your age range\?/)
    expect(card.props.accessibilityLabel).toContain('Your age range?')
  })

  it('option buttons are queryable as radio role', () => {
    render(
      <DemographicCard
        demographic={demographic}
        onRespond={jest.fn()}
        onSkip={jest.fn()}
      />
    )
    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBe(2)
  })
})

describe('PairwiseCard accessibility', () => {
  jest.useFakeTimers()

  afterAll(() => jest.useRealTimers())

  it('has accessibilityLabel containing the question', () => {
    render(
      <PairwiseCard
        pairwise={pairwise}
        onRespond={jest.fn()}
        onSkip={jest.fn()}
      />
    )
    const card = screen.getByLabelText(/Which is better\?/)
    expect(card.props.accessibilityLabel).toContain('Which is better?')
  })

  it('two options are queryable as radio role', () => {
    render(
      <PairwiseCard
        pairwise={pairwise}
        onRespond={jest.fn()}
        onSkip={jest.fn()}
      />
    )
    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBe(2)
  })
})

describe('ChatRequestCard accessibility', () => {
  jest.useFakeTimers()

  afterAll(() => jest.useRealTimers())

  it('has accessibilityLabel containing requester name', () => {
    render(
      <ChatRequestCard
        chatRequest={chatRequest}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
      />
    )
    const card = screen.getByLabelText(/Bob/)
    expect(card.props.accessibilityLabel).toContain('Bob')
  })
})

describe('KudosCard accessibility', () => {
  jest.useFakeTimers()

  afterAll(() => jest.useRealTimers())

  it('has accessibilityLabel containing the other participant name', () => {
    render(
      <KudosCard
        kudos={kudos}
        onSendKudos={jest.fn()}
        onAcknowledge={jest.fn()}
        onDismiss={jest.fn()}
      />
    )
    const card = screen.getByLabelText(/Alice/)
    expect(card.props.accessibilityLabel).toContain('Alice')
  })
})

describe('DiagnosticsConsentCard accessibility', () => {
  jest.useFakeTimers()

  afterAll(() => jest.useRealTimers())

  it('has accessibilityLabel for diagnostics consent', () => {
    render(
      <DiagnosticsConsentCard
        onAccept={jest.fn()}
        onDecline={jest.fn()}
      />
    )
    const card = screen.getByLabelText(/diagnosticsA11yLabel/)
    expect(card).toBeTruthy()
  })
})

describe('BanNotificationCard accessibility', () => {
  it('Appeal button is queryable by role and name', () => {
    render(<BanNotificationCard banData={banData} />)
    const appealButton = screen.getByRole('button', { name: /appeal/i })
    expect(appealButton).toBeTruthy()
  })

  it('Action Details button is queryable', () => {
    render(<BanNotificationCard banData={banData} />)
    const detailsButton = screen.getByRole('button', { name: /banActionDetails/i })
    expect(detailsButton).toBeTruthy()
  })

  it('warning icon is hidden from accessibility', () => {
    render(<BanNotificationCard banData={banData} />)
    // The warning icon has accessible={false} and importantForAccessibility="no-hide-descendants"
    // so it should NOT be findable by its text content via accessibility queries.
    // We verify that the "Appeal" button is present (card renders) but querying
    // for the icon text "warning" as an accessibility element finds nothing.
    const appealButton = screen.getByRole('button', { name: /appeal/i })
    expect(appealButton).toBeTruthy()
    const hiddenIcons = screen.queryAllByLabelText('warning')
    expect(hiddenIcons.length).toBe(0)
  })
})

describe('PositionRemovedCard accessibility', () => {
  it('Dismiss button is queryable by role and name', () => {
    render(<PositionRemovedCard data={positionRemovedData} onDismiss={jest.fn()} />)
    const dismissButton = screen.getByRole('button', { name: /dismiss/i })
    expect(dismissButton).toBeTruthy()
  })

  it('remove icon is hidden from accessibility', () => {
    render(<PositionRemovedCard data={positionRemovedData} onDismiss={jest.fn()} />)
    // The remove-circle icon container has accessible={false} and
    // importantForAccessibility="no-hide-descendants", so it should not
    // expose any accessibility labels for the icon.
    const dismissButton = screen.getByRole('button', { name: /dismiss/i })
    expect(dismissButton).toBeTruthy()
    const hiddenIcons = screen.queryAllByLabelText('remove-circle')
    expect(hiddenIcons.length).toBe(0)
  })
})
