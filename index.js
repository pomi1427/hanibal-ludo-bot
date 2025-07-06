const { Telegraf } = require('telegraf');
const express = require('express');
require('dotenv').config();
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node'); // ✅ Fix for Node v22

const app = express();
app.get('/', (req, res) => res.send('🤖 Hanibal Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

const adapter = new JSONFile('db.json');
const db = new Low(adapter);

// ... rest of the bot code continues


(async () => {
  await db.read();
  db.data ||= { users: [] };
  await db.write();

  const bot = new Telegraf(process.env.BOT_TOKEN);

  // Handle /start with optional referral
  bot.start(async (ctx) => {
    const id = ctx.from.id;
    const name = ctx.from.first_name;
    const username = ctx.from.username || 'none';
    const text = ctx.message.text;
    const referralId = text.split(' ')[1]; // optional referral code

    await db.read();
    let user = db.data.users.find(u => u.id === id);

    if (user) {
      ctx.reply(`👋 Welcome back, ${name}! You're already registered.`);
    } else {
      const newUser = {
        id,
        name,
        username,
        coins: 0,
        referredBy: referralId || null
      };

      db.data.users.push(newUser);

      // Reward the referrer
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

  bot.launch();
  console.log('🤖 Bot is running...');
})();

 
