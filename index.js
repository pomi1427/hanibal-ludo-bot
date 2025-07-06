const { Telegraf, Markup } = require('telegraf');
const express = require('express');
require('dotenv').config();
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// 🌐 Keep Render alive
const app = express();
app.get('/', (req, res) => res.send('🤖 Hanibal Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

// 🗃 Setup LowDB
const adapter = new JSONFile('db.json');
const db = new Low(adapter, { users: [] });

// 🤖 Setup bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// 🔐 Bot username fallback
let botUsername = 'HanibalLudoBot';
bot.telegram.getMe().then(botInfo => {
  botUsername = botInfo.username;
});

// 🔐 Store OTPs and pending deposits
const pendingOTPs = {};
const pendingDeposits = {};

// 🤖 START COMMAND
bot.start(async (ctx) => {
  const name = ctx.from.first_name;

  ctx.reply(
    `👋 Welcome, ${name}!\nPlease use the menu below to navigate.`,
    Markup.keyboard([
      ['💰 Deposit Money', '💸 Withdraw Money'],
      ['💼 Check Balance', '📝 Register'],
      ['📢 Referral Link', '🔍 My ID']
    ])
    .resize()
  );
});

// 🔍 Handle "My ID" button
bot.hears('🔍 My ID', (ctx) => {
  ctx.reply(`🆔 Your Telegram ID is: ${ctx.from.id}`);
});

// 📝 REGISTER
bot.hears('📝 Register', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find(u => u.id === id);

  if (user) return ctx.reply('✅ You are already registered.');

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  pendingOTPs[id] = otp;

  ctx.reply(`🛡 Your verification code is: *${otp}*\nPlease reply with it to complete registration.`, {
    parse_mode: 'Markdown'
  });
});

// ✅ OTP + Deposit + Text handler
bot.on('text', async (ctx, next) => {
  const id = ctx.from.id;
  const msg = ctx.message.text.trim();
  const name = ctx.from.first_name;
  const username = ctx.from.username || 'none';

  // ✅ OTP Check
  if (pendingOTPs[id]) {
    if (msg === pendingOTPs[id]) {
      delete pendingOTPs[id];

      await db.read();
      db.data.users.push({ id, name, username, coins: 0, referredBy: null });
      await db.write();

      return ctx.reply(`🎉 Registered successfully, ${name}!`);
    } else {
      return ctx.reply('❗ Incorrect OTP. Please try again or click 📝 Register again.');
    }
  }

  // 💰 Deposit amount
  if (pendingDeposit

 


