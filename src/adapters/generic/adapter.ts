import type { AdapterModule, ChatAdapter, AdapterMeta } from "../base/adapter";
import { BaseAdapter } from "../base/adapter";
import type { ChatMessage } from "../../shared/types";
import { anyPresent } from "../base/role-parser";
import { GENERIC_SELECTORS as S } from "./selectors";
import { getGenericMessages, getGenericMeta } from "./parser";

class GenericAdapter extends BaseAdapter {
  readonly id = "generic";
  readonly label = "Generic";
  override readonly generic = true;

  getConversationMetadata(): AdapterMeta {
    return getGenericMeta(this.doc);
  }

  getMessages(): ChatMessage[] {
    return getGenericMessages(this.doc);
  }

  isStreaming(): boolean {
    return anyPresent(this.doc, S.streaming);
  }
}

export const genericModule: AdapterModule = {
  id: "generic",
  label: "Generic",
  generic: true,
  matches(): boolean {
    return true; // matches everything; used only as the last resort.
  },
  create(doc: Document, url: string): ChatAdapter {
    return new GenericAdapter(doc, url);
  },
};
