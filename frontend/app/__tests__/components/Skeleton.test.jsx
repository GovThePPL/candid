import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'

const mockLightColors = require('../../constants/Colors').LightTheme
const mockDarkColors = require('../../constants/Colors').DarkTheme

let mockCurrentColors = mockLightColors
jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => mockCurrentColors,
}))

import { SkeletonPulse, SkeletonBox, SkeletonCircle, SkeletonLine } from '../../components/Skeleton'

beforeEach(() => {
  mockCurrentColors = mockLightColors
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() })
})

describe('SkeletonPulse', () => {
  it('renders children', () => {
    const { getByTestId } = render(
      <SkeletonPulse>
        <SkeletonBox width={100} height={20} style={{ testID: 'child' }} />
      </SkeletonPulse>,
    )
    expect(getByTestId).toBeDefined()
  })

  it('has loadingSkeleton accessibility label', () => {
    render(<SkeletonPulse><SkeletonBox width={50} height={10} /></SkeletonPulse>)
    expect(screen.getByLabelText('common:loadingSkeleton')).toBeTruthy()
  })

  it('subscribes to reduce motion changes', () => {
    render(<SkeletonPulse><SkeletonBox width={50} height={10} /></SkeletonPulse>)
    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
      'reduceMotionChanged',
      expect.any(Function),
    )
  })
})

describe('SkeletonBox', () => {
  it('renders with correct dimensions', () => {
    const { toJSON } = render(<SkeletonBox width={100} height={20} borderRadius={4} />)
    const node = toJSON()
    expect(node.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 100, height: 20, borderRadius: 4 }),
      ]),
    )
  })

  it('uses light theme border color by default', () => {
    const { toJSON } = render(<SkeletonBox width={50} height={10} />)
    const node = toJSON()
    expect(node.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: mockLightColors.border }),
      ]),
    )
  })

  it('uses dark theme border color', () => {
    mockCurrentColors = mockDarkColors
    const { toJSON } = render(<SkeletonBox width={50} height={10} />)
    const node = toJSON()
    expect(node.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: mockDarkColors.border }),
      ]),
    )
  })
})

describe('SkeletonCircle', () => {
  it('renders as a circle with correct size', () => {
    const { toJSON } = render(<SkeletonCircle size={40} />)
    const node = toJSON()
    expect(node.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 40, height: 40, borderRadius: 20 }),
      ]),
    )
  })

  it('defaults to size 40', () => {
    const { toJSON } = render(<SkeletonCircle />)
    const node = toJSON()
    expect(node.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 40, height: 40 }),
      ]),
    )
  })
})

describe('SkeletonLine', () => {
  it('renders with default height and borderRadius', () => {
    const { toJSON } = render(<SkeletonLine />)
    const node = toJSON()
    expect(node.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ height: 12, borderRadius: 6, width: '100%' }),
      ]),
    )
  })

  it('accepts custom width and height', () => {
    const { toJSON } = render(<SkeletonLine width="50%" height={16} />)
    const node = toJSON()
    expect(node.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: '50%', height: 16 }),
      ]),
    )
  })
})
