import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors } from '../constants/Colors'
import InfoModal from './InfoModal'

export default function AdoptPositionExplanationModal({ visible, onClose }) {
  const colors = useThemeColors()

  return (
    <InfoModal
      visible={visible}
      onClose={onClose}
      icon="add-circle"
      iconColor={SemanticColors.agree}
      title="Position Adopted!"
      paragraphs={[
        'You\'ve adopted this position as your own. It will now appear in your "My Positions" list.',
        'Other users who want to discuss this topic may send you chat requests.',
      ]}
      items={[
        { icon: 'chatbubble', iconColor: colors.chat, text: 'You\'ll receive notifications when someone wants to chat about this position' },
        { icon: 'stats-chart', iconColor: colors.primary, text: 'Track responses and engagement on your positions in the Stats tab' },
      ]}
    />
  )
}
