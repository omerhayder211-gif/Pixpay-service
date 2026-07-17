const fs = require('fs');
const path = require('path');

// Safe dotenv loader
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error(`ERROR: .env file not found at ${envPath}`);
    return {};
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let key = match[1];
      let value = match[2] || '';
      // Remove quotes if present
      if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
        value = value.substring(1, value.length - 1);
      } else if (value.length > 0 && value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") {
        value = value.substring(1, value.length - 1);
      }
      env[key] = value.trim();
    }
  });
  return env;
}

async function runTest() {
  console.log('--- Telegram Configuration Test ---');
  const env = loadEnv();
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  const serverName = env.SERVER_NAME || 'PixPay VPS';

  if (!token || !chatId) {
    console.error('ERROR: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured in .env file!');
    process.exit(1);
  }

  // Mask the token for safety: show first 6 and last 4 chars
  const maskedToken = token.length > 10 
    ? `${token.substring(0, 6)}...${token.substring(token.length - 4)}` 
    : '***';

  console.log(`Server Name: ${serverName}`);
  console.log(`Bot Token:   ${maskedToken}`);
  console.log(`Chat ID:     ${chatId}`);
  console.log('Sending test message to Telegram...');

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' EST';
  
  const testMessage = 
    `🧪 <b>PixPay Telegram Connection Test</b>\n\n` +
    `<b>Server:</b> ${serverName}\n` +
    `<b>Status:</b> Connection Successful\n` +
    `<b>Timestamp:</b> ${timestamp}\n\n` +
    `<i>If you receive this, your Telegram configuration is working properly on the VPS.</i>`;

  const body = {
    chat_id: chatId,
    text: testMessage,
    parse_mode: 'HTML'
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (response.ok) {
      console.log('SUCCESS: Telegram test message sent and delivered successfully!');
    } else {
      const errText = await response.text();
      console.error(`FAILED: Telegram API failed with status ${response.status}: ${errText}`);
    }
  } catch (err) {
    console.error('FAILED: Network error sending Telegram notification:', err.message);
  }
}

runTest().catch((err) => {
  console.error('Unhandled error during test run:', err);
});
