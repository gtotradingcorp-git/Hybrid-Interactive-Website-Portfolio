export interface SseToolCallDelta {
  index: number;
  id?: string;
  name?: string;
  argumentsDelta?: string;
}

export interface SseChatChunk {
  content?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  // Streaming tool-call deltas, when the model is using OpenAI tool-calling.
  // The chat route accumulates these into a single tool-call payload before
  // forwarding to the client as a confirmable action card.
  toolCalls?: SseToolCallDelta[];
  // OpenAI's terminal `finish_reason` — e.g. "tool_calls", "stop", "length".
  finishReason?: string;
}

/**
 * Incrementally parses an OpenAI-style chat completion SSE stream.
 *
 * The OpenAI streaming protocol writes one logical event per line of the form
 * `data: <json>\n`, terminated by `data: [DONE]\n`. Network chunks may split a
 * JSON payload across multiple `push()` calls, so this parser buffers partial
 * lines and only emits an event once a full `\n`-terminated line is available.
 *
 * The parser silently ignores:
 *   - the `[DONE]` sentinel
 *   - lines that don't start with `data:`
 *   - malformed JSON payloads
 */
export class SseChatParser {
  private buffer = "";
  private decoder = new TextDecoder();

  push(chunk: Uint8Array | string): SseChatChunk[] {
    const text =
      typeof chunk === "string"
        ? chunk
        : this.decoder.decode(chunk, { stream: true });
    this.buffer += text;

    const out: SseChatChunk[] = [];
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            finish_reason?: string;
          }>;
          usage?: SseChatChunk["usage"];
        };
        const result: SseChatChunk = {};
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) result.content = content;
        const tcs = parsed.choices?.[0]?.delta?.tool_calls;
        if (Array.isArray(tcs) && tcs.length > 0) {
          result.toolCalls = tcs.map((tc) => ({
            index: typeof tc.index === "number" ? tc.index : 0,
            id: tc.id,
            name: tc.function?.name,
            argumentsDelta: tc.function?.arguments,
          }));
        }
        const fr = parsed.choices?.[0]?.finish_reason;
        if (typeof fr === "string" && fr) result.finishReason = fr;
        if (parsed.usage) result.usage = parsed.usage;
        if (
          result.content !== undefined ||
          result.usage !== undefined ||
          result.toolCalls !== undefined ||
          result.finishReason !== undefined
        ) {
          out.push(result);
        }
      } catch {
        // Ignore malformed SSE payloads.
      }
    }
    return out;
  }
}
