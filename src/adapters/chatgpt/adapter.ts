import type { AdapterModule, ChatAdapter, AdapterMeta } from "../base/adapter";
import { BaseAdapter } from "../base/adapter";
import type { ChatMessage } from "../../shared/types";
import { anyPresent } from "../base/role-parser";
import { CHATGPT_SELECTORS as S } from "./selectors";
import { getChatGptMessages, getChatGptMeta } from "./parser";

class ChatGptAdapter extends BaseAdapter {
  readonly id = "chatgpt";
  readonly label = "ChatGPT";

  getConversationMetadata(): AdapterMeta {
    return getChatGptMeta(this.doc, this.url);
  }

  getMessages(): ChatMessage[] {
    return getChatGptMessages(this.doc, this.url);
  }

  isStreaming(): boolean {
    return anyPresent(this.doc, S.streaming);
  }
}

export const chatgptModule: AdapterModule = {
  id: "chatgpt",
  label: "ChatGPT",
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
    return new ChatGptAdapter(doc, url);
  },
};
