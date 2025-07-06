const { Telegraf, Markup } = require('telegraf');
const express = require('express');
require('dotenv').config();
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// 🌐 Keep the bot alive
const app = express();
app.get('/', (req, res) => res.send('🤖 Hanibal Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

// 🔐 Admin ID and Coin Rate
const ADMIN_ID = process.env.ADMIN_ID;
const COIN_VALUE_BIRR = 1;

// 📦 LowDB Setup
const adapter = new JSONFile('db.json');
const db = new Low(adapter);
const pendingOTPs = {};

(async () => {
  await db.read();
  db.data ||= { users: [] };
  await db.write();

  const bot = new Telegraf(process.env.BOT_TOKEN);

  // 🤖 /start command
  bot.start((ctx) => {
    const name = ctx.from.first_name;
    ctx.reply(
      👋 Welcome, ${name}!\n💰 1 Coin = ${COIN_VALUE_BIRR} Birr\nUse the menu below.,
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
    ctx.reply(💰 1 Coin = ${COIN_VALUE_BIRR} Birr);
  });

  // 🔍 My ID
  bot.hears('🔍 My ID', (ctx) => {
    ctx.reply(🆔 Your Telegram ID is: ${ctx.from.id});
  });

  // 📝 Register (OTP based)
  bot.hears('📝 Register', async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    const alreadyRegistered = db.data.users.find((u) => u.id === id);
    if (alreadyRegistered) return ctx.reply('✅ You are already registered.');

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    pendingOTPs[id] = otp;

    ctx.reply(📨 Your OTP is: ${otp}\nPlease send it here to complete your registration.);
  });

  // ✅ Verify OTP
  bot.on('text', async (ctx) => {
    const id = ctx.from.id;
    const msg = ctx.message.text.trim();
    const expectedOtp = pendingOTPs[id];

    if (expectedOtp && msg === expectedOtp) {
      const newUser = {
        id,
        name: ctx.from.first_name,
        username: ctx.from.username || 'none',
        coins: 0,
        referredBy: null
      };
      db.data.users.push(newUser);
      delete pendingOTPs[id];
      await db.write();
      return ctx.reply(✅ Registration complete!\n💰 Coins: 0);
    }
  });

  // 💼 Check Balance
  bot.hears('💼 Check Balance', async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    const user = db.data.users.find((u) => u.id === id);
    if (!user) return ctx.reply('❗ You are not registered. Click 📝 Register first.');
    ctx.reply(💼 Balance: ${user.coins} Coins);
  });

  // 📢 Referral Link
  bot.hears('📢 Referral Link', async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    const user = db.data.users.find((u) => u.id === id);
    if (!user) return ctx.reply('❗ You must register first.');

    const link = https://t.me/${bot.botInfo.username}?start=${id};
    ctx.reply(📢 Share this referral link:\n${link});
  });

  // ✅ Launch
  bot.launch();
  console.log('🤖 Bot is running...');
})();
