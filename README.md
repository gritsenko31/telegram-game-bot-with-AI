 🎮 Telegram Game Bot with AI

Multiplayer Telegram mini-game bot with MongoDB integration. Built with Node.js and deployed on Render.

**🤖 Try it now:** [@my_guess_game_bot](https://t.me/my_guess_game_bot)

[![Open in Telegram](https://img.shields.io/badge/Open%20in%20Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/my_guess_game_bot)

## 🚀 Features

- **Multiplayer gameplay** – Real-time game sessions
- **MongoDB database** – Persistent player data and achievements
- **Achievement system** – Track player progress
- **Auto-deployment** – Connected to Render for continuous delivery
- **24/7 uptime monitoring** – UptimeRobot keeps the bot active

## 🛠️ Tech Stack

- **Node.js** – Backend runtime
- **Telegraf** – Telegram Bot API framework
- **MongoDB** – Database for game state and user data
- **Express** – Web server for health checks
- **Render** – Hosting platform (free tier)

## 📦 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/gritsenko31/telegram-game-bot.git
   cd telegram-game-bot
Install dependencies:

bash
npm install
Create .env file with your credentials:

text
BOT_TOKEN=your_telegram_bot_token
MONGODB_URI=your_mongodb_connection_string
PORT=10000
Run the bot:

bash
node bot.js
🌐 Deployment
The bot is deployed on Render (free tier):

Live URL: https://telegram-game-bot-tbij.onrender.com/

Note: First request after inactivity may take ~20-30s to wake up

Deploy to Render
Fork this repo

Connect to Render

Set environment variables: BOT_TOKEN, MONGODB_URI

Deploy as Web Service

📝 Project Structure
text
telegram-game-bot/
├── bot.js              # Main bot logic
├── database.js         # MongoDB connection
├── multiplayer.js      # Multiplayer game logic
├── achievements.js     # Achievement tracking
├── package.json        # Dependencies
└── .gitignore          # Git ignore rules
## 🎯 How to Use

**Try the live bot:** [@my_guess_game_bot](https://t.me/my_guess_game_bot)

1. Open the bot in Telegram: https://t.me/my_guess_game_bot
2. Start the bot with `/start`
3. Follow the game instructions
4. Compete with other players in real-time

> **Note:** Bot runs on Render free tier – first message after inactivity may take ~20-30s to wake up.


🔧 Development
This is a portfolio project demonstrating:

Telegram Bot API integration

Real-time multiplayer functionality

Database management with MongoDB

Cloud deployment and monitoring

AI-assisted development workflow

 🤖 AI Assistant Update (February 12, 2026)

The bot now includes an **intelligent AI assistant** powered by Google Gemini 2.5 Flash!

### What's New:
- **Always Available**: Chat with AI anytime - during gameplay, in menus, or when idle
- **Smart Responses**: Ask about rules, request hints, or just have a conversation
- **Seamless Integration**: Type any text (not a number) to interact with AI
- **English Only**: All AI responses are in English for consistency
- **Non-Intrusive**: Numbers trigger gameplay, text triggers AI chat

### Use Cases:
- Learn game rules: *"How do I play?"*
- Get strategic advice: *"What's the best strategy for hard mode?"*
- Request hints: *"Give me a hint for my current game"*
- Casual chat: *"Tell me a joke"* or *"Hello, how are you?"*

The AI understands context and provides helpful, friendly responses in under 100 words.

👤 Author
gritsenko31

GitHub: @gritsenko31

Portfolio: vibecodegames.org
