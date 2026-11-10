import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR || __dirname;

const CLIENTS_FILE = path.join(DATA_DIR, "clients.json");
const CHATS_FILE = path.join(DATA_DIR, "chats.json");
const TEMPLATES_FILE = path.join(DATA_DIR, "templates.json");

async function ensureFile(filePath, defaultContent) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    // If copying from an existing bundled file in the root project directory
    const baseName = path.basename(filePath);
    const initialSourceFile = path.join(__dirname, baseName);
    if (filePath !== initialSourceFile) {
      try {
        const initialData = await fs.readFile(initialSourceFile);
        await fs.writeFile(filePath, initialData);
        return;
      } catch {
        // Fallback to defaultContent if source file doesn't exist
      }
    }
    await fs.writeFile(filePath, JSON.stringify(defaultContent, null, 2));
  }
}

export async function initStore() {
  await ensureFile(CLIENTS_FILE, []);
  await ensureFile(CHATS_FILE, []);
  await ensureFile(TEMPLATES_FILE, []);
}

export async function getClients() {
  const data = await fs.readFile(CLIENTS_FILE, "utf-8");
  return JSON.parse(data);
}

export async function saveClients(clients) {
  await fs.writeFile(CLIENTS_FILE, JSON.stringify(clients, null, 2));
}

export async function getClientByToken(token) {
  const clients = await getClients();
  return clients.find((c) => c.authToken === token);
}

export async function getClientById(id) {
  const clients = await getClients();
  return clients.find((c) => c.clientId === id);
}

export async function updateClient(id, updates) {
  const clients = await getClients();
  const index = clients.findIndex((c) => c.clientId === id);
  if (index !== -1) {
    clients[index] = { ...clients[index], ...updates };
    await saveClients(clients);
    return clients[index];
  }
  return null;
}

export async function getChats() {
  const data = await fs.readFile(CHATS_FILE, "utf-8");
  return JSON.parse(data);
}

export async function saveChat(chatId, title, type) {
  const chats = await getChats();
  const existing = chats.find((c) => c.chatId === chatId);
  if (existing) {
    if (existing.title !== title) {
      existing.title = title;
      await fs.writeFile(CHATS_FILE, JSON.stringify(chats, null, 2));
    }
  } else {
    chats.push({ chatId, title, type });
    await fs.writeFile(CHATS_FILE, JSON.stringify(chats, null, 2));
  }
}

let templatesCache = null;

export async function getTemplate(clientId) {
  if (!templatesCache) {
    const data = await fs.readFile(TEMPLATES_FILE, "utf-8");
    templatesCache = JSON.parse(data);
  }
  return templatesCache.find(t => t.clientId === clientId);
}

export async function saveTemplate(clientId, config) {
  let templates = templatesCache;
  if (!templates) {
    const data = await fs.readFile(TEMPLATES_FILE, "utf-8");
    templates = JSON.parse(data);
  }
  const index = templates.findIndex(t => t.clientId === clientId);
  if (index !== -1) {
    templates[index] = { ...templates[index], ...config };
  } else {
    templates.push({ clientId, ...config });
  }
  templatesCache = templates;
  await fs.writeFile(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
}
