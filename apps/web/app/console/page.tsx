'use client'

import { ChatConsole } from '@/components/console/ChatConsole'

// Full-height chat console (claude.ai / chatgpt style): a per-wallet history
// sidebar + the chat. No page chrome; sits below the fixed ConsoleNavbar (~76px)
// and fills the rest of the viewport.
export default function ConsoleHome() {
  return (
    <div className="fixed inset-x-0 bottom-0 top-[76px]">
      <ChatConsole />
    </div>
  )
}
