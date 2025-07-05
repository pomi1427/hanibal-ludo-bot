const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('🤖 Hanibal Bot is alive!');
});

app.listen(3000, () => {
  console.log('🌐 Web server running on port 3000');
});

const { Telegraf } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply('Welcome to Hanibal Ludo & Games Bot 🎮');
});

bot.launch();
