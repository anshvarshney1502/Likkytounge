import type { AdapterModule, ChatAdapter, AdapterMeta } from "../base/adapter";
import { BaseAdapter } from "../base/adapter";
import type { ChatMessage } from "../../shared/types";
import { anyPresent } from "../base/role-parser";
import { CLAUDE_SELECTORS as S } from "./selectors";
import { getClaudeMessages, getClaudeMeta } from "./parser";

class ClaudeAdapter extends BaseAdapter {
  readonly id = "claude";
  readonly label = "Claude";

  getConversationMetadata(): AdapterMeta {
    return getClaudeMeta(this.doc, this.url);
  }

  getMessages(): ChatMessage[] {
    return getClaudeMessages(this.doc, this.url);
  }

  isStreaming(): boolean {
    return anyPresent(this.doc, S.streaming);
  }
}

export const claudeModule: AdapterModule = {
  id: "claude",
  label: "Claude",
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
    return new ClaudeAdapter(doc, url);
  },
};
