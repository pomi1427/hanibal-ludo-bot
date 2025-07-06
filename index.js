
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
    👋 Welcome, ${name}!\n💰 1 Coin = ${COIN_VALUE_BIRR} Birr\nUse the menu below.,
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
  ctx.reply(💰 1 Coin = ${COIN_VALUE_BIRR} Birr);
});

// My ID
bot.hears('🔍 My ID', (ctx) => {
  ctx.reply(🆔 Your ID: ${ctx.from.id});
});

// Register
bot.hears('📝 Register', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const exists = db.data.users.find((u) => u.id === id);
  if (exists) return ctx.reply('✅ Already registered.');

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  pendingOTPs[id] = otp;
  ctx.reply(🛡 Your OTP: *${otp}*\nReply with it to confirm., { parse_mode: 'Markdown' });
});

// Text handler
bot.on('text', async (ctx, next) => {
  const id = ctx.from.id;
  const msg = ctx.message.text.trim();
  const name = ctx.from.first_name;
  const username = ctx.from.username || 'none';

  if (pendingOTPs[id]) {
    if (msg === pendingOTPs[id]) {
      await db.read();
      db.data.users.push({ id, name, username, coins: 0, referredBy: null });
      await db.write();
      delete pendingOTPs[id];
      return ctx.reply(🎉 Registered, ${name}!);
    } else {
      return ctx.reply('❗ Wrong OTP.');
    }
  }

  if (pendingDeposits[id]) {
    const amount = parseFloat(msg);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❗ Invalid amount.');
    delete pendingDeposits[id];
    ctx.reply(💸 Deposit of ${amount} received. Waiting for admin.);

    if (ADMIN_ID) {
      bot.telegram.sendMessage(
        ADMIN_ID,
        📥 Deposit request from @${username} (ID: ${id}):\nAmount: ${amount} coins
      );
    }
    return;
  }

  if (pendingAddCoins[id]) {
    const [targetId, coins] = msg.split(' ');
    const amount = parseInt(coins);
    if (!targetId || isNaN(amount)) return ctx.reply('❗ Format: userID amount');

    await db.read();
    const user = db.data.users.find((u) => u.id.toString() === targetId);
    if (!user) return ctx.reply('❗ User not found.');

    user.coins += amount;
    await db.write();
    delete pendingAddCoins[id];
    return ctx.reply(✅ Added ${amount} coins to ${user.name});
  }

  return next();
});

// Check Balance
bot.hears('💼 Check Balance', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find((u) => u.id === id);
  if (!user) return ctx.reply('❗ Not registered.');
  ctx.reply(💰 Coins: ${user.coins});
});

// Referral
bot.hears('📢 Referral Link', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find((u) => u.id === id);
  if (!user) return ctx.reply('❗ Register first.');
  ctx.reply(📢 Invite link:\nhttps://t.me/${botUsername}?start=${id});
});

; (, [7/6/2025 11:53 PM]
// Deposit
bot.hears('💰 Deposit Money', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find((u) => u.id === id);
  if (!user) return ctx.reply('❗ Register first.');
  pendingDeposits[id] = true;
  ctx.reply('💸 Enter amount to deposit:');
});

// Withdraw
bot.hears('💸 Withdraw Money', (ctx) => {
  ctx.reply('🚧 Withdraw system coming soon!');
});

// Admin Panel
bot.command('admin', (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  ctx.reply('🛠 Admin Tools', Markup.inlineKeyboard([
    [Markup.button.callback('📋 View Users', 'view_users')],
    [Markup.button.callback('➕ Add Coins to User', 'add_coins')],
  ]));
});

bot.action('view_users', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  await db.read();
  const users = db.data.users;
  const list = users.length
    ? users.map(u => 👤 ${u.name} (@${u.username}) - ${u.coins} coins).join('\n')
    : 'No users yet.';
  ctx.reply(list);
});

bot.action('add_coins', (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  pendingAddCoins[ctx.from.id] = true;
  ctx.reply('➕ Format: userID amount (e.g., 123456789 50)');
});

// 🟢 Launch Bot
(async () => {
  await db.read();
  db.data ||= { users: [] };
  await db.write();
  bot.launch();
  console.log('🤖 Bot is running...');
})();




