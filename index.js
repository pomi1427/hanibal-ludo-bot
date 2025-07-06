const { Telegraf, Markup } = require("telegraf");
const express = require("express");
require("dotenv").config();
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");

// ─── Server Keep‑Alive ────────────────────────────────────────────────────────
const app = express();
app.get("/", (_req, res) => res.send("🤖 Hanibal Bot is alive!"));
app.listen(3000, () => console.log("🌐 Web server running on port 3000"));

// ─── Constants ────────────────────────────────────────────────────────────────
const ADMIN_ID = process.env.ADMIN_ID;
const COIN_VALUE_BIRR = 1;

// ─── LowDB Setup ──────────────────────────────────────────────────────────────
const adapter = new JSONFile("db.json");
const db = new Low(adapter, { users: [], withdrawals: [], deposits: [] });

// ─── In‑Memory States ─────────────────────────────────────────────────────────
const pendingOTPs = {};
const pendingDeposits = {};
const pendingWithdrawals = {};
const pendingAddCoins = {};

(async () => {
  // Ensure DB file exists
  await db.read();
  await db.write();

  const bot = new Telegraf(process.env.BOT_TOKEN);

  // ─── /start ─────────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    const name = ctx.from.first_name;
    // Build the base menu
    const menu = [
      ["💰 Deposit Money", "💸 Withdraw Money"],
      ["💼 Check Balance", "📝 Register"],
      ["📢 Referral Link", "🔍 My ID"],
      ["💱 Coin Rates"],
    ];

    // If the user is admin, add the Admin button
    if (ctx.from.id.toString() === ADMIN_ID) {
      menu.push(["🛠 Admin"]);
    }

    ctx.reply(
      `👋 Welcome, ${name}!\n💰 1 Coin = ${COIN_VALUE_BIRR} Birr\nUse the menu below:`,
      Markup.keyboard(menu).resize()
    );
  });

  // ─── Admin button handler ───────────────────────────────────────────────────
  bot.hears("🛠 Admin", (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    ctx.reply(
      "🛠 Admin Tools",
      Markup.inlineKeyboard([
        [Markup.button.callback("📋 View Users", "view_users")],
        [Markup.button.callback("📄 View Deposits", "view_deposits")],
        [Markup.button.callback("📄 View Withdrawals", "view_withdrawals")],
        [Markup.button.callback("➕ Add Coins", "add_coins")],
      ])
    );
  });

  // ─── Coin Rates, My ID, Register ────────────────────────────────────────────
  bot.hears("💱 Coin Rates", (ctx) =>
    ctx.reply(`💰 1 Coin = ${COIN_VALUE_BIRR} Birr`)
  );
  bot.hears("🔍 My ID", (ctx) =>
    ctx.reply(`🆔 Your Telegram ID is: ${ctx.from.id}`)
  );
  bot.hears("📝 Register", async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    if (db.data.users.find((u) => u.id === id)) {
      return ctx.reply("✅ You are already registered.");
    }
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    pendingOTPs[id] = otp;
    ctx.reply(`📨 Your OTP is: ${otp}\nPlease reply with it to register.`);
  });

  // ─── Core text handler ──────────────────────────────────────────────────────
  bot.on("text", async (ctx, next) => {
    const id = ctx.from.id;
    const txt = ctx.message.text.trim();
    const name = ctx.from.first_name;
    const username = ctx.from.username || "none";

    // OTP
    if (pendingOTPs[id]) {
      if (txt === pendingOTPs[id]) {
        await db.read();
        db.data.users.push({ id, name, username, coins: 0, referredBy: null });
        delete pendingOTPs[id];
        await db.write();
        return ctx.reply("✅ Registration complete! You have 0 coins.");
      } else {
        return ctx.reply("❗ Wrong OTP. Try again.");
      }
    }

    // Deposit request
    if (pendingDeposits[id]) {
      const amt = parseFloat(txt);
      if (isNaN(amt) || amt <= 0) {
        delete pendingDeposits[id];
        return ctx.reply("❗ Invalid amount.");
      }
      await db.read();
      db.data.deposits.push({ userId: id, username, amount: amt, status: "pending" });
      delete pendingDeposits[id];
      await db.write();
      ctx.reply(`💸 Deposit of ${amt} coins requested. Awaiting admin.`);
      if (ADMIN_ID) {
        const idx = db.data.deposits.length - 1;
        await bot.telegram.sendMessage(
          ADMIN_ID,
          `📥 Deposit #${idx} from @${username} Amount: ${amt}`,
          Markup.inlineKeyboard([
            Markup.button.callback(`✅ Approve #${idx}`, `approve_d_${idx}`),
            Markup.button.callback(`❌ Decline #${idx}`, `decline_d_${idx}`)
          ])
        );
      }
      return;
    }

    // Withdrawal request
    if (pendingWithdrawals[id]) {
      const amt = parseFloat(txt);
      await db.read();
      const user = db.data.users.find((u) => u.id === id);
      if (isNaN(amt) || amt <= 0 || !user || user.coins < amt) {
        delete pendingWithdrawals[id];
        return ctx.reply("❗ Invalid or insufficient balance.");
      }
      db.data.withdrawals.push({ userId: id, username, amount: amt, status: "pending" });
      delete pendingWithdrawals[id];
      await db.write();
      ctx.reply(`💸 Withdrawal of ${amt} coins requested. Awaiting admin.`);
      if (ADMIN_ID) {
        const idx = db.data.withdrawals.length - 1;
        await bot.telegram.sendMessage(
          ADMIN_ID,
          `📤 Withdrawal #${idx} @${username} Amount: ${amt}`,
          Markup.inlineKeyboard([
            Markup.button.callback(`✅ Approve #${idx}`, `approve_w_${idx}`),
            Markup.button.callback(`❌ Decline #${idx}`, `decline_w_${idx}`)
          ])
        );
      }
      return;
    }

    // Admin add coins
    if (pendingAddCoins[id]) {
      const [tid, coins] = txt.split(" ");
      const amt = parseInt(coins, 10);
      delete pendingAddCoins[id];
      await db.read();
      const u = db.data.users.find((u) => u.id.toString() === tid);
      if (!u || isNaN(amt)) {
        return ctx.reply("❗ Format: userID amount");
      }
      u.coins += amt;
      await db.write();
      return ctx.reply(`✅ Added ${amt} coins to ${u.name}`);
    }

    return next();
  });

  // ─── Other Listeners ─────────────────────────────────────────────────────────
  bot.hears("💼 Check Balance", async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    const u = db.data.users.find((u) => u.id === id);
    if (!u) return ctx.reply("❗ Register first with 📝 Register.");
    ctx.reply(`💰 Balance: ${u.coins} coins`);
  });

  bot.hears("📢 Referral Link", async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    if (!db.data.users.find((u) => u.id === id)) {
      return ctx.reply("❗ Register first with 📝 Register.");
    }
    const link = `https://t.me/${bot.botInfo.username}?start=${id}`;
    ctx.reply(`📢 Share this link:\n${link}`);
  });

  bot.hears("💰 Deposit Money", (ctx) => {
    const id = ctx.from.id;
    pendingDeposits[id] = true;
    ctx.reply("💸 Enter how many coins to deposit:");
  });

  bot.hears("💸 Withdraw Money", (ctx) => {
    const id = ctx.from.id;
    pendingWithdrawals[id] = true;
    ctx.reply("💸 Enter how many coins to withdraw:");
  });

  // ─── Admin Inline Handlers ──────────────────────────────────────────────────
  bot.action("view_users", async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await db.read();
    const list =
      db.data.users
        .map((u) => `👤 ${u.name} (@${u.username}) — ${u.coins} coins`)
        .join("\n") || "No users.";
    ctx.reply(list);
  });

  bot.action("view_deposits", async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await db.read();
    const list =
      db.data.deposits
        .map((d, i) => `${i}. @${d.username} — ${d.amount} coins — ${d.status}`)
        .filter((l) => l.includes("pending"))
        .join("\n") || "No pending deposits.";
    ctx.reply(list);
  });

  bot.action("approve_d_(\\d+)", async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const idx = parseInt(ctx.match[1], 10);
    await db.read();
    const d = db.data.deposits[idx];
    if (!d || d.status !== "pending") return ctx.reply("Invalid request.");
    d.status = "approved";
    const u = db.data.users.find((u) => u.id === d.userId);
    if (u) u.coins += d.amount;
    await db.write();
    await ctx.reply(`✅ Deposit #${idx} approved.`);
    await bot.telegram.sendMessage(d.userId, `✅ Your deposit of ${d.amount} coins was approved.`);
  });

  bot.action("decline_d_(\\d+)", async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const idx = parseInt(ctx.match[1], 10);
    await db.read();
    const d = db.data.deposits[idx];
    if (!d || d.status !== "pending") return ctx.reply("Invalid request.");
    d.status = "declined";
    await db.write();
    await ctx.reply(`❌ Deposit #${idx} declined.`);
    await bot.telegram.sendMessage(d.userId, `❌ Your deposit of ${d.amount} coins was declined.`);
  });

  // ─── Launch Bot ─────────────────────────────────────────────────────────────
  bot.launch();
  console.log("🤖 Bot is running...");
})();
