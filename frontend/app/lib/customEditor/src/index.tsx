import { createRoot } from 'react-dom/client'
import Tiptap from './Tiptap'

// Wait for native side to inject content before rendering
const interval = setInterval(() => {
  if (!(window as any).contentInjected) return
  createRoot(document.getElementById('root')!).render(<Tiptap />)
  clearInterval(interval)
}, 1)
