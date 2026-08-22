import type { AdapterModule, ChatAdapter, AdapterMeta } from "../base/adapter";
import { BaseAdapter } from "../base/adapter";
import type { ChatMessage } from "../../shared/types";
import { anyPresent } from "../base/role-parser";
import { GEMINI_SELECTORS as S } from "./selectors";
import { getGeminiMessages, getGeminiMeta } from "./parser";

class GeminiAdapter extends BaseAdapter {
  readonly id = "gemini";
  readonly label = "Gemini";

  getConversationMetadata(): AdapterMeta {
    return getGeminiMeta(this.doc, this.url);
  }

  getMessages(): ChatMessage[] {
    return getGeminiMessages(this.doc, this.url);
  }

  isStreaming(): boolean {
    return anyPresent(this.doc, S.streaming);
  }
}

export const geminiModule: AdapterModule = {
  id: "gemini",
  label: "Gemini",
  generic: false,
  matches(url: string): boolean {
    try {
      const h = new URL(url).hostname;
      return S.hosts.some((host) => h === host || h.endsWith("." + host));
    } catch {
      return false;
    }
  },
  create(doc: Document, url: string): ChatAdapter {
    return new GeminiAdapter(doc, url);
  },
};
