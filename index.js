const { Telegraf } = require('telegraf');
const express = require('express');
require('dotenv').config();
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// 🌐 Keep the bot alive on Render with Express
const app = express();
app.get('/', (req, res) => res.send('🤖 Hanibal Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

// 📦 Setup LowDB (✅ default data passed here)
const adapter = new JSONFile('db.json');
const db = new Low(adapter, { users: [] });

(async () => {
  await db.read();
  await db.write();


  const bot = new Telegraf(process.env.BOT_TOKEN);

  // 🧠 /start command with optional referral
  bot.start(async (ctx) => {
    const id = ctx.from.id;
    const name = ctx.from.first_name;
    const username = ctx.from.username || 'none';
    const text = ctx.message.text;
    const referralId = text.split(' ')[1]; // optional referral

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

      // 🎁 Reward referrer
      if (referralId) {
        const refUser = db.data.users.find(u => u.id.toString() === referralId);
        if (refUser) {
          refUser.coins += 10;
          await ctx.telegram.sendMessage(refUser.id, `🎉 You earned 10 coins for referring ${name}!`);
        }
      }

      await db.write();

      ctx.reply(`🎉 Welcome ${name}! You're now registered.\n\n💰 Coins: 0${referralId ? '\n👤 Referred by: ' + referralId : ''}`);
    }
  });

  // 👤 /me command to show user's info
  bot.command('me', async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    const user = db.data.users.find(u => u.id === id);
    if (user) {
      ctx.reply(`👤 Name: ${user.name}\n💰 Coins: ${user.coins}\n🧾 Referred by: ${user.referredBy || 'None'}`);
    } else {
      ctx.reply('❗ You are not registered yet. Send /start to register.');
    }
  });
  // 📢 /refer command to share referral link
  bot.command('refer', async (ctx) => {
    const id = ctx.from.id;
    const username = ctx.botInfo.username;
    ctx.reply(`📢 Share this link to invite friends:\nhttps://t.me/${username}?start=${id}`);
  });

  bot.launch();
  console.log('🤖 Bot is running...');
})();

 
 
