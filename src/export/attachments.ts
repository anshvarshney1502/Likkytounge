import type { Conversation } from "../shared/types";
import type { AttachmentBlob } from "../storage/provider";
import type { AttachmentFile } from "./archive";

/** Resolve stored attachment blobs into archive-ready files with correct paths. */
export async function resolveAttachmentFiles(
  conv: Conversation,
  blobs: AttachmentBlob[],
): Promise<AttachmentFile[]> {
  const pathById = new Map(
    conv.attachments.filter((a) => a.localPath).map((a) => [a.id, a.localPath as string]),
  );
  const files: AttachmentFile[] = [];
  for (const b of blobs) {
    const rel = pathById.get(b.attachmentId) ?? `attachments/${b.filename}`;
    const bytes = new Uint8Array(await b.blob.arrayBuffer());
    files.push({ relPath: rel, bytes });
  }
  return files;
}
