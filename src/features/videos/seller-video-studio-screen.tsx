"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  Camera,
  Check,
  CircleHelp,
  Gavel,
  Globe,
  Menu,
  Pencil,
  Pause,
  Play,
  Plus,
  ShoppingBag,
  SwitchCamera,
  Tag,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { haptic } from "@/lib/haptics";
import {
  inspectShoppingMedia,
  MAX_VIDEO_SEC,
  MIN_VIDEO_SEC,
  pickVideoRecorderMime,
  videoFileFromRecording,
} from "@/lib/video/file-guard";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadProductImage } from "@/services/product-image-service";
import { createProduct, listProducts, setProductPublished, updateProductImageUrl } from "@/services/product-service";
import { MAX_POST_IMAGES, submitStudioVideo } from "@/services/video-studio-service";
import type { StudioBidInput } from "@/services/video-studio-service";
import type { Product } from "@/types/database";
import { formatNgn } from "@/utils/money";

const CAPTION_MAX = 500;

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function SellerVideoStudioScreen({
  businessId,
  profileId,
  embedded = false,
  autoCamera = false,
  initialProductId,
}: {
  businessId: string;
  profileId: string;
  embedded?: boolean;
  autoCamera?: boolean;
  initialProductId?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const recordSecRef = useRef(0);
  const autoStarted = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [extraImages, setExtraImages] = useState<File[]>([]);
  const [kind, setKind] = useState<"image" | "video" | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [caption, setCaption] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [saveToProducts, setSaveToProducts] = useState(true);
  const [picking, setPicking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [camLive, setCamLive] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [recording, setRecording] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [permNote, setPermNote] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null);
  const [step, setStep] = useState<"compose" | "review">("compose");
  const [postMode, setPostMode] = useState<"standard" | "bid">("standard");
  const [postPrice, setPostPrice] = useState("");
  const [bidStarting, setBidStarting] = useState("");
  const [bidStartsAt, setBidStartsAt] = useState("");
  const [bidEndsAt, setBidEndsAt] = useState("");
  const [bidSaleLimit, setBidSaleLimit] = useState("");
  const [errors, setErrors] = useState<{
    product?: string;
    media?: string;
    caption?: string;
    bid?: string;
  }>({});

  const productsQuery = useQuery({
    queryKey: ["create-products", businessId],
    queryFn: async () => {
      const r = await listProducts(businessId);
      if (r.error) throw new Error(r.error);
      return r.data;
    },
  });
  const galleryQuery = useQuery({
    queryKey: ["shop-gallery", businessId],
    queryFn: async () => {
      const { data } = await getSupabaseBrowserClient()
        .from("businesses")
        .select("gallery_urls")
        .eq("id", businessId)
        .maybeSingle();
      return ((data?.gallery_urls as string[] | null) ?? []).filter(Boolean);
    },
  });

  const products = productsQuery.data ?? [];
  const product = products.find((p) => p.id === productId) ?? null;
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const extraPreviews = useMemo(
    () => extraImages.map((item) => URL.createObjectURL(item)),
    [extraImages],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      extraPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [extraPreviews]);

  useEffect(() => {
    if (!initialProductId) return;
    if (products.some((p) => p.id === initialProductId)) setProductId(initialProductId);
  }, [products, initialProductId]);

  useEffect(() => {
    return () => stopStream();
  }, []);

  useEffect(() => {
    if (!camLive || !streamRef.current || !liveRef.current) return;
    liveRef.current.srcObject = streamRef.current;
    liveRef.current.muted = true;
    liveRef.current.playsInline = true;
    void liveRef.current.play().catch(() => undefined);
  }, [camLive]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (liveRef.current) liveRef.current.srcObject = null;
    if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    setCamLive(false);
    setRecording(false);
  }

  async function onFile(next: File | null) {
    if (next && (next.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(next.name))) {
      toast.error("Photos only. You can add up to 10 images.");
      return;
    }
    setFile(null);
    setKind(null);
    setDurationSec(0);
    setCurrentSec(0);
    setErrors((e) => ({ ...e, media: undefined }));
    if (!next) return;
    setInspecting(true);
    const result = await inspectShoppingMedia(next);
    setInspecting(false);
    if (!result.ok) {
      setErrors((e) => ({ ...e, media: result.error }));
      toast.error(result.error);
      return;
    }
    if (result.media !== "image") {
      const msg = "Photos only. You can add up to 10 images.";
      setErrors((e) => ({ ...e, media: msg }));
      toast.error(msg);
      return;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (liveRef.current) liveRef.current.srcObject = null;
    setCamLive(false);
    setFile(next);
    setKind("image");
    haptic("light");
  }

  async function addExtraFiles(list: FileList | File[] | null) {
    const incoming = [...(list ?? [])];
    const accepted: File[] = [];
    for (const next of incoming) {
      const result = await inspectShoppingMedia(next);
      if (result.ok && result.media === "image") accepted.push(next);
    }
    if (accepted.length === 0) {
      toast.error("Add photos (JPEG, PNG, or WebP).");
      return;
    }
    setExtraImages((cur) => {
      const room = MAX_POST_IMAGES - 1 - cur.length;
      return room > 0 ? [...cur, ...accepted.slice(0, room)] : cur;
    });
    haptic("light");
  }

  async function useShopPicture(src: string) {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const file = new File([blob], "shop-photo.jpg", { type: blob.type || "image/jpeg" });
      await onFile(file);
    } catch {
      toast.error("Could not use that shop picture.");
    }
  }

  async function onFiles(list: FileList | null) {
    const files = [...(list ?? [])];
    if (files.length === 0) return;
    await onFile(files[0] ?? null);
    if (files.length > 1) {
      setExtraImages([]);
      await addExtraFiles(files.slice(1, MAX_POST_IMAGES));
    }
  }

  function addTag(raw: string) {
    const value = raw.trim().replace(/^#/, "").replace(/\s+/g, " ").slice(0, 28);
    if (!value) return;
    setTags((cur) => (cur.includes(value) || cur.length >= 8 ? cur : [...cur, value]));
    setTagDraft("");
  }

  function validate(): boolean {
    const next: typeof errors = {};
    const hasNew = newName.trim().length > 0 && Number(newPrice.replace(/,/g, "")) > 0;
    if (!productId && !hasNew) next.product = "Pick a product, or type a name and price.";
    if (!file) next.media = "Add a photo. You cannot post without an image.";
    if (caption.length > CAPTION_MAX)
      next.caption = `Caption must be ${CAPTION_MAX} characters or less.`;
    if (postMode === "bid") {
      const start = Number(bidStarting.replace(/,/g, ""));
      const limit = Number(bidSaleLimit.replace(/,/g, ""));
      if (!(start > 0)) next.bid = "Enter a starting price.";
      else if (!(limit > 0)) next.bid = "Enter the sale limit — the price that closes the bid.";
      else if (limit < start) next.bid = "Sale limit must be at least the starting price.";
      else if (!bidStartsAt) next.bid = "Choose when bidding starts.";
      else if (!bidEndsAt) next.bid = "Choose when bidding finishes.";
      else if (new Date(bidEndsAt).getTime() <= new Date(bidStartsAt).getTime())
        next.bid = "Finish time must be after the start time.";
    }
    setErrors(next);
    if (next.product) toast.error(next.product);
    else if (next.media) toast.error(next.media);
    else if (next.caption) toast.error(next.caption);
    else if (next.bid) toast.error(next.bid);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (!validate()) return;
    setStep("review");
  }

  async function openCamera(nextFacing: "user" | "environment" = facing) {
    setPermNote(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermNote("This browser cannot open the camera. Use the Camera or Upload button.");
      cameraInputRef.current?.click();
      return;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      setFacing(nextFacing);
      setCamLive(true);
      setFile(null);
      setKind(null);
      requestAnimationFrame(() => {
        const el = liveRef.current;
        if (!el) return;
        el.srcObject = stream;
        el.muted = true;
        el.playsInline = true;
        void el.play().catch(() => undefined);
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setPermNote("Camera permission was denied. Allow camera and mic, or upload a file.");
      } else if (name === "NotFoundError") {
        setPermNote("No camera found. Upload a video instead.");
      } else {
        setPermNote("Could not start the camera. Upload a video instead.");
      }
      cameraInputRef.current?.click();
    }
  }

  function startClip() {
    const stream = streamRef.current;
    if (!stream) {
      void openCamera();
      return;
    }
    if (!stream.getAudioTracks().some((t) => t.enabled && t.readyState === "live")) {
      toast.error("Microphone is off. Allow the mic so the clip has sound.");
      return;
    }
    stream.getAudioTracks().forEach((t) => {
      t.enabled = true;
    });
    const mime = pickVideoRecorderMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (ev) => {
      if (ev.data.size) chunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      setRecording(false);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
      const recorded = videoFileFromRecording(blob, rec.mimeType || blob.type, "tijar-clip");
      void onFile(recorded);
    };
    recorderRef.current = rec;
    rec.start(200);
    setRecording(true);
    setRecordSec(0);
    recordSecRef.current = 0;
    recordTimerRef.current = window.setInterval(() => {
      setRecordSec((s) => {
        const n = s + 1;
        recordSecRef.current = n;
        if (n >= MAX_VIDEO_SEC) {
          if (rec.state !== "inactive") rec.stop();
          return n;
        }
        return n;
      });
    }, 1000);
  }

  function stopRecord() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      if (recordSecRef.current < MIN_VIDEO_SEC) {
        toast.error(`Keep recording until ${MIN_VIDEO_SEC} seconds.`);
        return;
      }
      recorderRef.current.stop();
    }
  }

  useEffect(() => {
    if (!autoCamera || autoStarted.current) return;
    autoStarted.current = true;
    cameraInputRef.current?.click();
  }, [autoCamera]);

  async function publish() {
    if (!validate() || !file) {
      setStep("compose");
      return;
    }
    setBusy(true);
    setProgress({ pct: 4, label: "Preparing…" });
    let tagId = productId;
    const makingNew =
      !productId && newName.trim().length > 0 && Number(newPrice.replace(/,/g, "")) > 0;
    if (makingNew && saveToProducts) {
      const sale = Number(newPrice.replace(/,/g, ""));
      const created = await createProduct(businessId, profileId, {
        name: newName.trim(),
        kind: "goods",
        unit: "piece",
        salePrice: sale,
        isPublished: false,
        initialStock: 1,
      });
      if (created.error && !created.product) {
        setBusy(false);
        setProgress(null);
        toast.error(created.error);
        return;
      }
      tagId = created.product?.id ?? null;
      if (tagId && kind === "image") {
        const uploaded = await uploadProductImage(businessId, tagId, file);
        if (uploaded.publicUrl) {
          await updateProductImageUrl(tagId, uploaded.publicUrl);
          await setProductPublished(tagId, true);
        }
      }
    }
    const hashtags = tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ");
    const fullCaption = [caption.trim() || (makingNew ? newName.trim() : ""), hashtags]
      .filter(Boolean)
      .join(" ");
    const isBid = postMode === "bid";
    const standPrice = postPrice.trim() ? Number(postPrice.replace(/,/g, "")) : null;
    const bidInput: StudioBidInput | null = isBid
      ? {
          startingPrice: Number(bidStarting.replace(/,/g, "")),
          startsAt: new Date(bidStartsAt).toISOString(),
          endsAt: new Date(bidEndsAt).toISOString(),
          saleLimit: Number(bidSaleLimit.replace(/,/g, "")),
        }
      : null;
    const r = await submitStudioVideo({
      businessId,
      profileId,
      file,
      extraImages: kind === "image" ? extraImages : [],
      caption: fullCaption,
      productIds: tagId ? [tagId] : [],
      products: products
        .map((p) => ({ id: p.id, business_id: p.business_id }))
        .concat(
          tagId && !products.some((p) => p.id === tagId)
            ? [{ id: tagId, business_id: businessId }]
            : [],
        ),
      attribution: "business",
      rightsAttested: true,
      price: isBid ? null : standPrice,
      postType: isBid ? "bid" : "standard",
      ...(bidInput ? { bid: bidInput } : {}),
      onProgress: (pct, label) => setProgress({ pct, label }),
    });
    setBusy(false);
    if (r.error) {
      setProgress(null);
      toast.error(r.error);
      return;
    }
    haptic("success");
    toast.success(
      isBid
        ? "Bidding post is live. Buyers can bid on it now."
        : tagId
          ? "Posted. Customers can see it on For You and in your shop."
          : "Posted to For You.",
    );
    if (r.videoId) sessionStorage.setItem("tijar-for-you-video-id", r.videoId);
    await queryClient.invalidateQueries({ queryKey: ["video-feed"] });
    await queryClient.invalidateQueries({ queryKey: ["for-you-listings"] });
    await queryClient.invalidateQueries({ queryKey: ["seller-videos"] });
    await queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
    await queryClient.invalidateQueries({ queryKey: ["create-products", businessId] });
    await queryClient.invalidateQueries({ queryKey: ["products-dashboard", businessId] });
    await queryClient.invalidateQueries({ queryKey: ["my-bid-posts", businessId] });
    void navigate({ to: "/shop", search: r.videoId ? { v: r.videoId } : {} });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white in-[.native-shop]:bg-[var(--native-canvas,#F3F5F8)]">
      {!embedded ? (
        <header className="relative flex shrink-0 items-center justify-between px-3 pb-1 pt-[max(0.45rem,env(safe-area-inset-top))]">
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-full text-[#0B1F4D]"
            aria-label="Menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Menu className="size-6" />
          </button>
          <div className="flex max-w-[11.5rem] flex-col items-center">
            <p className="text-[15px] font-extrabold tracking-[0.18em] text-[#0B1F4D]">TIJAR</p>
            <p className="mt-0.5 text-center text-[8px] font-extrabold tracking-[0.16em] text-[#0B1F4D]">
              SELL GLOBAL. GROW FASTER.
            </p>
          </div>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-full border border-[#E5E7EB] text-[#0B1F4D]"
            aria-label="Help"
            onClick={() => setHelpOpen((v) => !v)}
          >
            <CircleHelp className="size-5" />
          </button>
          {menuOpen ? (
            <div className="absolute left-3 top-14 z-20 w-48 overflow-hidden rounded-2xl border border-[#EEF1F5] bg-white py-1 shadow-lg">
              <Link
                to="/shop"
                className="block px-3 py-2.5 text-sm font-semibold text-[#0B1F4D]"
                onClick={() => setMenuOpen(false)}
              >
                For You
              </Link>
              <Link
                to="/app/products"
                className="block px-3 py-2.5 text-sm font-semibold text-[#0B1F4D]"
                onClick={() => setMenuOpen(false)}
              >
                Catalogue
              </Link>
              <Link
                to="/app"
                className="block px-3 py-2.5 text-sm font-semibold text-[#0B1F4D]"
                onClick={() => setMenuOpen(false)}
              >
                Dashboard
              </Link>
            </div>
          ) : null}
        </header>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {helpOpen ? (
          <div className="mt-2 rounded-2xl border border-[#EEF1F5] bg-[#F8FAF9] p-3 text-[12px] leading-relaxed text-[#4B5563]">
            Add a photo or a short video. Pick something from Products, or type a name and price.
            When you post, you can save it in Products so it stays in your shop.
          </div>
        ) : null}

        {step === "review" ? (
          <ReviewStep
            product={product}
            newName={newName}
            newPrice={newPrice}
            saveToProducts={saveToProducts}
            previewUrl={previewUrl}
            kind={kind}
            caption={caption}
            tags={tags}
            postMode={postMode}
            postPrice={postPrice}
            bidStarting={bidStarting}
            bidSaleLimit={bidSaleLimit}
            busy={busy}
            progress={progress}
            onSaveChange={setSaveToProducts}
            onBack={() => setStep("compose")}
            onPublish={() => void publish()}
          />
        ) : (
          <>
            <div className="flex items-start gap-2.5 pt-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1F7A4D] text-white">
                <Plus className="size-5" strokeWidth={2.5} />
              </span>
              <div>
                <h1 className="text-[1.35rem] font-extrabold leading-tight tracking-tight text-[#0B1F4D]">
                  Create post
                </h1>
                <p className="mt-0.5 text-[13px] text-[#6B7280]">
                  Photo or video, a caption and a price — or run a bidding post.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-[#F3F4F6] p-1">
              <button
                type="button"
                className={cn(
                  "min-h-10 rounded-lg text-[13px] font-extrabold transition",
                  postMode === "standard" ? "bg-white text-[#0B1F4D] shadow-sm" : "text-[#6B7280]",
                )}
                onClick={() => setPostMode("standard")}
              >
                Photo / video post
              </button>
              <button
                type="button"
                className={cn(
                  "min-h-10 rounded-lg text-[13px] font-extrabold transition",
                  postMode === "bid" ? "bg-white text-[#0B1F4D] shadow-sm" : "text-[#6B7280]",
                )}
                onClick={() => setPostMode("bid")}
              >
                Bidding post
              </button>
            </div>

            <Button
              variant="outline"
              className="mt-2 min-h-11 w-full rounded-xl border-[#1F7A4D]/30 text-[13px] font-extrabold text-[#1F7A4D]"
              asChild
            >
              <Link to="/shop/sell-item">
                <Tag className="mr-1.5 size-4" />
                Sell a second-hand item from home · free or paid
              </Link>
            </Button>

            {postMode === "bid" ? (
              <p className="mt-2 rounded-2xl bg-[#F3FBF6] px-3 py-2 text-[12px] leading-relaxed text-[#1F7A4D]">
                Buyers bid on this item. The first bid that reaches your sale limit closes it
                instantly and shows “Sold to …”. The winner has 5 minutes to pay, or you can mark it
                unpaid and the item returns to the market.
              </p>
            ) : null}

            <section className="mt-5" aria-labelledby="product-heading">
              <h2
                id="product-heading"
                className="flex items-center gap-1.5 text-[15px] font-extrabold text-[#0B1F4D]"
              >
                <ShoppingBag className="size-4 text-[#1F7A4D]" />
                What are you selling?
              </h2>
              {productsQuery.isLoading ? (
                <p className="mt-2 text-sm text-muted-foreground">Loading your products…</p>
              ) : product && !picking ? (
                <div
                  className={cn(
                    "mt-2 rounded-2xl border p-3",
                    errors.product ? "border-red-300" : "border-[#EEF1F5]",
                  )}
                >
                  <div className="flex items-center gap-3">
                    {product.image_url ? (
                      // eslint-disable-next-line @next-next/no-img-element
                      <img
                        src={product.image_url}
                        alt=""
                        className="size-16 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="size-16 rounded-xl bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-extrabold text-[#0B1F4D]">
                        {product.name}
                      </p>
                      {product.catalogue_category ? (
                        <p className="text-[12px] text-[#6B7280]">{product.catalogue_category}</p>
                      ) : null}
                      {product.sale_price != null ? (
                        <p className="text-[12px] font-semibold text-[#1F7A4D]">
                          {formatNgn(Number(product.sale_price))}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className="flex size-7 items-center justify-center rounded-full bg-[#1F7A4D] text-white"
                      aria-hidden
                    >
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mt-2 text-[13px] font-bold text-[#1F7A4D]"
                    onClick={() => setPicking(true)}
                  >
                    Change product
                  </button>
                </div>
              ) : (
                <>
                  {products.length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {products.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-3 rounded-2xl border p-3 text-left",
                              p.id === productId
                                ? "border-[#1F7A4D] bg-[#F3FBF6]"
                                : "border-[#EEF1F5]",
                            )}
                            onClick={() => {
                              setProductId(p.id);
                              setNewName("");
                              setNewPrice("");
                              setPicking(false);
                              setErrors((e) => ({ ...e, product: undefined }));
                            }}
                          >
                            {p.image_url ? (
                              // eslint-disable-next-line @next-next/no-img-element
                              <img
                                src={p.image_url}
                                alt=""
                                className="size-14 rounded-xl object-cover"
                              />
                            ) : (
                              <span className="size-14 rounded-xl bg-muted" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-extrabold text-[#0B1F4D]">
                                {p.name}
                              </span>
                              <span className="block text-[12px] font-semibold text-[#1F7A4D]">
                                {p.sale_price != null
                                  ? formatNgn(Number(p.sale_price))
                                  : "No price"}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[13px] text-muted-foreground">
                      No products yet. Add a name and price below.
                    </p>
                  )}
                  <div className="mt-3 rounded-2xl border border-dashed border-[#D1D5DB] p-3">
                    <p className="text-[13px] font-extrabold text-[#0B1F4D]">Or add a new one</p>
                    <Input
                      className="mt-2 min-h-11 rounded-xl"
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        setProductId(null);
                      }}
                      placeholder="Name"
                    />
                    <Input
                      className="mt-2 min-h-11 rounded-xl"
                      value={newPrice}
                      inputMode="decimal"
                      onChange={(e) => {
                        setNewPrice(e.target.value);
                        setProductId(null);
                      }}
                      placeholder="Price in ₦"
                    />
                  </div>
                </>
              )}
              {errors.product ? (
                <p className="mt-1 text-[12px] font-semibold text-red-600">{errors.product}</p>
              ) : null}
            </section>

            <section className="mt-5" aria-labelledby="video-heading">
              <h2
                id="video-heading"
                className="flex items-center gap-1.5 text-[15px] font-extrabold text-[#0B1F4D]"
              >
                <Video className="size-4 text-[#1F7A4D]" />
                Photos
              </h2>
              <div
                className={cn(
                  "relative mt-2 overflow-hidden rounded-2xl bg-[#111827]",
                  errors.media && "ring-2 ring-red-400",
                )}
              >
                {camLive ? (
                  <>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      ref={liveRef}
                      className="aspect-[16/9] w-full object-cover"
                      playsInline
                      muted
                      autoPlay
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8">
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/30">
                        <div
                          className="h-full rounded-full bg-[#1F7A4D]"
                          style={{ width: `${Math.min(100, (recordSec / MAX_VIDEO_SEC) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-center text-[12px] font-semibold text-white">
                        {recording
                          ? `${fmtTime(recordSec)} / 00:${String(MAX_VIDEO_SEC).padStart(2, "0")} · min ${MIN_VIDEO_SEC}s`
                          : "Camera live · tap Record clip"}
                      </p>
                    </div>
                    {recording ? (
                      <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        <span className="size-1.5 animate-pulse rounded-full bg-white" />
                        REC
                      </span>
                    ) : null}
                  </>
                ) : previewUrl && kind === "video" ? (
                  <>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      ref={videoRef}
                      src={previewUrl}
                      className="aspect-[16/9] w-full object-cover"
                      playsInline
                      muted={previewMuted}
                      onTimeUpdate={(e) => setCurrentSec(e.currentTarget.currentTime)}
                      onPlay={() => setPreviewPlaying(true)}
                      onPause={() => setPreviewPlaying(false)}
                      onLoadedMetadata={(e) =>
                        setDurationSec(e.currentTarget.duration || durationSec)
                      }
                    />
                    <button
                      type="button"
                      className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white"
                      aria-label={previewPlaying ? "Pause" : "Play"}
                      onClick={() => {
                        const el = videoRef.current;
                        if (!el) return;
                        el.muted = previewMuted;
                        el.volume = 1;
                        if (el.paused) void el.play();
                        else el.pause();
                      }}
                    >
                      {previewPlaying ? (
                        <Pause className="size-5 fill-white" />
                      ) : (
                        <Play className="size-5 fill-white" />
                      )}
                    </button>
                    <p className="absolute bottom-8 left-4 text-[11px] font-semibold text-white">
                      {fmtTime(currentSec)} / {fmtTime(durationSec)}
                    </p>
                    <button
                      type="button"
                      className="absolute bottom-7 right-3 flex size-9 items-center justify-center rounded-full bg-black/45 text-white"
                      aria-label={previewMuted ? "Unmute" : "Mute"}
                      onClick={() => {
                        const el = videoRef.current;
                        const next = !previewMuted;
                        setPreviewMuted(next);
                        if (el) {
                          el.muted = next;
                          el.volume = 1;
                        }
                      }}
                    >
                      {previewMuted ? (
                        <VolumeX className="size-4" />
                      ) : (
                        <Volume2 className="size-4" />
                      )}
                    </button>
                    <div className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/30">
                      <div
                        className="h-full rounded-full bg-[#1F7A4D]"
                        style={{
                          width: `${durationSec ? Math.min(100, (currentSec / durationSec) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </>
                ) : previewUrl && kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="" className="aspect-[16/9] w-full object-cover" />
                ) : (
                  <button
                    type="button"
                    className="flex aspect-[16/9] w-full flex-col items-center justify-center bg-gradient-to-br from-[#1F2937] to-[#111827] text-white"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera className="size-10 opacity-90" />
                    <p className="mt-2 text-sm font-semibold">
                      {inspecting ? "Checking photo…" : "Add a photo"}
                    </p>
                    <p className="mt-1 text-[11px] text-white/70">Up to 10 photos</p>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => void onFiles(e.target.files)}
                />
                <input
                  ref={extraInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => void addExtraFiles(e.target.files)}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                />
              </div>
              {(galleryQuery.data ?? []).length > 0 ? (
                <div className="mt-3">
                  <p className="text-[12px] font-extrabold text-[#0B1F4D]">Shop pictures from your agent</p>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {(galleryQuery.data ?? []).map((src) => (
                      <button
                        key={src}
                        type="button"
                        className="size-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-[#E5E7EB]"
                        onClick={() => void useShopPicture(src)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[#6B7280]">
                <span className="text-[#1F7A4D]" aria-hidden>
                  ↻
                </span>
                Photos only — add up to {MAX_POST_IMAGES}. Shoppers swipe the rest.
              </p>
              {kind === "image" && file ? (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt=""
                      className="size-16 rounded-xl object-cover ring-2 ring-[#1F7A4D]"
                    />
                  ) : null}
                  {extraPreviews.map((src, i) => (
                    <button
                      key={`${extraImages[i]?.name}-${i}`}
                      type="button"
                      className="relative size-16 shrink-0 overflow-hidden rounded-xl"
                      onClick={() => setExtraImages((cur) => cur.filter((_, idx) => idx !== i))}
                      aria-label="Remove photo"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="size-full object-cover" />
                      <X className="absolute right-1 top-1 size-4 rounded-full bg-black/60 p-0.5 text-white" />
                    </button>
                  ))}
                  {1 + extraImages.length < MAX_POST_IMAGES ? (
                    <button
                      type="button"
                      className="flex size-16 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-[#D1D5DB] text-[10px] font-bold text-[#0B1F4D]"
                      onClick={() => extraInputRef.current?.click()}
                    >
                      <Plus className="size-4" />
                      Add
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  className="min-h-11 rounded-xl bg-[#1F7A4D] font-bold text-white hover:bg-[#1F7A4D]/90"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={inspecting}
                >
                  <Camera className="size-4" />
                  Camera
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-xl border-[#D1D5DB] font-bold text-[#0B1F4D]"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={inspecting}
                >
                  Upload
                </Button>
              </div>
              {permNote ? (
                <p className="mt-2 text-[12px] font-semibold text-amber-800">{permNote}</p>
              ) : null}
              {errors.media ? (
                <p className="mt-1 text-[12px] font-semibold text-red-600">{errors.media}</p>
              ) : null}
            </section>

            {postMode === "bid" ? (
              <section className="mt-5" aria-labelledby="bid-heading">
                <h2
                  id="bid-heading"
                  className="flex items-center gap-1.5 text-[15px] font-extrabold text-[#0B1F4D]"
                >
                  <Gavel className="size-4 text-[#1F7A4D]" />
                  Bidding
                </h2>
                <div className="mt-2 space-y-2">
                  <Input
                    className="min-h-11 rounded-xl"
                    value={bidStarting}
                    inputMode="decimal"
                    onChange={(e) => setBidStarting(e.target.value)}
                    placeholder="Starting price in ₦"
                  />
                  <Input
                    className="min-h-11 rounded-xl"
                    value={bidSaleLimit}
                    inputMode="decimal"
                    onChange={(e) => setBidSaleLimit(e.target.value)}
                    placeholder="Sale limit in ₦ — bid that closes it"
                  />
                  <label className="block text-[12px] font-bold text-[#6B7280]">
                    Bidding starts
                    <Input
                      className="mt-1 min-h-11 rounded-xl text-[#0B1F4D]"
                      type="datetime-local"
                      value={bidStartsAt}
                      onChange={(e) => setBidStartsAt(e.target.value)}
                    />
                  </label>
                  <label className="block text-[12px] font-bold text-[#6B7280]">
                    Bidding finishes
                    <Input
                      className="mt-1 min-h-11 rounded-xl text-[#0B1F4D]"
                      type="datetime-local"
                      value={bidEndsAt}
                      onChange={(e) => setBidEndsAt(e.target.value)}
                    />
                  </label>
                </div>
                <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-[#9CA3AF]">
                  <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  When a bid reaches the sale limit, it sells instantly and shows “Sold to …”. If no
                  bid reaches it by the finish time, nothing is sold.
                </p>
                {errors.bid ? (
                  <p className="mt-1 text-[12px] font-semibold text-red-600">{errors.bid}</p>
                ) : null}
              </section>
            ) : (
              <section className="mt-5" aria-labelledby="price-heading">
                <h2
                  id="price-heading"
                  className="flex items-center gap-1.5 text-[15px] font-extrabold text-[#0B1F4D]"
                >
                  <Banknote className="size-4 text-[#1F7A4D]" />
                  Price
                </h2>
                <Input
                  className="mt-2 min-h-11 rounded-xl"
                  value={postPrice}
                  inputMode="decimal"
                  onChange={(e) => setPostPrice(e.target.value)}
                  placeholder="Price in ₦ (optional)"
                />
                <p className="mt-1.5 text-[12px] text-[#9CA3AF]">
                  Shown on the post so buyers see the price at a glance.
                </p>
              </section>
            )}

            <section className="mt-5" aria-labelledby="caption-heading">
              <h2
                id="caption-heading"
                className="flex items-center gap-1.5 text-[15px] font-extrabold text-[#0B1F4D]"
              >
                <Pencil className="size-4 text-[#1F7A4D]" />
                Caption
              </h2>
              <div className="relative mt-2">
                <textarea
                  value={caption}
                  maxLength={CAPTION_MAX}
                  rows={4}
                  placeholder="Timeless leather. Everyday elegance. Handcrafted for the modern lifestyle."
                  className="w-full resize-none rounded-2xl border border-[#EEF1F5] px-3 py-3 text-[14px] leading-relaxed text-[#0B1F4D] outline-none placeholder:text-[#9CA3AF] focus-visible:ring-2 focus-visible:ring-[#1F7A4D]/30"
                  onChange={(e) => setCaption(e.target.value)}
                />
                <p className="mt-1 text-right text-[11px] text-[#9CA3AF]">
                  {caption.length}/{CAPTION_MAX}
                </p>
              </div>
              <p className="text-[12px] text-[#9CA3AF]">
                Add details, features, or a story buyers will love.
              </p>
              {errors.caption ? (
                <p className="mt-1 text-[12px] font-semibold text-red-600">{errors.caption}</p>
              ) : null}
            </section>

            <section className="mt-5" aria-labelledby="tags-heading">
              <h2
                id="tags-heading"
                className="flex items-center gap-1.5 text-[15px] font-extrabold text-[#0B1F4D]"
              >
                <Tag className="size-4 text-[#1F7A4D]" />
                Tags
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-2xl border border-[#EEF1F5] px-2 py-2">
                {tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] px-2.5 py-1 text-[12px] font-semibold text-[#0B1F4D]"
                    onClick={() => setTags((cur) => cur.filter((x) => x !== t))}
                    aria-label={`Remove ${t}`}
                  >
                    {t}
                    <X className="size-3 text-[#9CA3AF]" />
                  </button>
                ))}
                <Input
                  value={tagDraft}
                  className="h-8 min-w-[7rem] flex-1 border-0 shadow-none focus-visible:ring-0"
                  placeholder={tags.length ? "" : "leather handbag"}
                  aria-label="Add tag"
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(tagDraft);
                    }
                  }}
                  onBlur={() => addTag(tagDraft)}
                />
              </div>
              <p className="mt-1.5 text-[12px] text-[#9CA3AF]">
                Add tags to help buyers find your product.
              </p>
            </section>

            <Button
              type="button"
              className="mt-6 min-h-[3.15rem] w-full rounded-xl bg-[#1F7A4D] text-[16px] font-extrabold text-white hover:bg-[#1F7A4D]/90"
              onClick={goNext}
            >
              Next
              <ArrowRight className="size-5" />
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] text-[#6B7280]">
              <Globe className="size-3.5" aria-hidden />
              TIJAR – Trusted by sellers worldwide.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ReviewStep({
  product,
  newName,
  newPrice,
  saveToProducts,
  previewUrl,
  kind,
  caption,
  tags,
  postMode,
  postPrice,
  bidStarting,
  bidSaleLimit,
  busy,
  progress,
  onSaveChange,
  onBack,
  onPublish,
}: {
  product: Product | null;
  newName: string;
  newPrice: string;
  saveToProducts: boolean;
  previewUrl: string | null;
  kind: "image" | "video" | null;
  caption: string;
  tags: string[];
  postMode: "standard" | "bid";
  postPrice: string;
  bidStarting: string;
  bidSaleLimit: string;
  busy: boolean;
  progress: { pct: number; label: string } | null;
  onSaveChange: (next: boolean) => void;
  onBack: () => void;
  onPublish: () => void;
}) {
  const listingName = product?.name ?? newName.trim();
  const isNew = !product && Boolean(newName.trim());
  const isBid = postMode === "bid";
  const money = (raw: string) => (raw.trim() ? formatNgn(Number(raw.replace(/,/g, ""))) : "—");
  return (
    <div className="pt-3">
      <h1 className="text-[1.35rem] font-extrabold text-[#0B1F4D]">Ready to post?</h1>
      <p className="mt-1 text-[13px] text-[#6B7280]">
        {isBid
          ? "This goes to For You as a bidding post. Buyers bid on it."
          : listingName
            ? `This goes to For You${product || saveToProducts ? " with Buy now" : ""}.`
            : "This goes to For You."}
      </p>
      {previewUrl ? (
        kind === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={previewUrl}
            className="mt-4 aspect-[16/9] w-full rounded-2xl object-cover"
            controls
            playsInline
          />
        ) : (
          // eslint-disable-next-line @next-next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="mt-4 aspect-[16/9] w-full rounded-2xl object-cover"
          />
        )
      ) : null}
      {listingName ? (
        <p className="mt-3 text-sm font-extrabold text-[#0B1F4D]">
          {listingName}
          {product?.sale_price != null
            ? ` · ${formatNgn(Number(product.sale_price))}`
            : newPrice
              ? ` · ₦${newPrice}`
              : ""}
        </p>
      ) : null}
      {isNew ? (
        <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[#EEF1F5] bg-[#F8FAF9] p-3 text-sm text-[#0B1F4D]">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={saveToProducts}
            onChange={(e) => onSaveChange(e.target.checked)}
          />
          <span>
            <span className="font-extrabold">Save in Products</span>
            <span className="mt-0.5 block text-[13px] font-medium text-[#6B7280]">
              Keep name, price, and photo in your business dashboard so it stays in the shop.
            </span>
          </span>
        </label>
      ) : product ? (
        <p className="mt-3 text-[13px] text-[#6B7280]">This is already in your Products list.</p>
      ) : null}
      {caption ? <p className="mt-2 text-sm text-[#4B5563]">{caption}</p> : null}
      {isBid ? (
        <div className="mt-3 rounded-2xl border border-[#EEF1F5] bg-[#F3FBF6] p-3 text-[13px] text-[#0B1F4D]">
          <p className="font-extrabold">Bidding post</p>
          <p className="mt-0.5 text-[#1F7A4D]">
            Starting {money(bidStarting)} · sells instantly at {money(bidSaleLimit)}
          </p>
        </div>
      ) : postPrice.trim() ? (
        <p className="mt-2 text-[13px] font-extrabold text-[#1F7A4D]">Price {money(postPrice)}</p>
      ) : null}
      {tags.length ? (
        <p className="mt-2 text-[12px] text-[#6B7280]">
          {tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")}
        </p>
      ) : null}
      {progress ? (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-[#E5E7EB]">
            <div
              className="h-full rounded-full bg-[#1F7A4D] transition-all"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[12px] font-semibold text-[#1F7A4D]">{progress.label}</p>
        </div>
      ) : null}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-12 rounded-xl font-bold"
          disabled={busy}
          onClick={onBack}
        >
        </Button>
        <Button
          type="button"
          className="min-h-12 rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
          disabled={busy}
          onClick={onPublish}
        >
          {busy ? "Posting…" : "Post"}
        </Button>
      </div>
    </div>
  );
}
