import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compressImageFile,
  extraPhotoError,
  isVideoFile,
  prepareImageForUpload,
  preparePostImages,
} from "./compress-upload";

function fileFrom(bytes: number[], name: string, type: string): File {
  return new File([Uint8Array.from(bytes)], name, { type });
}

function jpegSized(bytes: number, name = "shop.jpg"): File {
  const raw = new Uint8Array(bytes);
  raw.set(JPEG_HEADER);
  return new File([raw], name, { type: "image/jpeg" });
}

const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const GIF_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const MP4_HEADER = [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0];
const WEBM_HEADER = [0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("isVideoFile", () => {
  it("treats MP4 headers as video even if named .jpg", async () => {
    expect(await isVideoFile(fileFrom(MP4_HEADER, "clip.jpg", "image/jpeg"))).toBe(true);
  });

  it("treats video/* as video", async () => {
    expect(await isVideoFile(fileFrom(MP4_HEADER, "clip.mp4", "video/mp4"))).toBe(true);
  });

  it("treats WebM headers as video even if labelled jpeg", async () => {
    expect(await isVideoFile(fileFrom(WEBM_HEADER, "clip.jpg", "image/jpeg"))).toBe(true);
  });

  it("does not treat jpeg as video", async () => {
    expect(await isVideoFile(fileFrom(JPEG_HEADER, "shot.jpg", "image/jpeg"))).toBe(false);
  });
});

describe("prepareImageForUpload", () => {
  it("rejects empty files", async () => {
    const r = await prepareImageForUpload(fileFrom([], "empty.jpg", "image/jpeg"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/i);
  });

  it("rejects videos", async () => {
    const r = await prepareImageForUpload(fileFrom(MP4_HEADER, "clip.mp4", "video/mp4"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/photo/i);
  });

  it("rejects MP4 bytes labelled as jpeg", async () => {
    const r = await prepareImageForUpload(fileFrom(MP4_HEADER, "trick.jpg", "image/jpeg"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not a video/i);
  });

  it("rejects WebM bytes labelled as jpeg", async () => {
    const r = await prepareImageForUpload(fileFrom(WEBM_HEADER, "trick.jpg", "image/jpeg"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not a video/i);
  });

  it("rejects files over the size cap before upload", async () => {
    const r = await prepareImageForUpload(jpegSized(6 * 1024 * 1024, "huge.jpg"), {
      maxBytes: 5 * 1024 * 1024,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too large/i);
  });

  it("accepts valid jpeg, png, gif and webp signatures", async () => {
    const jpeg = await prepareImageForUpload(
      fileFrom(JPEG_HEADER.concat(Array.from({ length: 80 }, () => 1)), "a.jpg", "image/jpeg"),
    );
    const png = await prepareImageForUpload(
      fileFrom(PNG_HEADER.concat(Array.from({ length: 80 }, () => 1)), "a.png", "image/png"),
    );
    const gif = await prepareImageForUpload(
      fileFrom(GIF_HEADER.concat(Array.from({ length: 80 }, () => 1)), "a.gif", "image/gif"),
    );
    const webp = await prepareImageForUpload(
      fileFrom(WEBP_HEADER.concat(Array.from({ length: 80 }, () => 1)), "a.webp", "image/webp"),
    );
    expect(jpeg.ok).toBe(true);
    expect(png.ok).toBe(true);
    expect(gif.ok).toBe(true);
    expect(webp.ok).toBe(true);
  });

  it("rejects unknown binary even when labelled image/jpeg", async () => {
    const r = await prepareImageForUpload(
      fileFrom([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "x.jpg", "image/jpeg"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JPG, PNG, WEBP, or GIF/i);
  });

  it("rejects a text file renamed .jpg", async () => {
    const text = Array.from(new TextEncoder().encode("not an image file!!"));
    const r = await prepareImageForUpload(fileFrom(text, "note.jpg", "image/jpeg"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JPG, PNG, WEBP, or GIF/i);
  });

  it("accepts a small jpeg and reports matching sizes when compression is skipped", async () => {
    const jpeg = fileFrom(
      JPEG_HEADER.concat(Array.from({ length: 80 }, () => 1)),
      "tiny.jpg",
      "image/jpeg",
    );
    const r = await prepareImageForUpload(jpeg);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.originalBytes).toBe(jpeg.size);
      expect(r.outputBytes).toBe(jpeg.size);
      expect(r.compressed).toBe(false);
      expect(r.file.type).toBe("image/jpeg");
    }
  });

  it("feed, story, and upgrade image paths share validation (12 MB vs 5 MB)", async () => {
    const studioCap = 12 * 1024 * 1024;
    const upgradeCap = 5 * 1024 * 1024;
    const photo = fileFrom(
      JPEG_HEADER.concat(Array.from({ length: 200 }, () => 2)),
      "shop.jpg",
      "image/jpeg",
    );
    const studio = await prepareImageForUpload(photo, { maxBytes: studioCap, maxEdge: 1280 });
    const story = await prepareImageForUpload(photo, { maxBytes: studioCap, maxEdge: 1280 });
    const upgrade = await prepareImageForUpload(photo, { maxBytes: upgradeCap, maxEdge: 1280 });
    expect(studio.ok).toBe(true);
    expect(story.ok).toBe(true);
    expect(upgrade.ok).toBe(true);

    const sixMb = jpegSized(6 * 1024 * 1024);
    const upgradeTooBig = await prepareImageForUpload(sixMb, {
      maxBytes: upgradeCap,
      maxEdge: 1280,
    });
    const studioOkSize = await prepareImageForUpload(sixMb, { maxBytes: studioCap, maxEdge: 1280 });
    expect(upgradeTooBig.ok).toBe(false);
    expect(studioOkSize.ok).toBe(true);
  });

  it("prepares every extra photo and fails the whole post if one is invalid", async () => {
    const primary = fileFrom(
      JPEG_HEADER.concat(Array.from({ length: 80 }, () => 1)),
      "main.jpg",
      "image/jpeg",
    );
    const extraOk = fileFrom(
      PNG_HEADER.concat(Array.from({ length: 80 }, () => 1)),
      "two.png",
      "image/png",
    );
    const extraBad = fileFrom(
      Array.from(new TextEncoder().encode("hello.jpg")),
      "fake.jpg",
      "image/jpeg",
    );
    const ok = await preparePostImages(primary, [extraOk], {
      maxBytes: 12 * 1024 * 1024,
      maxEdge: 1280,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.extras).toHaveLength(1);

    const bad = await preparePostImages(primary, [extraOk, extraBad], {
      maxBytes: 12 * 1024 * 1024,
      maxEdge: 1280,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/extra photo could not be processed/i);
  });

  it("returns a clear extra-photo error when one extra exceeds the size cap", async () => {
    const primary = fileFrom(
      JPEG_HEADER.concat(Array.from({ length: 80 }, () => 1)),
      "main.jpg",
      "image/jpeg",
    );
    const huge = jpegSized(13 * 1024 * 1024, "big.jpg");
    const r = await preparePostImages(primary, [huge], {
      maxBytes: 12 * 1024 * 1024,
      maxEdge: 1280,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(extraPhotoError("Photo is too large"));
  });

  it("reports original vs compressed bytes for a downscaled shop photo", async () => {
    const originalBytes = 420_000;
    const original = jpegSized(originalBytes, "feed.jpg");
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({
        width: 2000,
        height: 1500,
        close() {},
      })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage() {},
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(((
      cb: (blob: Blob | null) => void,
    ) => {
      cb(new Blob([new Uint8Array(48_000)], { type: "image/webp" }));
    }) as never);

    const r = await prepareImageForUpload(original, { maxBytes: 12 * 1024 * 1024, maxEdge: 1280 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.originalBytes).toBe(420_000);
      expect(r.outputBytes).toBe(48_000);
      expect(r.compressed).toBe(true);
      expect(r.file.type).toBe("image/webp");
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

describe("compressImageFile", () => {
  it("does not rewrite GIF files", async () => {
    const gif = fileFrom(GIF_HEADER, "loop.gif", "image/gif");
    const out = await compressImageFile(gif);
    expect(out).toBe(gif);
  });

  it("does not rewrite video files", async () => {
    const video = fileFrom(MP4_HEADER, "clip.mp4", "video/mp4");
    const out = await compressImageFile(video);
    expect(out).toBe(video);
  });

  it("returns a smaller webp when createImageBitmap and canvas toBlob work", async () => {
    const originalBytes = 420_000;
    const original = jpegSized(originalBytes, "shop-photo.jpg");
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({
        width: 2000,
        height: 1500,
        close() {},
      })),
    );
    const toBlob = vi.fn((cb: (blob: Blob | null) => void) => {
      cb(new Blob([new Uint8Array(48_000)], { type: "image/webp" }));
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage() {},
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(toBlob as never);

    const packed = await compressImageFile(original, 1280);
    expect(packed.size).toBe(48_000);
    expect(packed.size).toBeLessThan(originalBytes);
    expect(packed.type).toBe("image/webp");
    expect(packed.name.endsWith(".webp")).toBe(true);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

describe("compressImageFile fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the original file if createImageBitmap throws", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("decode failed");
      }),
    );
    const jpeg = fileFrom(
      JPEG_HEADER.concat(Array.from({ length: 200_000 }, () => 7)),
      "broken.jpg",
      "image/jpeg",
    );
    const out = await compressImageFile(jpeg);
    expect(out).toBe(jpeg);
  });

  it("lets prepareImageForUpload keep a valid image if compression throws, when under the size cap", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("decode failed");
      }),
    );
    const jpeg = jpegSized(200_000, "ok.jpg");
    const r = await prepareImageForUpload(jpeg, { maxBytes: 12 * 1024 * 1024 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file).toBe(jpeg);
      expect(r.compressed).toBe(false);
      expect(r.outputBytes).toBe(jpeg.size);
    }
  });
});
