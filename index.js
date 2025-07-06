const { Telegraf, Markup } = require("telegraf");
const express = require("express");
require("dotenv").config();
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");

// ─── Keep the bot alive on Render ─────────────────────────────────────────────
const app = express();
app.get("/", (_req, res) => res.send("🤖 Hanibal Bot is alive!"));
app.listen(3000, () => console.log("🌐 Web server running on port 3000"));

// ─── Admin & Constants ────────────────────────────────────────────────────────
const ADMIN_ID = process.env.ADMIN_ID;
const COIN_VALUE_BIRR = 1;

// ─── LowDB Setup with default data ────────────────────────────────────────────
const adapter = new JSONFile("db.json");
const db = new Low(adapter, { users: [] });  // ← default data here!

// ─── In‑Memory State ───────────────────────────────────────────────────────────
const pendingOTPs = {};       // userID → OTP
const pendingDeposits = {};   // userID → true
const pendingAddCoins = {};   // adminID → true

// ─── Main Async IIFE ──────────────────────────────────────────────────────────
(async () => {
  await db.read();
  // no need for db.data ||= ... since default data is provided
  await db.write();

  const bot = new Telegraf(process.env.BOT_TOKEN);

  // ─── /start ────────────────────────────────────────────────────────────────
  bot.start((ctx) => {
    const name = ctx.from.first_name;
    ctx.reply(
      `👋 Welcome, ${name}!\n💰 1 Coin = ${COIN_VALUE_BIRR} Birr\nUse the menu below:`,
      Markup.keyboard([
        ["💰 Deposit Money", "💸 Withdraw Money"],
        ["💼 Check Balance", "📝 Register"],
        ["📢 Referral Link", "🔍 My ID"],
        ["💱 Coin Rates"],
      ]).resize()
    );
  });

  // ─── Coin Rates ─────────────────────────────────────────────────────────────
  bot.hears("💱 Coin Rates", (ctx) => {
    ctx.reply(`💰 1 Coin = ${COIN_VALUE_BIRR} Birr`);
  });

  // ─── My ID ──────────────────────────────────────────────────────────────────
  bot.hears("🔍 My ID", (ctx) => {
    ctx.reply(`🆔 Your Telegram ID is: ${ctx.from.id}`);
  });

  // ─── Register (OTP) ─────────────────────────────────────────────────────────
  bot.hears("📝 Register", async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    if (db.data.users.find((u) => u.id === id)) {
      return ctx.reply("✅ You are already registered.");
    }
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    pendingOTPs[id] = otp;
    ctx.reply(`📨 Your OTP is: ${otp}\nPlease reply with it here to register.`);
  });

  // ─── Handle OTP, Deposits, Admin Top‑Up ──────────────────────────────────────
  bot.on("text", async (ctx, next) => {
    const id = ctx.from.id;
    const text = ctx.message.text.trim();
    const name = ctx.from.first_name;
    const username = ctx.from.username || "none";

    // OTP verification
    if (pendingOTPs[id]) {
      if (text === pendingOTPs[id]) {
        db.data.users.push({
          id,
          name,
          username,
          coins: 0,
          referredBy: null,
        });
        delete pendingOTPs[id];
        await db.write();
        return ctx.reply("✅ Registration complete! You have 0 coins.");
      } else {
        return ctx.reply("❗ Wrong OTP. Try again.");
      }
    }

    // Deposit flow
    if (pendingDeposits[id]) {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply("❗ Invalid amount.");
      }
      delete pendingDeposits[id];
      ctx.reply(`💸 Deposit request: ${amount} coins. Awaiting admin.`);

      if (ADMIN_ID) {
        await bot.telegram.sendMessage(
          ADMIN_ID,
          `📥 Deposit request from @${username} (ID: ${id}): ${amount} coins`
        );
      }
      return;
    }

    // Admin add coins flow
    if (pendingAddCoins[id]) {
      const [targetId, coins] = text.split(" ");
      const amt = parseInt(coins, 10);
      if (!targetId || isNaN(amt)) {
        return ctx.reply("❗ Format: userID amount (e.g., 123456789 50)");
      }
      const user = db.data.users.find((u) => u.id.toString() === targetId);
      if (!user) {
        delete pendingAddCoins[id];
        return ctx.reply("❗ User not found.");
      }
      user.coins += amt;
      delete pendingAddCoins[id];
      await db.write();
      return ctx.reply(`✅ Added ${amt} coins to ${user.name}.`);
    }

    // pass to next hears()
    return next();
  });

  // ─── Check Balance ──────────────────────────────────────────────────────────
  bot.hears("💼 Check Balance", async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    const user = db.data.users.find((u) => u.id === id);
    if (!user) {
      return ctx.reply("❗ You are not registered. Use 📝 Register first.");
    }
    ctx.reply(`💰 Your balance: ${user.coins} coins`);
  });

  // ─── Referral Link ──────────────────────────────────────────────────────────
  bot.hears("📢 Referral Link", async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    if (!db.data.users.find((u) => u.id === id)) {
      return ctx.reply("❗ You must register first. Use 📝 Register.");
    }
    const link = `https://t.me/${bot.botInfo.username}?start=${id}`;
    ctx.reply(`📢 Share to refer:\n${link}`);
  });

  // ─── Deposit Prompt ─────────────────────────────────────────────────────────
  bot.hears("💰 Deposit Money", async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    if (!db.data.users.find((u) => u.id === id)) {
      return ctx.reply("❗ You must register first. Use 📝 Register.");
    }
    pendingDeposits[id] = true;
    ctx.reply("💸 Enter the amount you want to deposit:");
  });

  // ─── Withdraw Placeholder ───────────────────────────────────────────────────
  bot.hears("💸 Withdraw Money", (ctx) => {
    ctx.reply("🚧 Withdraw system coming soon!");
  });

  // ─── /admin Panel ───────────────────────────────────────────────────────────
  bot.command("admin", (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    ctx.reply(
      "🛠 Admin Tools",
      Markup.inlineKeyboard([
        [Markup.button.callback("📋 View Users", "view_users")],
        [Markup.button.callback("➕ Add Coins to User", "add_coins")],
      ])
    );
  });

  bot.action("view_users", async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await db.read();
    const list =
      db.data.users
        .map((u) => `👤 ${u.name} (@${u.username}) — ${u.coins} coins`)
        .join("\n") || "No users yet.";
    ctx.reply(list);
  });

  bot.action("add_coins", (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    pendingAddCoins[ctx.from.id] = true;
    ctx.reply("➕ Send: userID amount (e.g., 123456789 50)");
  });

  // ─── Launch the Bot ─────────────────────────────────────────────────────────
  bot.launch();
  console.log("🤖 Bot is running...");
})();






