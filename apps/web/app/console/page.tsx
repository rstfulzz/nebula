'use client'

import { Chat } from '@/components/console/Chat'

// Full-height chat console (claude.ai / chatgpt style): no page chrome, the
// message area scrolls and the input is pinned. Sits below the fixed
// ConsoleNavbar (~76px) and fills the rest of the viewport.
export default function ConsoleHome() {
  return (
    <div className="fixed inset-x-0 bottom-0 top-[76px]">
      <Chat />
    </div>
  )
}
