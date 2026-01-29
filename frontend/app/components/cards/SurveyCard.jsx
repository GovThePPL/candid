import { StyleSheet, View, Text, TouchableOpacity } from 'react-native'
import { useState } from 'react'
import { Colors } from '../../constants/Colors'

export default function SurveyCard({
  survey,
  question,
  onRespond,
}) {
  const [selectedOption, setSelectedOption] = useState(null)

  const handleOptionPress = (option) => {
    setSelectedOption(option.id)
    if (onRespond) {
      onRespond(survey.id, question.id, option.id)
    }
  }

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        {survey?.location && (
          <Text style={styles.locationCode}>{survey.location.code}</Text>
        )}
        <Text style={styles.categoryName}>{survey?.category || 'General'}</Text>
      </View>

      {/* Question */}
      <View style={styles.questionContainer}>
        <Text style={styles.question}>{question?.text}</Text>
      </View>

      {/* Options */}
      <View style={styles.optionsContainer}>
        {question?.options?.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={[
              styles.option,
              selectedOption === option.id && styles.optionSelected,
            ]}
            onPress={() => handleOptionPress(option)}
          >
            <Text
              style={[
                styles.optionText,
                selectedOption === option.id && styles.optionTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Survey</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 20,
  },
  locationCode: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  categoryName: {
    fontSize: 14,
    color: Colors.primary,
  },
  questionContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  question: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    lineHeight: 28,
  },
  optionsContainer: {
    paddingHorizontal: 16,
    gap: 12,
  },
  option: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  optionSelected: {
    backgroundColor: Colors.primary,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  optionTextSelected: {
    color: '#fff',
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 24,
    paddingTop: 40,
  },
  footerText: {
    fontSize: 18,
    fontStyle: 'italic',
    color: Colors.pass,
  },
})
