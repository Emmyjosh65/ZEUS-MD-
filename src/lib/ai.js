import config from '../../config.js';

const chatHistory = {};
const MAX_HISTORY = 10;
const TIMEOUT_MS = 20000;

export async function getChatbotReply(message, senderNumber) {
  if (!config.groqApiKey) return '⚠️ Groq API key not configured. Contact the owner.';

  if (!chatHistory[senderNumber]) {
    chatHistory[senderNumber] = [{
      role: 'system',
      content: `You are ${config.chatbotName}, a helpful AI assistant for the WhatsApp bot ${config.botName}, powered by Groq's ${config.groqModel}. Be concise and friendly. Keep responses under 300 characters. Bot owner: ${config.ownerName}.`,
    }];
  }
  if (chatHistory[senderNumber].length > MAX_HISTORY) {
    chatHistory[senderNumber] = [
      chatHistory[senderNumber][0],
      ...chatHistory[senderNumber].slice(-(MAX_HISTORY - 2)),
    ];
  }
  chatHistory[senderNumber].push({ role: 'user', content: String(message).slice(0, 2000) });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.groqModel,
        messages: chatHistory[senderNumber],
        max_tokens: 300,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('⚠️ Groq API error:', response.status);
      if (response.status === 429) return '⏳ Too many requests. Try again in a moment!';
      if (response.status === 401) return '⚠️ AI authentication error. Contact the owner.';
      return '🤖 I\'m having trouble right now. Give me a moment and try again!';
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) return '🤖 I\'m not sure what to say to that. Could you ask me something else?';

    chatHistory[senderNumber].push({ role: 'assistant', content: reply });
    return reply;
  } catch (err) {
    console.error('⚠️ Groq fetch error:', err.name === 'AbortError' ? 'timeout' : err.message);
    return '🤖 Sorry, connection issue. Please try again!';
  } finally {
    clearTimeout(timer);
  }
}
