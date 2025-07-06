const { Telegraf, Markup } = require('telegraf');
const express = require('express');
require('dotenv').config();
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// 🌐 Keep the bot alive
const app = express();
app.get('/', (req, res) => res.send('🤖 Hanibal Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

// 🔐 Constants
const ADMIN_ID = process.env.ADMIN_ID;
const COIN_VALUE_BIRR = 1;

// 🗃️ Setup DB
const adapter = new JSONFile('db.json');
const db = new Low(adapter);
const pendingOTPs = {};
const pendingDeposits = {};
const pendingWithdrawals = {};

(async () => {
  await db.read();
  db.data ||= { users: [], deposits: [], withdrawals: [] };
  await db.write();

  const bot = new Telegraf(process.env.BOT_TOKEN);

  // 🧠 /start
  bot.start((ctx) => {
    const name = ctx.from.first_name;
    ctx.reply(
      `👋 Welcome, ${name}!\n💰 1 Coin = ${COIN_VALUE_BIRR} Birr\nUse the menu below.`,
      Markup.keyboard([
        ['💰 Deposit Money', '💸 Withdraw Money'],
        ['💼 Check Balance', '📝 Register'],
        ['📢 Referral Link', '🔍 My ID'],
        ['📊 My Transactions'],
        ADMIN_ID == ctx.from.id.toString() ? ['🛠️ Admin Tools'] : []
      ]).resize()
    );
  });

  // 📝 Register with OTP
  bot.hears('📝 Register', async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    const exists = db.data.users.find(u => u.id === id);
    if (exists) return ctx.reply('✅ Already registered.');
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    pendingOTPs[id] = otp;
    ctx.reply(`🔐 Your OTP: ${otp}\nReply with it to verify.`);
  });

  bot.on('text', async (ctx) => {
    const id = ctx.from.id;
    const msg = ctx.message.text;

    if (pendingOTPs[id] && msg === pendingOTPs[id]) {
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
      ctx.reply('✅ You are now registered!');
    }
  });

  // 🔍 My ID
  bot.hears('🔍 My ID', (ctx) => {
    ctx.reply(`🆔 Your ID: ${ctx.from.id}`);
  });

  // 📢 Referral Link
  bot.hears('📢 Referral Link', (ctx) => {
    const botUsername = 'HanibalLudoBot'; // Replace if different
    ctx.reply(`🔗 Invite friends using this link:\nhttps://t.me/${botUsername}?start=${ctx.from.id}`);
  });

  // 💼 Check Balance
  bot.hears('💼 Check Balance', async (ctx) => {
    await db.read();
    const user = db.data.users.find(u => u.id === ctx.from.id);
    if (!user) return ctx.reply('❗ Please register first using /register.');
    ctx.reply(`💰 Your balance: ${user.coins} coins`);
  });

  // 💰 Deposit Request
  bot.hears('💰 Deposit Money', async (ctx) => {
    ctx.reply('💳 Please send the amount you want to deposit (in coins):');
    pendingDeposits[ctx.from.id] = true;
  });

  // 💸 Withdraw Request
  bot.hears('💸 Withdraw Money', async (ctx) => {
    ctx.reply('🏧 Enter amount to withdraw (in coins):');
    pendingWithdrawals[ctx.from.id] = true;
  });

  // Handle deposits & withdrawals
  bot.on('text', async (ctx) => {
    const id = ctx.from.id;
    const msg = ctx.message.text;
    const amount = parseInt(msg);

    await db.read();
    const user = db.data.users.find(u => u.id === id);
    if (!user) return;

    // Deposit
    if (pendingDeposits[id]) {
      delete pendingDeposits[id];
      db.data.deposits.push({ userId: id, amount, time: new Date().toISOString(), status: 'pending' });
      await db.write();
      ctx.reply(`💵 Deposit request of ${amount} coins submitted for approval.`);
      bot.telegram.sendMessage(ADMIN_ID, `🧾 New deposit request:\nUser: ${user.name} (${user.id})\nAmount: ${amount} coins`);
    }

    // Withdraw
    if (pendingWithdrawals[id]) {
      delete pendingWithdrawals[id];
      if (user.coins < amount) return ctx.reply('❌ Not enough coins.');
      db.data.withdrawals.push({ userId: id, amount, time: new Date().toISOString(), status: 'pending' });
      await db.write();
      ctx.reply(`💸 Withdrawal request of ${amount} coins submitted.`);
      bot.telegram.sendMessage(ADMIN_ID, `📤 Withdrawal request:\nUser: ${user.name} (${user.id})\nAmount: ${amount} coins`);
    }
  });

  // 📊 My Transactions
  bot.hears('📊 My Transactions', async (ctx) => {
    const id = ctx.from.id;
    await db.read();

    const deposits = db.data.deposits.filter(d => d.userId === id);
    const withdrawals = db.data.withdrawals.filter(w => w.userId === id);

    let message = '📥 Deposits:\n';
    message += deposits.length ? deposits.map(d => `+${d.amount} coins (${d.status})`).join('\n') : 'No deposits.';

    message += '\n\n📤 Withdrawals:\n';
    message += withdrawals.length ? withdrawals.map(w => `-${w.amount} coins (${w.status})`).join('\n') : 'No withdrawals.';

    ctx.reply(message);
  });

  // 🛠️ Admin Tools
  bot.hears('🛠️ Admin Tools', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await db.read();
    const users = db.data.users.length;
    const totalCoins = db.data.users.reduce((sum, u) => sum + u.coins, 0);
    ctx.reply(`🛠️ Admin Tools:\n👥 Users: ${users}\n💰 Total Coins: ${totalCoins}`);
  });

  bot.launch();
  console.log('🤖 Bot is running...');
})();
