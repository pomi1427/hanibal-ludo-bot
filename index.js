const { Telegraf, Markup } = require('telegraf');
const express = require('express');
require('dotenv').config();
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// 🌐 Keep Render alive
const app = express();
app.get('/', (req, res) => res.send('🤖 Hanibal Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

// 📦 Setup DB
const adapter = new JSONFile('db.json');
const db = new Low(adapter, { users: [] });

// 💰 1 Coin = 1 Birr
const COIN_VALUE_BIRR = 1;

// 🤖 Create Bot
const bot = new Telegraf(process.env.BOT_TOKEN);
let botUsername = 'HanibalLudoBot';
bot.telegram.getMe().then(botInfo => { botUsername = botInfo.username });

// 🔐 Store temporary states
const pendingOTPs = {};
const pendingDeposits = {};
const pendingAddCoins = {}; // for admin

// 🚀 Start command
bot.start((ctx) => {
  const name = ctx.from.first_name;
  ctx.reply(
    `👋 Welcome, ${name}!\n\n💰 1 Coin = ${COIN_VALUE_BIRR} Ethiopian Birr\nUse the menu below to begin.`,
    Markup.keyboard([
      ['💰 Deposit Money', '💸 Withdraw Money'],
      ['💼 Check Balance', '📝 Register'],
      ['📢 Referral Link', '🔍 My ID'],
      ['💱 Coin Rates']
    ]).resize()
  );
});

// 💱 Coin Rates
bot.hears('💱 Coin Rates', (ctx) => {
  ctx.reply(`💰 Current Rate:\n1 Coin = ${COIN_VALUE_BIRR} Ethiopian Birr`);
});

// 🔍 My ID
bot.hears('🔍 My ID', (ctx) => {
  ctx.reply(`🆔 Your Telegram ID is: ${ctx.from.






