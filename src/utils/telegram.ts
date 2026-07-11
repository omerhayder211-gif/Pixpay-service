import { config } from '../config';
import { logger } from './logger';

/**
 * Sends a HTML-formatted Telegram notification to the configured chat.
 * This is non-blocking to the main application lifecycle.
 */
export async function sendTelegramNotification(message: string): Promise<boolean> {
  const token = config.telegramBotToken;
  const chatId = config.telegramChatId;

  if (!token || !chatId) {
    logger.warn('[Telegram] Notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured.');
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML'
  };

  logger.info('[Telegram] Attempting to send Telegram notification...');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      logger.info('[Telegram] Telegram notification sent successfully.');
      return true;
    }

    const errText = await response.text();
    logger.error(`[Telegram] Telegram API failed with status ${response.status}: ${errText}`);
    return false;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.error('[Telegram] Telegram notification failed: Request timed out after 10 seconds.');
    } else {
      logger.error(`[Telegram] Network error sending Telegram notification: ${err.message}`);
    }
    return false;
  }
}
