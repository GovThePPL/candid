import { StyleSheet } from 'react-native'
import { Shadows } from '../../constants/Theme'
import PositionInfoCard from '../PositionInfoCard'

/**
 * Compact card displaying a position statement with category/location and creator.
 * Used at the top of the closures page.
 *
 * @param {Object} props
 * @param {Object} props.position - Position object with id, statement, category, location, creator
 */
export default function PositionSummaryCard({ position }) {
  return (
    <PositionInfoCard
      position={position}
      style={styles.container}
      statementStyle={styles.statement}
    />
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    ...Shadows.card,
  },
  statement: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
})
