import { z } from "zod";
import {
  saveMemory,
  getMemory,
  listMemories,
  searchMemory,
  deleteTopic,
} from "./vault.js";

/**
 * Registers every memory tool onto a given McpServer instance.
 * Called once per server (stdio or HTTP) so both transports expose
 * an identical tool surface to Claude.
 */
export function registerMemoryTools(server) {
  server.tool(
    "save_memory",
    "Save a piece of context, a decision, or a fact to the persistent vault " +
      "under a topic (e.g. 'flux-project', 'preferences', 'personal-context'). " +
      "Use this whenever the user shares something worth remembering across " +
      "future conversations or accounts.",
    {
      topic: z
        .string()
        .describe(
          "Short topic/category for this memory, e.g. 'flux-project', " +
            "'preferences', 'personal-context'. Defaults to 'general'."
        )
        .optional(),
      content: z.string().describe("The actual text to remember."),
      tags: z
        .array(z.string())
        .describe("Optional tags for filtering later, e.g. ['redis', 'rbac'].")
        .optional(),
    },
    async ({ topic, content, tags }) => {
      // FIX: Added await because database write operations are asynchronous
      const result = await saveMemory({ topic, content, tags });
      return {
        content: [
          {
            type: "text",
            text: `Saved to topic "${result.topic}" at ${result.timestamp}.`,
          },
        ],
      };
    }
  );

  server.tool(
    "get_memory",
    "Retrieve everything saved under a specific topic, in full. Use this " +
      "when you need the complete history of a topic, not just a snippet.",
    {
      topic: z.string().describe("The topic to retrieve, e.g. 'flux-project'."),
    },
    async ({ topic }) => {
      // FIX: Added await to cleanly resolve the async read operation
      const result = await getMemory({ topic });
      if (!result.found) {
        return {
          content: [
            { type: "text", text: `No memory found for topic "${result.topic}".` },
          ],
        };
      }

      // Format response based on backend source mode (MongoDB entries array vs local raw file string)
      const outputText = result.raw 
        ? result.raw 
        : result.entries.map((d) => `[${d.timestamp}] ${d.content}`).join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Topic: ${result.topic}\nTags: ${(result.tags || []).join(", ") || "none"}\n\n${outputText}`,
          },
        ],
      };
    }
  );

  server.tool(
    "search_memory",
    "Fuzzy-search across all saved memories (or within one topic) for " +
      "relevant snippets. Use this at the start of a conversation, or " +
      "whenever the user references something from 'before' that isn't " +
      "already in context.",
    {
      query: z.string().describe("What to search for."),
      topic: z
        .string()
        .describe("Optional: restrict the search to a single topic.")
        .optional(),
      limit: z
        .number()
        .describe("Max number of results to return. Defaults to 8.")
        .optional(),
    },
    async ({ query, topic, limit }) => {
      // FIX: Added await to fetch search results from matching datasets
      const results = await searchMemory({ query, topic, limit });
      if (!results.length) {
        return { content: [{ type: "text", text: "No matching memories found." }] };
      }
      const formatted = results
        .map(
          (r, i) =>
            `${i + 1}. [${r.topic}] ${r.timestamp ? `(${r.timestamp}) ` : ""}${r.text}`
        )
        .join("\n\n");
      return { content: [{ type: "text", text: formatted }] };
    }
  );

  server.tool(
    "list_memory_topics",
    "List every topic currently stored in the vault, with tags and last-updated time. " +
      "Use this to get an overview before deciding what to search or retrieve.",
    {},
    async () => {
      // FIX: Added await to pull full array indices
      const topics = await listMemories();
      if (!topics.length) {
        return { content: [{ type: "text", text: "The vault is currently empty." }] };
      }
      const formatted = topics
        .map(
          (t) =>
            `- ${t.topic} (tags: ${(t.tags || []).join(", ") || "none"}, updated: ${t.updated || "never"})`
        )
        .join("\n");
      return { content: [{ type: "text", text: formatted }] };
    }
  );

  server.tool(
    "delete_memory_topic",
    "Permanently delete an entire topic from the vault. Destructive — only " +
      "use when the user explicitly asks to forget or delete something.",
    {
      topic: z.string().describe("The topic to delete entirely."),
    },
    async ({ topic }) => {
      // FIX: Added await to process mutations
      const result = await deleteTopic({ topic });
      return {
        content: [
          {
            type: "text",
            text: result.deleted
              ? `Deleted topic "${result.topic}".`
              : `Topic "${result.topic}" did not exist.`,
          },
        ],
      };
    }
  );
}