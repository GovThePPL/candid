/**
 * Native ModalPortal — thin wrapper around React Native's <Modal>.
 *
 * On native, Modal handles stacking correctly (each opens its own
 * native modal view) and handles the Android back button via onRequestClose.
 */
import { Modal } from 'react-native'

export default function ModalPortal({ visible, onRequestClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onRequestClose}>
      {children}
    </Modal>
  )
}
