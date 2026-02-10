import { useThemeColors } from '../hooks/useThemeColors'
import InfoModal from './InfoModal'

export default function ChattingListExplanationModal({ visible, onClose }) {
  const colors = useThemeColors()

  return (
    <InfoModal
      visible={visible}
      onClose={onClose}
      icon="chatbubbles"
      iconColor={colors.chat}
      title="Added to Chatting List"
      paragraphs={[
        'This position has been saved to your Chatting List. It will reappear in your card queue periodically.',
        'Use this to save positions you\'ve chatted about or topics you want to discuss again with different people.',
      ]}
      items={[
        { icon: 'chatbubbles', iconColor: colors.chat, text: 'Look for this icon in the card queue to identify positions from your Chatting List' },
        { icon: 'close-circle-outline', iconColor: colors.pass, text: 'Tap this button on a card to remove a position from your Chatting List' },
      ]}
    />
  )
}
