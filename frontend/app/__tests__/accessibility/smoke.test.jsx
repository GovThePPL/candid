import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Text, View, Pressable, TouchableOpacity } from 'react-native'

test('smoke test - getByRole finds accessible button', () => {
  render(
    <Pressable accessibilityRole="button" accessibilityLabel="Test">
      <Text>Hello</Text>
    </Pressable>
  )
  expect(screen.getByRole('button', { name: 'Test' })).toBeTruthy()
})

test('smoke test - getByLabelText works', () => {
  render(
    <View accessibilityLabel="My view">
      <Text>Content</Text>
    </View>
  )
  expect(screen.getByLabelText('My view')).toBeTruthy()
})

test('smoke test - toBeChecked matcher works', () => {
  render(
    <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: true }} accessibilityLabel="Option A">
      <Text>Option A</Text>
    </TouchableOpacity>
  )
  expect(screen.getByRole('radio')).toBeChecked()
})

test('smoke test - toBeSelected matcher works', () => {
  render(
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: true }} accessibilityLabel="Tab 1">
      <Text>Tab 1</Text>
    </Pressable>
  )
  expect(screen.getByRole('tab', { name: 'Tab 1' })).toBeSelected()
})
