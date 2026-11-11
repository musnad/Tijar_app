import { describe, expect, it } from "vitest";

import {
  sniffImageKind,
  sniffVideoKind,
  usableVideoDurationMs,
  validateVideoFileMeta,
  postVideoNeedsClip,
  inspectShoppingMedia,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_MS,
  MAX_VIDEO_SEC,
} from "./file-guard";

function bytes(arr: number[]): Uint8Array {
  return Uint8Array.from(arr);
}

describe("sniffVideoKind", () => {
  it("detects MP4 ftyp box even if the declared type is wrong", () => {
    const header = bytes([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(sniffVideoKind(header)).toBe("mp4");
  });

  it("detects WebM EBML header", () => {
    const header = bytes([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sniffVideoKind(header)).toBe("webm");
  });

  it("rejects a renamed jpeg", () => {
    const jpeg = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffVideoKind(jpeg)).toBeNull();
  });
});

describe("sniffImageKind", () => {
  it("detects jpeg, png and webp", () => {
    expect(sniffImageKind(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("jpeg");
    expect(
      sniffImageKind(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])),
    ).toBe("png");
    const webp = bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImageKind(webp)).toBe("webp");
  });
});

describe("usableVideoDurationMs", () => {
  it("does not treat Infinity as a real clip length", () => {
    expect(usableVideoDurationMs(Number.POSITIVE_INFINITY)).toBeNull();
    expect(usableVideoDurationMs(Number.POSITIVE_INFINITY, 3_200)).toBe(3_200);
    expect(usableVideoDurationMs(3.1)).toBe(3100);
  });
});

describe("post video length", () => {
  it("caps in-app posts at 10 seconds", () => {
    expect(MAX_VIDEO_SEC).toBe(10);
    expect(MAX_VIDEO_MS).toBe(10_000);
  });

  it("clips only when the clip is longer than 10 seconds", () => {
    expect(postVideoNeedsClip(9_800)).toBe(false);
    expect(postVideoNeedsClip(10_000)).toBe(false);
    expect(postVideoNeedsClip(10_400)).toBe(true);
    expect(postVideoNeedsClip(45_000)).toBe(true);
  });
});

describe("validateVideoFileMeta", () => {
  it("rejects empty and oversized files", () => {
    expect(validateVideoFileMeta({ size: 0 } as File).ok).toBe(false);
    expect(validateVideoFileMeta({ size: MAX_VIDEO_BYTES + 1 } as File).ok).toBe(false);
    expect(validateVideoFileMeta({ size: 1024 } as File).ok).toBe(true);
  });
});

describe("inspectShoppingMedia", () => {
  it("rejects video uploads", async () => {
    const header = [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d];
    const file = new File([Uint8Array.from(header.concat(Array.from({ length: 40 }, () => 0)))], "clip.mp4", {
      type: "video/mp4",
    });
    const result = await inspectShoppingMedia(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/photos only/i);
  });
});