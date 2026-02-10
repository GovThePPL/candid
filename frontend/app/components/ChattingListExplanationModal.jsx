import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import InfoModal from './InfoModal'

export default function ChattingListExplanationModal({ visible, onClose }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <InfoModal
      visible={visible}
      onClose={onClose}
      icon="chatbubbles"
      iconColor={colors.chat}
      title={t('chattingListTitle')}
      paragraphs={[
        t('chattingListParagraph1'),
        t('chattingListParagraph2'),
      ]}
      items={[
        { icon: 'chatbubbles', iconColor: colors.chat, text: t('chattingListItem1') },
        { icon: 'close-circle-outline', iconColor: colors.pass, text: t('chattingListItem2') },
      ]}
    />
  )
}
