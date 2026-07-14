const config = {
  botName: process.env.BOT_NAME || 'ZEUS-MD',
  ownerNumber: process.env.OWNER_NUMBER || '2349066760078',
  ownerName: process.env.OWNER_NAME || 'ZEUS',
  premiumCode: process.env.PREMIUM_CODE || '200709',
  chatbotName: process.env.CHATBOT_NAME || 'ZARA',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  prefix: '.',

  premiumFeatures: [
    '🤖 AI Chatbot (powered by Groq LLama 3.3)',
    '🚫 Anti-link protection',
    '🎨 Custom sticker maker',
    '📥 All downloaders (YT, IG, TikTok)',
    '📊 XP & Level system',
    '🛡️ Group anti-features',
    '⚡ Faster command processing',
    '🔓 Unlimited command usage per day',
    '👑 Priority support from owner',
    '🎁 Exclusive premium group access',
  ],

  freeFeatures: [
    '📝 Basic commands (menu, info)',
    '👋 Welcome messages',
    '🔍 Search tools',
    '🎭 Fun commands',
    '📢 Broadcast (group only)',
    '📊 Group stats',
  ],
};

export default config;
