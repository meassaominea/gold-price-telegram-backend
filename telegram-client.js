import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { CustomFile } from "telegram/client/uploads.js";
import { Logger } from "telegram/extensions/Logger.js";
import dotenv from "dotenv";

const isDev = process.env.NODE_ENV === "development";
dotenv.config({
  path: !isDev ? ".env" : ".env.local",
});

let client = null;

export async function initTelegramClient() {
  if (client) return client;

  const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const botToken = process.env.BOT_TOKEN;

  if (!apiId || !apiHash || !botToken) {
    console.warn(
      "⚠️ GramJS MTProto client missing TELEGRAM_API_ID, TELEGRAM_API_HASH, or BOT_TOKEN.",
    );
    return null;
  }

  try {
    console.log("🔌 Connecting GramJS MTProto client...");
    const stringSession = new StringSession("");
    client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 5,
      retryDelay: 1000,
      autoReconnect: true,
      baseLogger: new Logger("none"),
    });
    client.setLogLevel("none");

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

import bot from "./bot.js";

/**
 * Timeout helper: Rejects if the promise doesn't resolve within ms milliseconds
 */
function withTimeout(promise, ms, errorMsg) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMsg || `Operation timed out after ${ms}ms`));
    }, ms);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function toTelegrafPhotoSource(imageInput) {
  if (Buffer.isBuffer(imageInput)) {
    return { source: imageInput };
  }
  if (typeof imageInput === "string" && imageInput.startsWith("data:image")) {
    const base64Data = imageInput.split(",")[1];
    return { source: Buffer.from(base64Data, "base64") };
  }
  return imageInput;
}

/**
 * GramJS MTProto sendPhoto
 */
async function sendPhotoViaGramJS(chatId, imageInput, caption) {
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
      imageInput,
    );
  } else if (
    typeof imageInput === "string" &&
    imageInput.startsWith("data:image")
  ) {
    const base64Data = imageInput.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    fileToUpload = new CustomFile("price.png", buffer.length, "", buffer);
  }

  const target = typeof chatId === "number" ? BigInt(chatId) : chatId;

  return await client.sendFile(target, {
    file: fileToUpload,
    caption: caption || "",
    parseMode: "html",
  });
}

/**
 * GramJS MTProto sendMessage
 */
async function sendMessageViaGramJS(chatId, text) {
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
}

/**
 * Send photo: tries standard Telegram Bot API first (10s timeout),
 * then falls back to GramJS MTProto client.
 */
export async function sendPhotoToChannel(chatId, imageInput, caption) {
  const timeoutMs = 10000;

  try {
    const photoSource = toTelegrafPhotoSource(imageInput);
    return await withTimeout(
      bot.telegram.sendPhoto(chatId, photoSource, {
        caption: caption || "",
        parse_mode: "HTML",
      }),
      timeoutMs,
      `Telegram Bot API sendPhoto timed out after ${timeoutMs / 1000}s`,
    );
  } catch (apiError) {
    console.warn(
      `⚠️ Telegram Bot API sendPhoto failed (${apiError.message}). Falling back to GramJS MTProto...`,
    );
    try {
      return await sendPhotoViaGramJS(chatId, imageInput, caption);
    } catch (gramError) {
      console.error(
        `❌ Both Telegram Bot API and GramJS failed for chat ${chatId}:`,
        gramError,
      );
      throw gramError;
    }
  }
}

/**
 * Send message: tries standard Telegram Bot API first (10s timeout),
 * then falls back to GramJS MTProto client.
 */
export async function sendMessageToChannel(chatId, text) {
  const timeoutMs = 10000;

  try {
    return await withTimeout(
      bot.telegram.sendMessage(chatId, text, {
        parse_mode: "HTML",
      }),
      timeoutMs,
      `Telegram Bot API sendMessage timed out after ${timeoutMs / 1000}s`,
    );
  } catch (apiError) {
    console.warn(
      `⚠️ Telegram Bot API sendMessage failed (${apiError.message}). Falling back to GramJS MTProto...`,
    );
    try {
      return await sendMessageViaGramJS(chatId, text);
    } catch (gramError) {
      console.error(
        `❌ Both Telegram Bot API and GramJS failed for chat ${chatId}:`,
        gramError,
      );
      throw gramError;
    }
  }
}
