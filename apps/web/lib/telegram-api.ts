// Thin Telegram Bot API client. Token lives in NEBULA_TG_BOT_TOKEN (VPS env only).
import 'server-only'

const api = (method: string) => `https://api.telegram.org/bot${process.env.NEBULA_TG_BOT_TOKEN}/${method}`

export function tgConfigured(): boolean {
  return !!process.env.NEBULA_TG_BOT_TOKEN
}

export async function tgSend(chatId: number, text: string, replyMarkup?: unknown): Promise<void> {
  await fetch(api('sendMessage'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  }).catch(() => {})
}

export async function tgAnswerCallback(callbackId: string, text?: string): Promise<void> {
  await fetch(api('answerCallbackQuery'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, ...(text ? { text } : {}) }),
  }).catch(() => {})
}

/** Two-button approve / cancel inline keyboard for material-risk actions. */
export const approvalKeyboard = {
  inline_keyboard: [
    [
      { text: '✅ Approve', callback_data: 'approve' },
      { text: '✖️ Cancel', callback_data: 'cancel' },
    ],
  ],
}
