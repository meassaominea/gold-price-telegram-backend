import { Telegraf, Markup } from "telegraf";
import dotenv from "dotenv";

const isDev = process.env.NODE_ENV === "development";

dotenv.config({
  path: !isDev ? ".env" : ".env.local",
});

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. Command to open the Mini App
bot.command("start", (ctx) => {
  return ctx.reply(
    "Welcome! Tap the button below to open app.",

    Markup.inlineKeyboard([
      Markup.button.url("Open App", process.env.WEBAPP_URL),
    ]),
  );
});

// Get latest chatId from anyone
bot.on(["message", "channel_post"], async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const chatTitle =
      ctx.chat.title || ctx.chat.username || ctx.chat.first_name || "Unknown";
    const chatType = ctx.chat.type;

    // Dynamically import store to avoid circular deps or top-level await issues if any
    const { saveChat } = await import("./store.js");
    await saveChat(chatId, chatTitle, chatType);
  } catch (err) {
    console.error("Failed to save chat info:", err);
  }
});

bot.launch();
console.log("Bot is running...");

export default bot;
