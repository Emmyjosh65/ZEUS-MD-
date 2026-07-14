import config from '../../config.js';

// Stores conversation history for context
const chatHistory = {};

export async function getChatbotReply(message, senderNumber) {
  const apiKey = config.groqApiKey;
  const model = config.groqModel;

  if (!apiKey) {
    return `⚠️ Groq API key not configured. Contact the owner.`;
  }

  // Initialize or get conversation history (last 6 messages for context)
  if (!chatHistory[senderNumber]) {
    chatHistory[senderNumber] = [
      {
        role: 'system',
        content: `You are ${config.chatbotName}, a helpful and friendly AI assistant for the WhatsApp bot ${config.botName}. You are powered by Groq's ${model}. Be concise, friendly, and helpful. Keep responses under 300 characters. The bot owner is ${config.ownerName}. The premium code is ${config.premiumCode}.`,
      },
    ];
  }

  // Keep only last 10 messages to avoid token overflow
  if (chatHistory[senderNumber].length > 10) {
    chatHistory[senderNumber] = [
      chatHistory[senderNumber][0],
      ...chatHistory[senderNumber].slice(-8),
    ];
  }

  // Add user message
  chatHistory[senderNumber].push({ role: 'user', content: message });

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: chatHistory[senderNumber],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('⚠️ Groq API error:', response.status, errorData);
      
      if (response.status === 429) {
        return `⏳ I'm a bit busy right now with too many requests. Try again in a moment!`;
      }
      if (response.status === 401) {
        return `⚠️ AI service authentication error. Contact the owner.`;
      }
      return `🤖 I'm thinking... but having trouble. Give me a moment and try again!`;
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return `🤖 I'm not sure what to say to that. Could you ask me something else?`;
    }

    // Store AI reply in history
    chatHistory[senderNumber].push({ role: 'assistant', content: reply });

    return reply;
  } catch (err) {
    console.error('⚠️ Groq fetch error:', err.message);
    return `🤖 Sorry, I'm having connection issues. Please try again!`;
  }
}
