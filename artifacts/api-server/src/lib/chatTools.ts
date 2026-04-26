// JSON-Schema definitions for the four tools AI OPHNM can propose. We send
// these to OpenAI as the chat-completion `tools` parameter; the model
// responds with a `tool_calls` block whose arguments we surface to the
// recruiter as a confirmation card. Tools are NEVER executed without
// explicit "Yes" confirmation from the user.
//
// Schema fields are intentionally narrow (string/email/array of email) so
// the action endpoints can revalidate the same shape without trusting the
// model's output.

export type ChatToolName =
  | "book_meeting"
  | "send_brief"
  | "alert_john"
  | "share_with_panel";

export const CHAT_TOOL_NAMES: ChatToolName[] = [
  "book_meeting",
  "send_brief",
  "alert_john",
  "share_with_panel",
];

export const CHAT_TOOLS = [
  {
    type: "function",
    function: {
      name: "book_meeting",
      description:
        "Book a meeting with John when the recruiter has provided their name, email, company, and a proposed date/time. Always confirm the slot back in chat before calling this tool.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Recruiter's full name." },
          email: { type: "string", description: "Recruiter's email address." },
          company: { type: "string", description: "Recruiter's company." },
          proposedTime: {
            type: "string",
            description:
              "Proposed meeting time in plain language (e.g. 'Tuesday May 5, 2026, 2pm UTC'). Always restate the time before calling.",
          },
          topic: {
            type: "string",
            description: "1-line meeting topic or role being discussed.",
          },
        },
        required: ["name", "email", "company", "proposedTime", "topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_brief",
      description:
        "Generate and email a tailored one-page PDF brief to the recruiter. Ask the recruiter for two things first: (1) the role focus / domain they're hiring for and (2) their hiring timeline.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          email: { type: "string", description: "Recruiter's email address." },
          name: { type: "string", description: "Recruiter's name (optional)." },
          company: { type: "string", description: "Recruiter's company (optional)." },
          roleFocus: {
            type: "string",
            description:
              "Short phrase summarising the role focus (e.g. 'ERP transformation lead', 'Head of Engineering — fintech').",
          },
          timeline: {
            type: "string",
            description:
              "Hiring timeline (e.g. 'Q3 start', 'asap', 'exploratory in 6 months').",
          },
        },
        required: ["email", "roleFocus", "timeline"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "alert_john",
      description:
        "Send John an immediate hot-lead alert when the recruiter says they want to speak directly. Requires the recruiter's email + company + role being filled.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          email: { type: "string", description: "Recruiter's email." },
          company: { type: "string", description: "Recruiter's company." },
          role: { type: "string", description: "Role they are hiring for." },
          note: {
            type: "string",
            description: "1-3 sentences of context the recruiter wants John to see.",
          },
        },
        required: ["email", "company", "role"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "share_with_panel",
      description:
        "Email a curated pitch (proof projects + brief link) to 1-3 panellists. Confirm each address back in chat before calling.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          panelEmails: {
            type: "array",
            description: "1-3 panellist email addresses.",
            minItems: 1,
            maxItems: 3,
            items: { type: "string" },
          },
          senderEmail: {
            type: "string",
            description: "Recruiter's own email so John can reply directly.",
          },
          senderName: { type: "string", description: "Recruiter's name (optional)." },
          note: {
            type: "string",
            description: "Optional 1-3 sentence note from the recruiter to the panel.",
          },
          roleFocus: {
            type: "string",
            description: "Role focus to tailor the pitch around.",
          },
        },
        required: ["panelEmails", "senderEmail", "roleFocus"],
      },
    },
  },
];

export function isChatToolName(s: string): s is ChatToolName {
  return (CHAT_TOOL_NAMES as string[]).includes(s);
}
