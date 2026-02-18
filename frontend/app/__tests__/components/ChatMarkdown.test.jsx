import React from 'react'
import { render, screen } from '@testing-library/react-native'

jest.mock('react-native-markdown-display', () => {
  const { Text } = require('react-native')
  return function Markdown({ children }) {
    return <Text>{children}</Text>
  }
})

import ChatMarkdown from '../../components/ChatMarkdown'

describe('ChatMarkdown', () => {
  it('renders plain text content', () => {
    render(<ChatMarkdown content="Hello world" />)
    expect(screen.getByText('Hello world')).toBeTruthy()
  })

  it('renders markdown content', () => {
    render(<ChatMarkdown content="**bold** and *italic*" />)
    expect(screen.getByText('**bold** and *italic*')).toBeTruthy()
  })

  it('returns null for empty content', () => {
    const { toJSON } = render(<ChatMarkdown content="" />)
    expect(toJSON()).toBeNull()
  })

  it('returns null for null content', () => {
    const { toJSON } = render(<ChatMarkdown content={null} />)
    expect(toJSON()).toBeNull()
  })

  it('returns null for undefined content', () => {
    const { toJSON } = render(<ChatMarkdown />)
    expect(toJSON()).toBeNull()
  })
})
