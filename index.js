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
  if (pendingDeposits[id]) {
    const amount = parseFloat(msg);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❗ Invalid amount. Please enter a number like 50');
    }

    delete pendingDeposits[id];
    ctx.reply(`💸 You requested to deposit ${amount} coins.\n⏳ Waiting for admin to confirm.`);

    const ADMIN_ID = process.env.ADMIN_ID;
    if (ADMIN_ID) {
      ctx.telegram.sendMessage(ADMIN_ID, `📥 Deposit Request:\nFrom: @${username}\nID: ${id}\nAmount: ${amount} coins`);
    }

    return;
  }

  return next();
});

// 📢 Referral link
bot.hears('📢 Referral Link', async (ctx) => {
  const id = ctx.from.id;

  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (!user) return ctx.reply('❗ You need to register first. Use 📝 Register.');

  ctx.reply(`📢 Invite friends and earn coins!\nHere’s your link:\nhttps://t.me/${botUsername}?start=${id}`);
});

// 💼 Check balance
bot.hears('💼 Check Balance', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (!user) return ctx.reply('❗ You need to register first. Use 📝 Register.');

  ctx.reply(`💰 Your current balance is: ${user.coins} coins`);
});

// 💰 Deposit
bot.hears('💰 Deposit Money', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (!user) return ctx.reply('❗ You need to register first. Use 📝 Register.');

  pendingDeposits[id] = true;

  ctx.reply(`💳 Please enter the amount you want to deposit (e.g. 50)\n💡 You’ll be contacted after confirmation.`);
});

// 💸 Withdraw
bot.hears('💸 Withdraw Money', (ctx) => {
  ctx.reply('💡 Withdrawal system coming soon...');
});

// ✅ Launch bot
(async () => {
  await db.read();
  db.data ||= { users: [] };
  await db.write();
  bot.launch();
  console.log('🤖 Bot is running...');
})();


 
