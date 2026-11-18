"use client";

// Photos tab: logo, cover and the categorised gallery. Upload (button or drag and drop), recategorise, view and delete.
// Images are resized client-side, then put on Google (live; the demo keeps them in the app). The Media Library uses the same
// panel with videos too (source "media": no logo / cover slots, video upload in pieces, a player in the viewer).
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Eye, Film, ImagePlus, Loader2, Play, Trash2, Upload } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { Modal, Segmented, SelectBox, useConfirm } from "@/components/ui-client";
import { deletePhoto, updatePhoto, uploadPhotos } from "@/app/(app)/actions";
import { uploadVideo } from "@/lib/video-client";
import type { Location, NewPhoto, Photo, PhotoCategory } from "@/lib/gbp/types";
import { PHOTO_CATEGORIES, photoCategoryLabel } from "@/lib/profile";
import { PHOTO_ACCEPT, PHOTO_RECOMMENDED_PX, PHOTO_RULES, VIDEO_ACCEPT, VIDEO_RULES, canvasToUpload, checkPhoto, checkVideo } from "@/lib/media-rules";
import { cn } from "@/lib/utils";
import { SubHead } from "./shared";

const ACCEPT = PHOTO_ACCEPT;
const MAX_EDGE = 1600;

/** Read, validate and resize one file. Returns an error message instead of throwing. */
type Prepared = NewPhoto & { width: number; height: number };
async function prepare(file: File, category: PhotoCategory): Promise<Prepared | string> {
  const problem = await checkPhoto(file);
  if (problem) return problem;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return { url: canvasToUpload(canvas, file.type).url, category, width: canvas.width, height: canvas.height };
}

