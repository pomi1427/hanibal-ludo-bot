const { Telegraf, Markup } = require('telegraf');
const express = require('express');
require('dotenv').config();
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// 🌐 Express (keep alive for Render)
const app = express();
app.get('/', (req, res) => res.send('🤖 Hanibal Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

// 🔐 Admin + Coin Settings
const ADMIN_ID = process.env.ADMIN_ID;
const COIN_VALUE_BIRR = 1;

// 🗂️ Setup DB with default data
const adapter = new JSONFile('db.json');
const db = new Low(adapter, {
  users: [],
  deposits: [],
  withdrawals: []
});

// 🤖 Setup bot
const bot = new Telegraf(process.env.BOT_TOKEN);
let botUsername = 'HanibalLudoBot';
bot.telegram.getMe().then(info => (botUsername = info.username));

// 🧠 Memory
const pendingOTPs = {};
const pendingDeposits = {};
const pendingWithdrawals = {};

// 🟢 Start command
bot.start((ctx) => {
  const name = ctx.from.first_name;
  ctx.reply(
    `👋 Welcome, ${name}!\n💰 1 Coin = ${COIN_VALUE_BIRR} Birr\nUse the menu below.`,
    Markup.keyboard([
      ['📝 Register', '💼 Check Balance'],
      ['💰 Deposit Money', '💸 Withdraw Money'],
      ['📢 Referral Link', '🔍 My ID'],
      ['📊 Transactions'],
      ADMIN_ID == ctx.from.id ? ['🛠 Admin Tools'] : []
    ].filter(Boolean)).resize()
  );
});

// 📝 Register with OTP
bot.hears('📝 Register', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const exists = db.data.users.find(u => u.id === id);
  if (exists) return ctx.reply('✅ You are already registered.');

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  pendingOTPs[id] = otp;
  ctx.reply(`🔐 Your OTP is: ${otp}\nSend it back exactly to complete registration.`);
});

bot.hears(/^\d{4}$/, async (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;
  if (pendingOTPs[id] && text === pendingOTPs[id]) {
    await db.read();
    db.data.users.push({
      id,
      name: ctx.from.first_name,
      username: ctx.from.username || 'none',
      coins: 0,
      referredBy: null
    });
    delete pendingOTPs[id];
    await db.write();
    ctx.reply('🎉 You are now registered!');
  }
});

// 💼 Check Balance
bot.hears('💼 Check Balance', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (user) {
    ctx.reply(`💰 Coins: ${user.coins}`);
  } else {
    ctx.reply('❗ You are not registered. Use 📝 Register.');
  }
});

// 📢 Referral
bot.hears('📢 Referral Link', (ctx) => {
  const id = ctx.from.id;
  ctx.reply(`🔗 Share your referral link:\nhttps://t.me/${botUsername}?start=${id}`);
});

// 🔍 My ID
bot.hears('🔍 My ID', (ctx) => {
  ctx.reply(`🆔 Your Telegram ID: ${ctx.from.id}`);
});

// 📊 Transactions
bot.hears('📊 Transactions', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const deposits = db.data.deposits.filter(d => d.userId === id);
  const withdrawals = db.data.withdrawals.filter(w => w.userId === id);

  let message = '📊 *Your Transaction History:*\n\n';
  if (deposits.length === 0 && withdrawals.length === 0) {
    message += 'No transactions found.';
  } else {
    if (deposits.length > 0) {
      message += '🟢 Deposits:\n';
      deposits.forEach(d => {
        message += `- ${d.amount} coins (status: ${d.status})\n`;
      });
    }
    if (withdrawals.length > 0) {
      message += '\n🔴 Withdrawals:\n';
      withdrawals.forEach(w => {
        message += `- ${w.amount} coins (status: ${w.status})\n`;
      });
    }
  }
  ctx.reply(message, { parse_mode: 'Markdown' });
});

// 🛠 Admin Tools
bot.hears('🛠 Admin Tools', (ctx) => {
  if (ctx.from.id.toString() === ADMIN_ID) {
    ctx.reply('🔧 Admin Panel:\nYou can now approve deposits and withdrawals.');
  } else {
    ctx.reply('⛔ You are not an admin.');
  }
});

// ✅ Launch bot
bot.launch();
console.log('🤖 Bot is running...');

