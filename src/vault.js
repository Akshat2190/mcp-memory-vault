import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import Fuse from "fuse.js";

/**
 * VAULT STRUCTURE (Obsidian-compatible):
 *
 *   vault/
 *     flux-project.md
 *     personal-context.md
 *     preferences.md
 *
 * Each file = one "topic". Inside a topic file, entries are appended as
 * dated sections under a markdown heading, e.g.:
 *
 *   ---
 *   tags: [flux, backend]
 *   updated: 2026-06-26
 *   ---
 *
 *   ## 2026-06-26T10:32:00Z
 *   Decided to use Redis TTL expiry instead of proactive cache deletion
 *   for RBAC role changes, to avoid extra write load.
 *
 *   ## 2026-06-21T08:10:00Z
 *   Render free tier is the only viable no-cost backend host; mitigation
 *   is a keep-warm ping every 10-14 minutes.
 *
 * Because it's just plain .md files with YAML frontmatter, you can open
 * the same VAULT_DIR folder directly in Obsidian to browse/edit visually.
 */

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

/**
 * Append a new dated entry to a topic file. Creates the file if needed.
 */
export function saveMemory({ topic = "general", content, tags = [] }) {
  if (!content || !content.trim()) {
    throw new Error("content is required to save a memory.");
  }
  ensureVaultDir();
  const parsed = readTopicFile(topic);
  const timestamp = new Date().toISOString();

  const existingTags = new Set(parsed.data.tags || []);
  for (const t of tags) existingTags.add(t);

  parsed.data.tags = Array.from(existingTags);
  parsed.data.updated = timestamp;

  const entryHeading = `## ${timestamp}`;
  parsed.content = `${parsed.content.trim()}\n\n${entryHeading}\n${content.trim()}\n`.trim();

  const filePath = writeTopicFile(topic, parsed);
  return { topic: sanitizeTopic(topic), filePath, timestamp };
}

/**
 * Return the full contents (frontmatter + entries) of one topic.
 */
export function getMemory({ topic }) {
  if (!topic) throw new Error("topic is required.");
  const parsed = readTopicFile(topic);
  if (!parsed.content) {
    return { topic: sanitizeTopic(topic), found: false, tags: [], entries: [] };
  }
  return {
    topic: sanitizeTopic(topic),
    found: true,
    tags: parsed.data.tags || [],
    updated: parsed.data.updated || null,
    raw: parsed.content,
  };
}

/**
 * List every topic currently in the vault, with tags + last-updated.
 */
export function listMemories() {
  ensureVaultDir();
  const files = fs.readdirSync(VAULT_DIR).filter((f) => f.endsWith(".md"));
  return files.map((file) => {
    const topic = file.replace(/\.md$/, "");
    const parsed = readTopicFile(topic);
    return {
      topic,
      tags: parsed.data.tags || [],
      updated: parsed.data.updated || null,
    };
  });
}

/**
 * Search across all topics. Splits each topic file into individual
 * "## timestamp" entries and fuzzy-searches across them, so results are
 * specific snippets rather than whole files.
 */
export function searchMemory({ query, topic = null, limit = 8 }) {
  ensureVaultDir();
  const files = fs
    .readdirSync(VAULT_DIR)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !topic || f === `${sanitizeTopic(topic)}.md`);

  const corpus = [];
  for (const file of files) {
    const t = file.replace(/\.md$/, "");
    const parsed = readTopicFile(t);
    const sections = parsed.content
      .split(/^## /m)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const section of sections) {
      const [tsLine, ...rest] = section.split("\n");
      corpus.push({
        topic: t,
        timestamp: tsLine?.trim() || null,
        text: rest.join("\n").trim() || tsLine,
      });
    }
  }

  if (!query || !query.trim()) {
    return corpus.slice(0, limit);
  }

  const fuse = new Fuse(corpus, {
    keys: ["text", "topic"],
    includeScore: true,
    threshold: 0.6, // higher = more lenient fuzzy matching
    ignoreLocation: true, // match anywhere in the text, not just near the start
  });

  return fuse
    .search(query)
    .slice(0, limit)
    .map((r) => ({ ...r.item, score: r.score }));
}

/**
 * Delete an entire topic file. Use sparingly — this is destructive.
 */
export function deleteTopic({ topic }) {
  if (!topic) throw new Error("topic is required.");
  const filePath = topicFilePath(topic);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return { topic: sanitizeTopic(topic), deleted: true };
  }
  return { topic: sanitizeTopic(topic), deleted: false };
}

export { VAULT_DIR };
