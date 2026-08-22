import { describe, it, expect } from "vitest";
import { createZip } from "../../src/export/zip";
import { readZip } from "../../src/export/unzip";
import { buildBackupZip } from "../../src/export/archive";
import { utf8 } from "../../src/utils/bytes";
import { sampleConversation } from "./export.test";

describe("zip round-trip", () => {
  it("writes and reads entries back identically", async () => {
    const entries = [
      { path: "folder/hello.txt", data: utf8("hello world") },
      { path: "folder/data.json", data: utf8(JSON.stringify({ a: 1, b: [1, 2, 3] })) },
      { path: "folder/bin", data: new Uint8Array([0, 1, 2, 3, 255, 128, 64]) },
    ];
    const blob = await createZip(entries);
    const buf = await blob.arrayBuffer();
    const read = await readZip(buf);

    expect(read.size).toBe(3);
    expect(new TextDecoder().decode(read.get("folder/hello.txt"))).toBe("hello world");
    expect(JSON.parse(new TextDecoder().decode(read.get("folder/data.json")!)).b).toEqual([1, 2, 3]);
    expect(Array.from(read.get("folder/bin")!)).toEqual([0, 1, 2, 3, 255, 128, 64]);
  });

  it("compresses larger repetitive data and restores it exactly", async () => {
    const big = utf8("abcabcabc".repeat(1000));
    const blob = await createZip([{ path: "big.txt", data: big }]);
    const read = await readZip(await blob.arrayBuffer());
    const got = read.get("big.txt")!;
    expect(got.length).toBe(big.length);
    expect(Array.from(got)).toEqual(Array.from(big));
  });

  it("builds a backup archive containing conversation exports", async () => {
    const blob = await buildBackupZip([{ conv: sampleConversation(), attachments: [] }]);
    const read = await readZip(await blob.arrayBuffer());
    const paths = [...read.keys()];
    expect(paths).toContain("backup.json");
    expect(paths.some((p) => p.endsWith("/messages.json"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/conversation.md"))).toBe(true);
  });
});
