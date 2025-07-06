const { Telegraf, Markup } = require('telegraf');
const express = require('express');
require('dotenv').config();
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// 🌐 Keep alive
const app = express();
app.get('/', (req, res) => res.send('🤖 Hanibal Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

// 🔐 Admin and Constants
const ADMIN_ID = process.env.ADMIN_ID;
const COIN_VALUE_BIRR = 1;

// 🔧 Setup DB
const adapter = new JSONFile('db.json');
const db = new Low(adapter, { users: [] });

// 🤖 Bot init
const bot = new Telegraf(process.env.BOT_TOKEN);
let botUsername = 'HanibalLudoBot';
bot.telegram.getMe().then((info) => (botUsername = info.username));

// 🧠 Memory storage
const pendingOTPs = {};
const pendingDeposits = {};
const pendingAddCoins = {};

// /start
bot.start((ctx) => {
  const name = ctx.from.first_name;
  ctx.reply(
    `👋 Welcome, ${name}!\n💰 1 Coin = ${COIN_VALUE_BIRR} Birr\nUse the menu below.`,
    Markup.keyboard([
      ['💰 Deposit Money', '💸 Withdraw Money'],
      ['💼 Check Balance', '📝 Register'],
      ['📢 Referral Link', '🔍 My ID'],
      ['💱 Coin Rates']
    ]).resize()
  );
});

// Coin rate
bot.hears('💱 Coin Rates', (ctx) => {
  ctx.reply(`💰 1 Coin = ${COIN_VALUE_BIRR} Birr`);
});

// My ID
bot.hears('🔍 My ID', (ctx) => {
  ctx.reply(`🆔 Your ID: ${ctx.from.id}`);
});

// Register
bot.hears('📝 Register', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const exists = db.data.users.find((u) => u.id === id);
  if (exists) return ctx.reply('✅ Already registered.');

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  pendingOTPs[id] = otp;
  ct