const sizeHint = (p: Photo) => (p.width && p.height ? `${p.width} × ${p.height}` : "");
/** 12400 → "12.4K". Only for views Google reported. */
const views = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function PhotosPanel({ location, source = "audit" }: { location: Location; source?: "audit" | "media" }) {
  const media = source === "media";
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const photos = location.photos ?? [];
  const logo = photos.find((p) => p.category === "logo");
  const cover = photos.find((p) => p.category === "cover");
  // The Media Library has no logo / cover slots: those two show in its grid (changed on the Profile Audit).
  const gallery = photos.filter((p) => media || (p.category !== "logo" && p.category !== "cover")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const slotted = (p: Photo) => p.category === "logo" || p.category === "cover";
  const isVideo = (p: Photo) => p.type === "video";
  const videoCount = gallery.filter(isVideo).length;
  const photoCount = gallery.filter((p) => !isVideo(p) && !slotted(p)).length;
  const counts = new Map<PhotoCategory, number>();
  for (const p of gallery) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);

  const [filter, setFilter] = useState<"all" | "videos" | PhotoCategory>("all");
  const [progress, setProgress] = useState<number | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [uploadAs, setUploadAs] = useState<PhotoCategory>("exterior");
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  // Sorting by views is offered only when Google reports views for these photos.
  const hasViews = photos.some((p) => p.views != null);
  const [sort, setSort] = useState<"newest" | "views">("newest");
  const galleryInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const filtered = filter === "all" ? gallery : filter === "videos" ? gallery.filter(isVideo) : gallery.filter((p) => p.category === filter);
  const uploadCategory: PhotoCategory = filter === "all" || filter === "videos" ? uploadAs : filter;
  const shown = hasViews && sort === "views" ? [...filtered].sort((a, b) => (b.views ?? -1) - (a.views ?? -1)) : filtered;
  const viewing = viewIndex != null ? shown[viewIndex] : null;

  const upload = async (files: FileList | File[] | null, category: PhotoCategory, key: string) => {
    const list = Array.from(files ?? []).slice(0, category === "logo" || category === "cover" ? 1 : 20);
    if (!list.length) return;
    setBusy(key);
    const prepared = await Promise.all(list.map((f) => prepare(f, category).catch(() => `${f.name}: couldn't read this image`)));
    const errors = prepared.filter((x): x is string => typeof x === "string");
    const ok = prepared.filter((x): x is Prepared => typeof x !== "string");
    if (errors.length) toast.error(errors.slice(0, 3).join("\n") + (errors.length > 3 ? `\n+${errors.length - 3} more` : ""));
    if (ok.length) {
      const res = await uploadPhotos(location.id, ok);
      if (res.ok) {
        toast.success(category === "logo" ? "Logo updated" : category === "cover" ? "Cover photo updated" : `${ok.length} photo${ok.length === 1 ? "" : "s"} uploaded`);
        router.refresh();
      } else toast.error(res.error);
    }
    setBusy(null);
  };

  const recategorise = async (p: Photo, category: PhotoCategory) => {
    setBusy(`cat:${p.id}`);
    const res = await updatePhoto(location.id, p.id, category);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(category === "cover" ? "Set as cover photo" : category === "logo" ? "Set as logo" : `Moved to ${photoCategoryLabel(category)}`);
    if (category === "logo" || category === "cover" || (filter !== "all" && filter !== category)) setViewIndex(null);
    router.refresh();
  };

  const remove = async (p: Photo) => {
    const ok = await confirm({
      title: `Delete this ${p.category === "logo" ? "logo" : p.category === "cover" ? "cover photo" : isVideo(p) ? "video" : "photo"}?`,
      description: "It will be removed from your Business Profile on Google. This can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(`del:${p.id}`);
    const res = await deletePhoto(location.id, p.id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(isVideo(p) ? "Video deleted" : "Photo deleted");
    setViewIndex(null);
    router.refresh();
  };

  // Videos go up one at a time, in pieces, with progress; Google may take a few minutes to show a new video.
  const uploadVideos = async (files: FileList | File[] | null, category: PhotoCategory) => {
    const list = Array.from(files ?? []).slice(0, 5);
    if (!list.length) return;
    setBusy("video");
    let n = 0;
    for (const f of list) {
      const bad = await checkVideo(f);
      if (bad) {
        toast.error(bad);
        continue;
      }
      setProgress(0);
      const res = await uploadVideo(location.id, f, category, setProgress);
      if (!res.ok) {
        toast.error(`${f.name}: ${res.error}`);
        continue;
      }
      n++;
    }
    setProgress(null);
    setBusy(null);
    if (n) {
      toast.success(`${n} video${n === 1 ? "" : "s"} sent to Google`, { description: "Google checks new videos first; they can take a few minutes to show up." });
      router.refresh();
    }
  };

  const slot = (kind: "logo" | "cover", photo: Photo | undefined, input: React.RefObject<HTMLInputElement | null>) => (
    <div className={kind === "logo" ? "w-full sm:w-40" : "min-w-0 flex-1"}>
      <SubHead>{kind === "logo" ? "Logo" : "Cover photo"}</SubHead>
      <div className={cn("group relative overflow-hidden rounded-xl border", kind === "logo" ? "aspect-square" : "aspect-[16/9] sm:aspect-auto sm:h-40", !photo && "border-dashed")}>
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img referrerPolicy="no-referrer" src={photo.url} alt={kind === "logo" ? `${location.title} logo` : `${location.title} cover photo`} className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button type="button" className={buttonClass("secondary", "sm", "h-7 text-xs")} onClick={() => input.current?.click()} disabled={!!busy}>
                Replace
              </button>
              <button type="button" className={buttonClass("secondary", "icon", "h-7 w-7")} onClick={() => remove(photo)} disabled={!!busy} aria-label={`Delete ${kind}`}>
                <Trash2 />
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={!!busy}
            className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {busy === kind ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            <span className="font-semibold text-primary">Upload {kind === "logo" ? "logo" : "cover photo"}</span>
            <span>{kind === "logo" ? "Square, 250 px or larger" : "16:9, 1080 × 608 px recommended"}</span>
          </button>
        )}
        {photo && busy === kind && (
          <span className="absolute inset-0 flex items-center justify-center bg-card/70">
            <Loader2 className="h-5 w-5 animate-spin" />
          </span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files, kind, kind);
          e.target.value = "";
        }}
      />
    </div>
  );

  const filterOptions: { value: "all" | "videos" | PhotoCategory; label: string }[] = [
    { value: "all" as const, label: `All · ${gallery.length}` },
    ...(videoCount ? [{ value: "videos" as const, label: `Videos · ${videoCount}` }] : []),
    ...PHOTO_CATEGORIES.filter((c) => counts.get(c.id)).map((c) => ({ value: c.id, label: `${c.label} · ${counts.get(c.id)}` })),
    ...(["logo", "cover"] as const).filter((c) => counts.get(c)).map((c) => ({ value: c, label: `${c === "logo" ? "Logo" : "Cover"} · ${counts.get(c)}` })),
  ];

  return (
    <div className="space-y-6">
      {dialog}
      {!media && (
        <div className="flex flex-col gap-4 sm:flex-row">
          {slot("logo", logo, logoInput)}
          {slot("cover", cover, coverInput)}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files);
          const vids = files.filter((f) => f.type.startsWith("video/"));
          if (vids.length && media) void uploadVideos(vids, uploadCategory);
          const pics = files.filter((f) => !f.type.startsWith("video/"));
          if (pics.length) void upload(pics, uploadCategory, "gallery");
        }}
        className={cn("rounded-xl transition-shadow", dragging && "ring-2 ring-primary ring-offset-4 ring-offset-card")}
      >
        <SubHead action={<span className={cn("text-xs tabular-nums", photoCount >= 10 ? "text-success" : "text-muted-foreground")}>{photoCount} of 10+ recommended</span>}>{media ? "Photos and videos" : "Photos"}</SubHead>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {gallery.length > 0 ? <Segmented size="sm" value={filter} onChange={setFilter} label="Photo category" options={filterOptions} /> : <span />}
            {hasViews && (
              <Segmented
                size="sm"
                value={sort}
                onChange={setSort}
                label="Sort photos"
                options={[
                  { value: "newest", label: "Newest" },
                  { value: "views", label: "Most viewed" },
                ]}
              />
            )}
          </div>
          {/* Phones: the category picker takes its own line and the buttons share the next one. */}
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            {(filter === "all" || filter === "videos") && (
              <SelectBox
                value={uploadAs}
                onChange={(v) => setUploadAs(v as PhotoCategory)}
                label="Upload as"
                className="w-full sm:w-52"
                options={PHOTO_CATEGORIES.map((c) => ({ value: c.id, label: `Upload as ${c.label}` }))}
              />
            )}
            <button type="button" className={buttonClass("default", "sm", "h-9")} disabled={!!busy} onClick={() => galleryInput.current?.click()}>
              {busy === "gallery" ? <Loader2 className="animate-spin" /> : <ImagePlus />} Upload photos
            </button>
            {media && (
              <button type="button" className={buttonClass("outline", "sm", "h-9")} disabled={!!busy} onClick={() => videoInput.current?.click()}>
                {busy === "video" ? <Loader2 className="animate-spin" /> : <Film />}
                {busy === "video" && progress != null ? `Uploading ${Math.round(progress * 100)}%` : "Upload video"}
              </button>
            )}
          </div>
          {media && (
            <input
              ref={videoInput}
              type="file"
              accept={VIDEO_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                void uploadVideos(e.target.files, uploadCategory);
                e.target.value = "";
              }}
            />
          )}
          <input
            ref={galleryInput}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files, uploadCategory, "gallery");
              e.target.value = "";
            }}
          />
        </div>

        {shown.length ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
            {shown.map((p, i) => (
              <li key={p.id}>
                <button type="button" onClick={() => setViewIndex(i)} className="group relative block aspect-square w-full overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img referrerPolicy="no-referrer" src={p.url} alt={`${photoCategoryLabel(p.category)} ${isVideo(p) ? "video" : "photo"}`} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Film className="h-6 w-6" />
                    </span>
                  )}
                  {isVideo(p) && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
                        <Play className="ml-0.5 h-4 w-4 fill-current" />
                      </span>
                    </span>
                  )}
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">{p.fromCustomer ? "Customer" : photoCategoryLabel(p.category)}</span>
                  {p.views != null && (
                    <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white" title={`${p.views.toLocaleString("en-US")} views on Google`}>
                      <Eye className="h-3 w-3" />
                      {views(p.views)}
                    </span>
                  )}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => galleryInput.current?.click()}
                disabled={!!busy}
                className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-accent hover:text-accent-foreground"
              >
                {busy === "gallery" ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                Add photos
              </button>
            </li>
          </ul>
        ) : (
          <button
            type="button"
            onClick={() => galleryInput.current?.click()}
            disabled={!!busy}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors hover:border-primary hover:bg-accent/50"
          >
            {busy === "gallery" ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <ImagePlus className="h-7 w-7 text-primary" />}
            <span className="text-sm font-semibold">{filter === "all" ? (media ? "Add your first photos or videos" : "Add your first photos") : filter === "videos" ? "No videos yet" : `No ${photoCategoryLabel(filter).toLowerCase()} photos yet`}</span>
            <span className="max-w-sm text-xs text-muted-foreground">Drag photos{media ? " or videos" : ""} here or click to upload. Photos: {PHOTO_RULES}.{media ? ` Videos: ${VIDEO_RULES}.` : ""}</span>
          </button>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Tip: drag photos onto this area to upload. Exterior, interior and team photos help customers recognise you.</p>
      </div>

      <Modal open={!!viewing} onClose={() => setViewIndex(null)} title={viewing ? `${photoCategoryLabel(viewing.category)}${isVideo(viewing) ? " video" : ""}` : ""} className="sm:max-w-4xl">
        {viewing && (
          <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="relative flex items-center justify-center bg-foreground/95 md:min-h-[460px]">
              {isVideo(viewing) && viewing.videoUrl ? (
                <video key={viewing.id} src={viewing.videoUrl} poster={viewing.url || undefined} controls playsInline className="max-h-[65vh] w-auto max-w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img referrerPolicy="no-referrer" src={viewing.url} alt={`${photoCategoryLabel(viewing.category)} photo`} className="max-h-[65vh] w-auto max-w-full object-contain" />
              )}
              {viewIndex! > 0 && (
                <button type="button" onClick={() => setViewIndex(viewIndex! - 1)} className={buttonClass("secondary", "icon", "absolute left-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full")} aria-label="Previous photo">
                  <ChevronLeft />
                </button>
              )}
              {viewIndex! < shown.length - 1 && (
                <button type="button" onClick={() => setViewIndex(viewIndex! + 1)} className={buttonClass("secondary", "icon", "absolute right-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full")} aria-label="Next photo">
                  <ChevronRight />
                </button>
              )}
            </div>
            <div className="space-y-4 p-5">
              {media && slotted(viewing) ? (
                <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
                  This is your {viewing.category === "logo" ? "logo" : "cover photo"} on Google. Replace it on the Profile Audit page.
                </p>
              ) : viewing.fromCustomer ? (
                <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
                  Added by a customer on Google. It counts toward your photos, but only Google can change or remove it. Report it on Google Maps if it shouldn&apos;t be there.
                </p>
              ) : (
              <div>
                <p className="label-caps mb-1.5">Category</p>
                <SelectBox
                  value={viewing.category}
                  onChange={(v) => void recategorise(viewing, v as PhotoCategory)}
                  label="Photo category"
                  options={[...PHOTO_CATEGORIES.map((c) => ({ value: c.id, label: c.label })), ...(isVideo(viewing) || media ? [] : [{ value: "cover", label: "Use as cover photo" }, { value: "logo", label: "Use as logo" }])]}
                />
              </div>
              )}
              <dl className="space-y-1 text-sm">
                {viewing.views != null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Views on Google</dt>
                    <dd className="font-semibold tabular-nums">{viewing.views.toLocaleString("en-US")}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Added</dt>
                  <dd>{dateLabel(viewing.createdAt)}</dd>
                </div>
                {sizeHint(viewing) && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Size</dt>
                    <dd className="tabular-nums">{sizeHint(viewing)} px</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{isVideo(viewing) ? "Item" : "Photo"}</dt>
                  <dd className="tabular-nums">
                    {viewIndex! + 1} of {shown.length}
                  </dd>
                </div>
              </dl>
              {!isVideo(viewing) && viewing.width != null && viewing.width < PHOTO_RECOMMENDED_PX && <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Smaller than {PHOTO_RECOMMENDED_PX} px. It may look blurry on large screens.</p>}
              {!viewing.fromCustomer && !(media && slotted(viewing)) && (
                <button type="button" className={buttonClass("outline", "sm", "w-full text-destructive hover:bg-destructive/10 hover:text-destructive")} disabled={!!busy} onClick={() => remove(viewing)}>
                  {busy === `del:${viewing.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete {isVideo(viewing) ? "video" : "photo"}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
