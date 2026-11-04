import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { CustomFile } from "telegram/client/uploads.js";
import { Logger } from "telegram/extensions/Logger.js";
import dotenv from "dotenv";

const isDev = process.env.NODE_ENV === "development";
dotenv.config({
  path: !isDev ? ".env" : ".env.local",
});

// Silence verbose GramJS logging to save memory & log output overhead
Logger.setLevel("error");

let client = null;

export async function initTelegramClient() {
  if (client) return client;

  const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const botToken = process.env.BOT_TOKEN;

  if (!apiId || !apiHash || !botToken) {
    console.warn("⚠️ GramJS MTProto client missing TELEGRAM_API_ID, TELEGRAM_API_HASH, or BOT_TOKEN.");
    return null;
  }

  try {
    console.log("🔌 Connecting GramJS MTProto client...");
    const stringSession = new StringSession("");
    client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 5,
      retryDelay: 1000,
      autoReconnect: true,
      baseLogger: new Logger("error"),
    });

    await client.start({
      botAuthToken: botToken,
    });

    console.log("✅ GramJS MTProto client connected successfully.");
    return client;
  } catch (err) {
    console.error("❌ Failed to initialize GramJS MTProto client:", err);
    client = null;
    return null;
  }
}

export function getTelegramClient() {
  return client;
}

export async function sendPhotoToChannel(chatId, imageInput, caption) {
  try {
    if (!client) {
      await initTelegramClient();
    }
    if (!client) {
      throw new Error("GramJS MTProto client is not connected");
    }

    let fileToUpload = imageInput;

    if (Buffer.isBuffer(imageInput)) {
      fileToUpload = new CustomFile(
        "price.png",
        imageInput.length,
        "",
        imageInput
      );
    } else if (typeof imageInput === "string" && imageInput.startsWith("data:image")) {
      const base64Data = imageInput.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");
      fileToUpload = new CustomFile(
        "price.png",
        buffer.length,
        "",
        buffer
      );
    }

    const target = typeof chatId === "number" ? BigInt(chatId) : chatId;

    return await client.sendFile(target, {
      file: fileToUpload,
      caption: caption || "",
      parseMode: "html",
    });
  } catch (error) {
    console.error(`❌ GramJS sendPhoto error for chat ${chatId}:`, error);
    throw error;
  }
}

export async function sendMessageToChannel(chatId, text) {
  try {
    if (!client) {
      await initTelegramClient();
    }
    if (!client) {
      throw new Error("GramJS MTProto client is not connected");
    }

    const target = typeof chatId === "number" ? BigInt(chatId) : chatId;

    return await client.sendMessage(target, {
      message: text,
      parseMode: "html",
    });
  } catch (error) {
    console.error(`❌ GramJS sendMessage error for chat ${chatId}:`, error);
    throw error;
  }
}
