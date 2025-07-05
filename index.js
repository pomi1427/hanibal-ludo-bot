const { Telegraf } = require('telegraf');
const express = require('express');
require('dotenv').config();
const { Low, JSONFile } = require('lowdb');

// Express server for uptime
const app = express();
app.get('/', (req, res) => res.send('🤖 Hanibal Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

// Setup database
const adapter = new JSONFile('db.json');
const db = new Low(adapter);

await db.read();
db.data ||= { users: [] };
await db.write();

// Telegram Bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// /start [optional_referral]
bot.start(async (ctx) => {
  const id = ctx.from.id;
  const name = ctx.from.first_name;
  const username = ctx.from.username || 'none';
  const text = ctx.message.text;
  const referralId = text.split(' ')[1]; // if referral exists

  await db.read();
  let user = db.data.users.find(u => u.id === id);

  if (user) {
    ctx.reply(`👋 Welcome back, ${name}! You're already registered.`);
  } else {
    // Register new user
    const newUser = {
      id,
      name,
      username,
      coins: 0,
      referredBy: referralId || null
    };

    db.data.users.push(newUser);

    // Reward referrer if valid
    if (referralId) {
      const refUser = db.data.users.find(u => u.id.toString() === referralId);
      if (refUser) {
        refUser.coins += 10;
        await ctx.telegram.sendMessage(refUser.id, `🎉 You earned 10 coins for referring ${name}!`);
      }
    }

    await db.write();

    ctx.reply(`🎉 Welcome ${name}! You are now registered.\n\nYour coins: 0${referralId ? '\n👤 Referred by: ' + referralId : ''}`);
  }
});
