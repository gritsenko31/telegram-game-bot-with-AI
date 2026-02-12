const { Telegraf } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const bot = new Telegraf(process.env.BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Хранилище для сессий
const userSessions = new Map();

const MESSAGE_CHUNK_SIZE = 4000;

// Получить или создать сессию
function getUserSession(userId) {
  if (!userSessions.has(userId)) {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.9,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      }
    });
    
    const chat = model.startChat({ history: [] });
    
    userSessions.set(userId, {
      chat,
      messageCount: 0
    });
  }
  return userSessions.get(userId);
}

// Разбивка длинных сообщений
function splitMessage(text, maxLength = MESSAGE_CHUNK_SIZE) {
  const chunks = [];
  let currentChunk = '';
  const lines = text.split('\n');
  
  for (const line of lines) {
    if ((currentChunk + line + '\n').length > maxLength) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

// Команда /start
bot.start((ctx) => {
  const welcomeMessage = `👋 Hello! I'm an AI bot powered by Gemini 2.5 Flash.

📝 I understand context and remember our conversation.

🔧 Commands:
/clear - Clear chat history
/help - Show help

Just send me a message!`;
  
  return ctx.reply(welcomeMessage);
});

// Команда /help
bot.command('help', (ctx) => {
  const helpMessage = `ℹ️ Bot Help:

/start - Start the bot
/clear - Clear conversation history
/help - Show this help

💡 Tip: I remember our conversation context!`;
  
  return ctx.reply(helpMessage);
});

// Команда /clear
bot.command('clear', (ctx) => {
  const userId = ctx.from.id;
  userSessions.delete(userId);
  return ctx.reply('✅ Chat history cleared!');
});

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const userMessage = ctx.message.text;
  
  if (userMessage.startsWith('/')) return;
  
  try {
    await ctx.sendChatAction('typing');
    
    const session = getUserSession(userId);
    const result = await session.chat.sendMessage(userMessage);
    const aiResponse = result.response.text();
    
    session.messageCount++;
    
    const chunks = splitMessage(aiResponse);
    
    for (const chunk of chunks) {
      await ctx.reply(chunk);
      if (chunks.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } catch (error) {
    console.error('Error:', error);
    
    let errorMessage = '❌ An error occurred: ' + error.message;
    
    if (error.message.includes('429')) {
      errorMessage = '⚠️ Rate limit exceeded. Try again in a minute.';
    } else if (error.message.includes('SAFETY')) {
      errorMessage = '⚠️ Content filtered. Try rephrasing.';
    }
    
    await ctx.reply(errorMessage);
  }
});

// Vercel Serverless Function Handler
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } else {
      res.status(200).json({ status: 'Bot is running on Vercel!' });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
};
