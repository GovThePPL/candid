import { useTranslation } from 'react-i18next'
import { useThemeColors } from '../hooks/useThemeColors'
import { SemanticColors } from '../constants/Colors'
import InfoModal from './InfoModal'

export default function AdoptPositionExplanationModal({ visible, onClose }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <InfoModal
      visible={visible}
      onClose={onClose}
      icon="add-circle"
      iconColor={SemanticColors.agree}
      title={t('adoptedTitle')}
      paragraphs={[
        t('adoptedParagraph1'),
        t('adoptedParagraph2'),
      ]}
      items={[
        { icon: 'chatbubble', iconColor: colors.chat, text: t('adoptedItem1') },
        { icon: 'stats-chart', iconColor: colors.primary, text: t('adoptedItem2') },
      ]}
    />
  )
}
