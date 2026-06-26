import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import Fuse from "fuse.js";

// ─── Mode detection ───────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || null;
let _col = null;

async function getCollection() {
  if (_col) return _col;
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db("memory-vault");
  _col = db.collection("memories");
  await _col.createIndex({ topic: 1 });
  await _col.createIndex({ createdAt: 1 });
  return _col;
}

// ─── File mode (local / Obsidian-compatible) ──────────────────────────────────
const VAULT_DIR = process.env.VAULT_DIR
  ? path.resolve(process.env.VAULT_DIR)
  : path.resolve(process.cwd(), "vault");

function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
}

function sanitizeTopic(topic) {
  const clean = (topic || "general")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "general";
}

function topicFilePath(topic) {
  return path.join(VAULT_DIR, `${sanitizeTopic(topic)}.md`);
}

function readTopicFile(topic) {
  const filePath = topicFilePath(topic);
  if (!fs.existsSync(filePath)) {
    return { data: { tags: [], updated: null }, content: "" };
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return matter(raw);
}

function writeTopicFile(topic, parsed) {
  ensureVaultDir();
  const filePath = topicFilePath(topic);
  const out = matter.stringify(parsed.content.trim() + "\n", parsed.data);
  fs.writeFileSync(filePath, out, "utf8");
  return filePath;
}

// ─── Unified API ──────────────────────────────────────────────────────────────

export async function saveMemory({ topic = "general", content, tags = [] }) {
  if (!content || !content.trim()) throw new Error("content is required.");
  const timestamp = new Date().toISOString();

  if (MONGODB_URI) {
    const c = await getCollection();
    await c.insertOne({
      topic: sanitizeTopic(topic),
      content: content.trim(),
      tags,
      createdAt: new Date(),
    });
    return { topic: sanitizeTopic(topic), timestamp };
  }

  // File mode
  ensureVaultDir();
  const parsed = readTopicFile(topic);
  const existingTags = new Set(parsed.data.tags || []);
  for (const t of tags) existingTags.add(t);
  parsed.data.tags = Array.from(existingTags);
  parsed.data.updated = timestamp;
  parsed.content = `${parsed.content.trim()}\n\n## ${timestamp}\n${content.trim()}\n`.trim();
  const filePath = writeTopicFile(topic, parsed);
  return { topic: sanitizeTopic(topic), filePath, timestamp };
}

export async function getMemory({ topic }) {
  if (!topic) throw new Error("topic is required.");

  if (MONGODB_URI) {
    const c = await getCollection();
    const docs = await c.find({ topic: sanitizeTopic(topic) }).sort({ createdAt: 1 }).toArray();
    if (!docs.length) return { topic: sanitizeTopic(topic), found: false, entries: [] };
    return {
      topic: sanitizeTopic(topic),
      found: true,
      entries: docs.map((d) => ({
        timestamp: d.createdAt.toISOString(),
        content: d.content,
        tags: d.tags,
      })),
    };
  }

  // File mode
  const parsed = readTopicFile(topic);
  if (!parsed.content) return { topic: sanitizeTopic(topic), found: false, tags: [], entries: [] };
  return {
    topic: sanitizeTopic(topic),
    found: true,
    tags: parsed.data.tags || [],
    updated: parsed.data.updated || null,
    raw: parsed.content,
  };
}

export async function listMemories() {
  if (MONGODB_URI) {
    const c = await getCollection();
    const topics = await c.distinct("topic");
    // Get latest entry per topic for the updated timestamp
    const result = await Promise.all(
      topics.map(async (t) => {
        const latest = await c.findOne({ topic: t }, { sort: { createdAt: -1 } });
        return { topic: t, tags: latest?.tags || [], updated: latest?.createdAt?.toISOString() || null };
      })
    );
    return result;
  }

  // File mode
  ensureVaultDir();
  const files = fs.readdirSync(VAULT_DIR).filter((f) => f.endsWith(".md"));
  return files.map((file) => {
    const topic = file.replace(/\.md$/, "");
    const parsed = readTopicFile(topic);
    return { topic, tags: parsed.data.tags || [], updated: parsed.data.updated || null };
  });
}

export async function searchMemory({ query, topic = null, limit = 8 }) {
  if (MONGODB_URI) {
    const c = await getCollection();
    const filter = topic ? { topic: sanitizeTopic(topic) } : {};
    const all = await c.find(filter).toArray();
    if (!query || !query.trim()) return all.slice(0, limit).map((d) => ({
      topic: d.topic, timestamp: d.createdAt.toISOString(), text: d.content, tags: d.tags,
    }));
    const fuse = new Fuse(all, {
      keys: ["content", "topic", "tags"],
      includeScore: true,
      threshold: 0.6,
      ignoreLocation: true,
    });
    return fuse.search(query).slice(0, limit).map((r) => ({
      topic: r.item.topic,
      timestamp: r.item.createdAt.toISOString(),
      text: r.item.content,
      tags: r.item.tags,
      score: r.score,
    }));
  }

  // File mode
  ensureVaultDir();
  const files = fs.readdirSync(VAULT_DIR)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !topic || f === `${sanitizeTopic(topic)}.md`);

  const corpus = [];
  for (const file of files) {
    const t = file.replace(/\.md$/, "");
    const parsed = readTopicFile(t);
    const sections = parsed.content.split(/^## /m).map((s) => s.trim()).filter(Boolean);
    for (const section of sections) {
      const [tsLine, ...rest] = section.split("\n");
      corpus.push({ topic: t, timestamp: tsLine?.trim() || null, text: rest.join("\n").trim() || tsLine });
    }
  }

  if (!query || !query.trim()) return corpus.slice(0, limit);
  const fuse = new Fuse(corpus, {
    keys: ["text", "topic"],
    includeScore: true,
    threshold: 0.6,
    ignoreLocation: true,
  });
  return fuse.search(query).slice(0, limit).map((r) => ({ ...r.item, score: r.score }));
}

export async function deleteTopic({ topic }) {
  if (!topic) throw new Error("topic is required.");

  if (MONGODB_URI) {
    const c = await getCollection();
    const result = await c.deleteMany({ topic: sanitizeTopic(topic) });
    return { topic: sanitizeTopic(topic), deleted: result.deletedCount > 0 };
  }

  // File mode
  const filePath = topicFilePath(topic);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return { topic: sanitizeTopic(topic), deleted: true };
  }
  return { topic: sanitizeTopic(topic), deleted: false };
}

export { VAULT_DIR };