// jsdom's Blob implementation lacks arrayBuffer()/text()/stream(). Node's
// built-in Blob (from node:buffer) is spec-complete, so we use it in tests.
// The real extension runs in Chrome where Blob is fully featured.
import { Blob as NodeBlob } from "node:buffer";

// @ts-expect-error override jsdom's partial Blob
globalThis.Blob = NodeBlob;
