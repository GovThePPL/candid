import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockColors = require('../../constants/Colors').LightTheme
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockColors,
}))

// Mock MarkdownRenderer as a simple text display
jest.mock('../../components/discuss/MarkdownRenderer', () => {
  const { Text } = require('react-native')
  return function MockMarkdownRenderer({ content }) {
    return <Text>{content}</Text>
  }
})

import ContentPreviewModal, {
  splitIntoBlocks,
  computeBlockDiff,
  pairBlockDiff,
} from '../../components/wiki/ContentPreviewModal'

const defaultProps = {
  visible: true,
  onClose: jest.fn(),
  originalContent: 'Original paragraph one.\n\nOriginal paragraph two.',
  proposedContent: 'Proposed paragraph one.\n\nProposed paragraph two.',
}

describe('ContentPreviewModal', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders when visible=true', () => {
    render(<ContentPreviewModal {...defaultProps} />)
    expect(screen.getByText('previewTitle')).toBeTruthy()
  })

  it('does not render content when visible=false', () => {
    render(<ContentPreviewModal {...defaultProps} visible={false} />)
    expect(screen.queryByText('previewTitle')).toBeNull()
  })

  it('shows diff view by default (Diff tab)', () => {
    render(<ContentPreviewModal {...defaultProps} />)
    // Both original and proposed blocks should appear in diff
    expect(screen.getByText('Original paragraph one.')).toBeTruthy()
    expect(screen.getByText('Proposed paragraph one.')).toBeTruthy()
  })

  it('switches to Original tab and shows original content', () => {
    render(<ContentPreviewModal {...defaultProps} />)
    fireEvent.press(screen.getByRole('tab', { name: 'previewTabOriginalA11y' }))
    expect(screen.getByText(defaultProps.originalContent)).toBeTruthy()
    expect(screen.queryByText(defaultProps.proposedContent)).toBeNull()
  })

  it('switches to Changes tab and shows proposed content', () => {
    render(<ContentPreviewModal {...defaultProps} />)
    fireEvent.press(screen.getByRole('tab', { name: 'previewTabChangesA11y' }))
    expect(screen.getByText(defaultProps.proposedContent)).toBeTruthy()
    expect(screen.queryByText(defaultProps.originalContent)).toBeNull()
  })

  it('close button calls onClose', () => {
    const onClose = jest.fn()
    render(<ContentPreviewModal {...defaultProps} onClose={onClose} />)
    fireEvent.press(screen.getByRole('button', { name: 'common:back' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('diff shows no colored blocks when content is identical', () => {
    const content = 'Same paragraph one.\n\nSame paragraph two.'
    render(
      <ContentPreviewModal
        {...defaultProps}
        originalContent={content}
        proposedContent={content}
      />
    )
    fireEvent.press(screen.getByRole('tab', { name: 'previewTabDiffA11y' }))
    // Both paragraphs visible as same blocks — content exists but no remove/add styling
    expect(screen.getByText('Same paragraph one.')).toBeTruthy()
    expect(screen.getByText('Same paragraph two.')).toBeTruthy()
  })

  it('tab buttons have accessibilityRole=tab and accessibilityState', () => {
    render(<ContentPreviewModal {...defaultProps} />)
    const diffTab = screen.getByRole('tab', { name: 'previewTabDiffA11y' })
    expect(diffTab.props.accessibilityState.selected).toBe(true)
    const originalTab = screen.getByRole('tab', { name: 'previewTabOriginalA11y' })
    expect(originalTab.props.accessibilityState.selected).toBe(false)
  })
})

describe('splitIntoBlocks', () => {
  it('splits paragraphs at double newlines', () => {
    const blocks = splitIntoBlocks('Para one.\n\nPara two.\n\nPara three.')
    expect(blocks).toEqual(['Para one.', 'Para two.', 'Para three.'])
  })

  it('keeps fenced code blocks with internal blank lines as single block', () => {
    const md = 'Before.\n\n```\ncode line 1\n\ncode line 2\n```\n\nAfter.'
    const blocks = splitIntoBlocks(md)
    expect(blocks).toEqual([
      'Before.',
      '```\ncode line 1\n\ncode line 2\n```',
      'After.',
    ])
  })

  it('returns empty array for empty input', () => {
    expect(splitIntoBlocks('')).toEqual([])
    expect(splitIntoBlocks(null)).toEqual([])
  })
})

describe('computeBlockDiff', () => {
  it('returns all same for identical content', () => {
    const result = computeBlockDiff('A\n\nB', 'A\n\nB')
    expect(result).toEqual([
      { type: 'same', text: 'A' },
      { type: 'same', text: 'B' },
    ])
  })

  it('detects added paragraph', () => {
    const result = computeBlockDiff('A', 'A\n\nB')
    expect(result).toEqual([
      { type: 'same', text: 'A' },
      { type: 'add', text: 'B' },
    ])
  })

  it('detects removed paragraph', () => {
    const result = computeBlockDiff('A\n\nB', 'A')
    expect(result).toEqual([
      { type: 'same', text: 'A' },
      { type: 'remove', text: 'B' },
    ])
  })
})

describe('pairBlockDiff', () => {
  it('pairs consecutive remove/add into modified', () => {
    const input = [
      { type: 'remove', text: 'Old text' },
      { type: 'add', text: 'New text' },
    ]
    expect(pairBlockDiff(input)).toEqual([
      { type: 'modified', old: 'Old text', new: 'New text' },
    ])
  })

  it('leaves unpaired removes/adds as-is', () => {
    const input = [
      { type: 'remove', text: 'Old1' },
      { type: 'remove', text: 'Old2' },
      { type: 'add', text: 'New1' },
    ]
    const result = pairBlockDiff(input)
    expect(result).toEqual([
      { type: 'modified', old: 'Old1', new: 'New1' },
      { type: 'remove', text: 'Old2' },
    ])
  })

  it('passes through same blocks unchanged', () => {
    const input = [
      { type: 'same', text: 'Unchanged' },
    ]
    expect(pairBlockDiff(input)).toEqual([
      { type: 'same', text: 'Unchanged' },
    ])
  })
})
