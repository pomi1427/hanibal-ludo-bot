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

const bot = new Telegraf(process.env.BOT_TOKEN);

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

// ✅ Handle OTP replies
bot.on('text', async (ctx) => {
  const id = ctx.from.id;
  const msg = ctx.message.text.trim();
  const name = ctx.from.first_name;
  const username = ctx.from.username || 'none';

  // If it's an OTP response
  if (pendingOTPs[id] && msg === pendingOTPs[id]) {
    delete pendingOTPs[id];

    await db.read();
    db.data.users.push({ id, name, username, coins: 0, referredBy: null });
    await db.write();

    return ctx.reply(`🎉 Registered successfully, ${name}!`);
  }
});

// 🧾 /referal command
bot.hears('📢 Referral Link', async (ctx) => {
  const id = ctx.from.id;
  const username = ctx.botInfo.username;

  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (!user) return ctx.reply('❗ You need to register first. Use 📝 Register.');

  ctx.reply(`📢 Invite friends and earn rewards!\nHere’s your link:\nhttps://t.me/${username}?start=${id}`);
});

// 💼 Check Balance
bot.hears('💼 Check Balance', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (!user) return ctx.reply('❗ You need to register first. Use 📝 Register.');

  ctx.reply(`💰 Your current balance is: ${user.coins} coins`);
});

// 🛠 Placeholder for deposit/withdraw (we’ll build logic next)
bot.hears('💰 Deposit Money', (ctx) => {
  ctx.reply('💡 Deposit system coming soon...');
});

bot.hears('💸 Withdraw Money', (ctx) => {
  ctx.reply('💡 Withdrawal system coming soon...');
});

// ✅ Launch bot
(async () => {
  await db.read();
  await db.write();
  bot.launch();
  console.log('🤖 Bot is running...');
})();

