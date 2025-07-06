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
  ctx.reply(`🆔 Your Telegram ID is: ${ctx.from.id}`);
});

// 📝 Register
bot.hears('📝 Register', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (user) return ctx.reply('✅ You are already registered.');

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  pendingOTPs[id] = otp;

  ctx.reply(`🛡 Verification Code: *${otp}*\nPlease reply with it to register.`, { parse_mode: 'Markdown' });
});

// 📩 Handle OTP and deposits
bot.on('text', async (ctx, next) => {
  const id = ctx.from.id;
  const msg = ctx.message.text.trim();
  const name = ctx.from.first_name;
  const username = ctx.from.username || 'none';

  // ✅ OTP registration
  if (pendingOTPs[id]) {
    if (msg === pendingOTPs[id]) {
      delete pendingOTPs[id];
      await db.read();
      db.data.users.push({ id, name, username, coins: 0, referredBy: null });
      await db.write();
      return ctx.reply(`🎉 Registered successfully, ${name}!`);
    } else {
      return ctx.reply('❗ Incorrect OTP. Try again.');
    }
  }

  // 💰 Deposit flow
  if (pendingDeposits[id]) {
    const amount = parseFloat(msg);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❗ Invalid amount.');

    delete pendingDeposits[id];
    ctx.reply(`💸 Deposit request received: ${amount} coins\n⏳ Waiting for admin confirmation.`);

    const ADMIN_ID = process.env.ADMIN_ID;
    if (ADMIN_ID) {
      bot.telegram.sendMessage(ADMIN_ID, `📥 Deposit Request:\nUser: @${username}\nID: ${id}\nAmount: ${amount} coins`);
    }

    return;
  }

  // ➕ Admin Add Coins
  if (pendingAddCoins[id]) {
    const [targetId, coins] = msg.split(' ');
    const amount = parseInt(coins);
    if (!targetId || isNaN(amount)) {
      return ctx.reply('❗ Format: userID amount (e.g., 123456789 50)');
    }

    await db.read();
    const user = db.data.users.find(u => u.id.toString() === targetId);
    if (!user) return ctx.reply('❗ User not found.');

    user.coins += amount;
    await db.write();

    ctx.reply(`✅ Added ${amount} coins to ${user.name}`);
    delete pendingAddCoins[id];
    return;
  }

  return next();
});

// 💼 Check Balance
bot.hears('💼 Check Balance', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (!user) return ctx.reply('❗ Not registered.');
  ctx.reply(`💼 Balance: ${user.coins} coins`);
});

// 📢 Referral
bot.hears('📢 Referral Link', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (!user) return ctx.reply('❗ Not registered.');
  ctx.reply(`📢 Share this link:\nhttps://t.me/${botUsername}?start=${id}`);
});

// 💰 Deposit
bot.hears('💰 Deposit Money', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (!user) return ctx.reply('❗ Please register first.');
  pendingDeposits[id] = true;
  ctx.reply('💸 Enter the amount you want to deposit:');
});

// 💸 Withdraw (Coming soon)
bot.hears('💸 Withdraw Money', (ctx) => {
  ctx.reply('💡 Withdraw system coming soon...');
});

// 🛠 /admin Panel
bot.command('admin', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

  ctx.reply('🛠 Admin Panel', Markup.inlineKeyboard([
    [Mark]()
