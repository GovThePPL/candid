import { Colors } from '../constants/Colors'
import InfoModal from './InfoModal'

export default function AdoptPositionExplanationModal({ visible, onClose }) {
  return (
    <InfoModal
      visible={visible}
      onClose={onClose}
      icon="add-circle"
      iconColor={Colors.agree}
      title="Position Adopted!"
      paragraphs={[
        'You\'ve adopted this position as your own. It will now appear in your "My Positions" list.',
        'Other users who want to discuss this topic may send you chat requests.',
      ]}
      items={[
        { icon: 'chatbubble', iconColor: Colors.chat, text: 'You\'ll receive notifications when someone wants to chat about this position' },
        { icon: 'stats-chart', iconColor: Colors.primary, text: 'Track responses and engagement on your positions in the Stats tab' },
      ]}
    />
  )
}
