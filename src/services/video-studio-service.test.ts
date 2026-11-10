import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn(async () => ({ error: null }));
const insert = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/kyc/require-shop-verified", () => ({
  requireVerifiedShop: vi.fn(async () => null),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    storage: {
      from: () => ({
        upload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
    from: () => ({
      insert,
      update: () => ({ in: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  }),
}));

vi.mock("@/lib/video/file-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/video/file-guard")>();
  return {
    ...actual,
    inspectShoppingMedia: vi.fn(async (file: File) => {
      if (file.type.startsWith("video/")) {
        return {
          ok: true as const,
          media: "video" as const,
          kind: "mp4" as const,
          durationMs: 4000,
          width: 720,
          height: 1280,
        };
      }
      const kind =
        file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : file.type === "image/gif"
              ? "gif"
              : "jpeg";
      return { ok: true as const, media: "image" as const, kind, width: 800, height: 600 };
    }),
    captureVideoThumbnail: vi.fn(async () => null),
  };
});

vi.mock("@/services/product-service", () => ({
  updateProductImages: vi.fn(async () => ({ error: null })),
}));

import { submitStudioVideo } from "./video-studio-service";

const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];

function photo(name: string, header: number[], type: string): File {
  return new File([Uint8Array.from(header.concat(Array.from({ length: 80 }, () => 1)))], name, {
    type,
  });
}

function jpegSized(bytes: number, name: string): File {
  const raw = new Uint8Array(bytes);
  raw.set(JPEG_HEADER);
  return new File([raw], name, { type: "image/jpeg" });
}

function baseInput(file: File, extraImages: File[] = []) {
  return {
    businessId: "biz-1",
    profileId: "pro-1",
    file,
    extraImages,
    caption: "Test post",
    productIds: [] as string[],
    products: [] as { id: string; business_id: string }[],
    attribution: "business" as const,
  };
}

describe("submitStudioVideo extra photos", () => {
  beforeEach(() => {
    upload.mockClear();
    insert.mockClear();
    upload.mockResolvedValue({ error: null });
    insert.mockResolvedValue({ error: null });
  });

  it("uploads the main photo and extras when every extra is valid", async () => {
    const result = await submitStudioVideo(
      baseInput(photo("main.jpg", JPEG_HEADER, "image/jpeg"), [
        photo("two.png", PNG_HEADER, "image/png"),
      ]),
    );
    expect(result.error).toBeNull();
    expect(upload.mock.calls.length).toBe(2);
    expect(insert).toHaveBeenCalled();
  });

  it("does not upload when one extra photo is invalid", async () => {
    const fake = new File([new TextEncoder().encode("not-a-photo")], "fake.jpg", {
      type: "image/jpeg",
    });
    const result = await submitStudioVideo(
      baseInput(photo("main.jpg", JPEG_HEADER, "image/jpeg"), [
        photo("two.png", PNG_HEADER, "image/png"),
        fake,
      ]),
    );
    expect(result.error).toMatch(/extra photo could not be processed/i);
    expect(upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not upload when one extra photo is over the size cap", async () => {
    const result = await submitStudioVideo(
      baseInput(photo("main.jpg", JPEG_HEADER, "image/jpeg"), [
        jpegSized(13 * 1024 * 1024, "huge.jpg"),
      ]),
    );
    expect(result.error).toMatch(/extra photo is too large/i);
    expect(upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
