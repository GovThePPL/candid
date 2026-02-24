import React from 'react'
import { Text } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { createMentionTextRule } from '../../lib/mentionMarkdownRule'

jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => require('../../constants/Colors').LightTheme,
}))
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}))

const mentionStyle = { color: '#5C005C', fontWeight: '600' }
const roleStyle = { color: '#5C005C', fontWeight: '700' }

describe('createMentionTextRule', () => {
  it('returns empty object when no onMentionPress', () => {
    const result = createMentionTextRule(null, mentionStyle, roleStyle)
    expect(result).toEqual({})
  })

  it('renders plain text without mentions unchanged', () => {
    const onPress = jest.fn()
    const rules = createMentionTextRule(onPress, mentionStyle, roleStyle)
    const node = { key: 'k1', content: 'Hello world' }
    const styles = { text: {} }
    const { getByText } = render(rules.text(node, [], [], styles))
    expect(getByText('Hello world')).toBeTruthy()
  })

  it('highlights @username mentions', () => {
    const onPress = jest.fn()
    const rules = createMentionTextRule(onPress, mentionStyle, roleStyle)
    const node = { key: 'k2', content: 'Hey @alice check this' }
    const styles = { text: {} }
    const { getByText } = render(rules.text(node, [], [], styles))
    const mention = getByText('@alice')
    expect(mention).toBeTruthy()
    fireEvent.press(mention)
    expect(onPress).toHaveBeenCalledWith('alice')
  })

  it('highlights multiple mentions', () => {
    const onPress = jest.fn()
    const rules = createMentionTextRule(onPress, mentionStyle, roleStyle)
    const node = { key: 'k3', content: '@alice and @bob' }
    const styles = { text: {} }
    const { getByText } = render(rules.text(node, [], [], styles))
    expect(getByText('@alice')).toBeTruthy()
    expect(getByText('@bob')).toBeTruthy()
  })

  it('applies role style to role mentions', () => {
    const onPress = jest.fn()
    const rules = createMentionTextRule(onPress, mentionStyle, roleStyle)
    const node = { key: 'k4', content: '@admin please help' }
    const styles = { text: {} }
    const { getByText } = render(rules.text(node, [], [], styles))
    const mention = getByText('@admin')
    expect(mention).toBeTruthy()
    fireEvent.press(mention)
    expect(onPress).toHaveBeenCalledWith('admin')
  })
})
