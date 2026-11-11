"use client";

import { Camera, ImagePlus, X } from "lucide-react";
import { useRef } from "react";

import { cn } from "@/lib/utils";

export const MAX_PRODUCT_PHOTOS = 10;

export type ProductPhotoItem = {
  url: string;
  file?: File;
};

export function ProductPhotosField({
  photos,
  onChange,
  required = false,
}: {
  photos: ProductPhotoItem[];
  onChange: (next: ProductPhotoItem[]) => void;
  required?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const remaining = MAX_PRODUCT_PHOTOS - photos.length;

  function addFiles(list: FileList | File[] | null, limit: number) {
    if (!list || limit <= 0) return;
    const files = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, limit);
    if (files.length === 0) return;
    onChange([...photos, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  function removeAt(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {photos.map((photo, index) => (
          <div key={`${photo.url}-${index}`} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="size-full object-cover" />
            {index === 0 ? (
              <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[8px] font-bold uppercase text-white">
                Main
              </span>
            ) : null}
            <button
              type="button"
              className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/70 text-white"
              onClick={() => removeAt(index)}
              aria-label="Remove photo"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {remaining > 0 ? (
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-border bg-background"
            aria-label="Upload photo"
          >
            <ImagePlus className="size-5 text-muted-foreground" />
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={remaining <= 0}
          onClick={() => cameraRef.current?.click()}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-sm font-bold disabled:opacity-50"
        >
          <Camera className="size-4" />
          Snap
        </button>
        <button
          type="button"
          disabled={remaining <= 0}
          onClick={() => libraryRef.current?.click()}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-sm font-bold disabled:opacity-50"
        >
          <ImagePlus className="size-4" />
          Upload
        </button>
      </div>
      <p className={cn("mt-2 text-center text-xs", required && photos.length === 0 ? "font-bold text-red-600" : "text-muted-foreground")}>
        {required && photos.length === 0
          ? "A photo is required to post"
          : `${photos.length}/${MAX_PRODUCT_PHOTOS} photos · first photo is the shop cover`}
      </p>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files, remaining);
          e.target.value = "";
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files, remaining);
          e.target.value = "";
        }}
      />
    </div>
  );
}
