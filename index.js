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

// 🔐 Global bot username (fallback)
let botUsername = 'HanibalLudoBot';
bot.telegram.getMe().then(botInfo => {
  botUsername = botInfo.username;
});

// 🔐 Store pending OTPs
const pendingOTPs = {};

// 🤖 START COMMAND (just shows menu, no auto registration)
bot.start(async (ctx) => {
  const name = ctx.from.first_name;

  ctx.reply(
    `👋 Welcome, ${name}!\nPlease use the menu below to navigate.`,
    Markup.keyboard([
      ['💰 Deposit Money', '💸 Withdraw Money'],
      ['💼 Check Balance', '📝 Register'],
      ['📢 Referral Link']
    ])
    .resize()
  );
});

// 📝 REGISTER with OTP
bot.hears('📝 Register', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find(u => u.id === id);

  if (user) {
    return ctx.reply('✅ You are already registered.');
  }

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  pendingOTPs[id] = otp;

  ctx.reply(`🛡 Your verification code is: *${otp}*\nPlease reply with it to complete registration.`, {
    parse_mode: 'Markdown'
  });
});

// ✅ Smart OTP handler that doesn’t block other buttons
bot.on('text', async (ctx, next) => {
  const id = ctx.from.id;
  const msg = ctx.message.text.trim();
  const name = ctx.from.first_name;
  const username = ctx.from.username || 'none';

  if (pendingOTPs[id]) {
    if (msg === pendingOTPs[id]) {
      delete pendingOTPs[id];

      await db.read();
      db.data.users.push({ id, name, username, coins: 0,

