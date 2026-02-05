import { Colors } from '../constants/Colors'
import InfoModal from './InfoModal'

export default function ChattingListExplanationModal({ visible, onClose }) {
  return (
    <InfoModal
      visible={visible}
      onClose={onClose}
      icon="chatbubbles"
      iconColor={Colors.chat}
      title="Added to Chatting List"
      paragraphs={[
        'This position has been saved to your Chatting List. It will reappear in your card queue periodically.',
        'Use this to save positions you\'ve chatted about or topics you want to discuss again with different people.',
      ]}
      items={[
        { icon: 'chatbubbles', iconColor: Colors.chat, text: 'Look for this icon in the card queue to identify positions from your Chatting List' },
        { icon: 'close-circle-outline', iconColor: Colors.pass, text: 'Tap this button on a card to remove a position from your Chatting List' },
      ]}
    />
  )
}
