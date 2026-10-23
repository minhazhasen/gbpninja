"use client";

// Photos tab: logo, cover and the categorised gallery. Upload (button or drag and drop), recategorise, view and delete.
// Images are resized client-side and stored as data: URLs until real file storage / the Google Media API is wired up.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Eye, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { Modal, Segmented, SelectBox, useConfirm } from "@/components/ui-client";
import { deletePhoto, updatePhoto, uploadPhotos } from "@/app/(app)/actions";
import type { Location, NewPhoto, Photo, PhotoCategory } from "@/lib/gbp/types";
import { PHOTO_CATEGORIES, PHOTO_MAX_BYTES, PHOTO_MIN_PX, PHOTO_RECOMMENDED_PX, photoCategoryLabel } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { SubHead } from "./shared";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_EDGE = 1600;

/** Read, validate and resize one file. Returns an error message instead of throwing. */
type Prepared = NewPhoto & { width: number; height: number };
async function prepare(file: File, category: PhotoCategory): Promise<Prepared | string> {
  if (!ACCEPT.split(",").includes(file.type)) return `${file.name}: use a JPG or PNG`;
  if (file.size > PHOTO_MAX_BYTES) return `${file.name}: larger than 5 MB`;
  if (file.size < 10 * 1024) return `${file.name}: smaller than 10 KB`;
  const bmp = await createImageBitmap(file);
  if (bmp.width < PHOTO_MIN_PX || bmp.height < PHOTO_MIN_PX) {
    bmp.close();
    return `${file.name}: at least ${PHOTO_MIN_PX} × ${PHOTO_MIN_PX} px needed`;
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return { url: canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.86), category, width: canvas.width, height: canvas.height };
}

const sizeHint = (p: Photo) => (p.width && p.height ? `${p.width} × ${p.height}` : "");
/** 12400 → "12.4K". Only for views Google reported. */
const views = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function PhotosPanel({ location }: { location: Location }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const photos = location.photos ?? [];
  const logo = photos.find((p) => p.category === "logo");
  const cover = photos.find((p) => p.category === "cover");
  const gallery = photos.filter((p) => p.category !== "logo" && p.category !== "cover").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const counts = new Map<PhotoCategory, number>();
  for (const p of gallery) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);

  const [filter, setFilter] = useState<"all" | PhotoCategory>("all");
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
  const filtered = filter === "all" ? gallery : gallery.filter((p) => p.category === filter);
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
      title: `Delete this ${p.category === "logo" ? "logo" : p.category === "cover" ? "cover photo" : "photo"}?`,
      description: "It will be removed from your Business Profile on Google. This can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(`del:${p.id}`);
    const res = await deletePhoto(location.id, p.id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success("Photo deleted");
    setViewIndex(null);
    router.refresh();
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

  const filterOptions = [
    { value: "all" as const, label: `All · ${gallery.length}` },
    ...PHOTO_CATEGORIES.filter((c) => counts.get(c.id)).map((c) => ({ value: c.id, label: `${c.label} · ${counts.get(c.id)}` })),
  ];

  return (
    <div className="space-y-6">
      {dialog}
      <div className="flex flex-col gap-4 sm:flex-row">
        {slot("logo", logo, logoInput)}
        {slot("cover", cover, coverInput)}
      </div>

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
          void upload(e.dataTransfer.files, filter === "all" ? uploadAs : filter, "gallery");
        }}
        className={cn("rounded-xl transition-shadow", dragging && "ring-2 ring-primary ring-offset-4 ring-offset-card")}
      >
        <SubHead action={<span className={cn("text-xs tabular-nums", gallery.length >= 10 ? "text-success" : "text-muted-foreground")}>{gallery.length} of 10+ recommended</span>}>Photos</SubHead>
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
          <div className="flex items-center gap-2">
            {filter === "all" && (
              <SelectBox
                value={uploadAs}
                onChange={(v) => setUploadAs(v as PhotoCategory)}
                label="Upload as"
                className="w-52"
                options={PHOTO_CATEGORIES.map((c) => ({ value: c.id, label: `Upload as ${c.label}` }))}
              />
            )}
            <button type="button" className={buttonClass("default", "sm", "h-9")} disabled={!!busy} onClick={() => galleryInput.current?.click()}>
              {busy === "gallery" ? <Loader2 className="animate-spin" /> : <ImagePlus />} Upload photos
            </button>
          </div>
          <input
            ref={galleryInput}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files, filter === "all" ? uploadAs : filter, "gallery");
              e.target.value = "";
            }}
          />
        </div>

        {shown.length ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
            {shown.map((p, i) => (
              <li key={p.id}>
                <button type="button" onClick={() => setViewIndex(i)} className="group relative block aspect-square w-full overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img referrerPolicy="no-referrer" src={p.url} alt={`${photoCategoryLabel(p.category)} photo`} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
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
            <span className="text-sm font-semibold">{filter === "all" ? "Add your first photos" : `No ${photoCategoryLabel(filter).toLowerCase()} photos yet`}</span>
            <span className="max-w-sm text-xs text-muted-foreground">Drag photos here or click to upload. JPG or PNG, 10 KB–5 MB, at least {PHOTO_MIN_PX} px ({PHOTO_RECOMMENDED_PX} px recommended).</span>
          </button>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Tip: drag photos onto this area to upload. Exterior, interior and team photos help customers recognise you.</p>
      </div>

      <Modal open={!!viewing} onClose={() => setViewIndex(null)} title={viewing ? photoCategoryLabel(viewing.category) : ""} className="sm:max-w-4xl">
        {viewing && (
          <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="relative flex items-center justify-center bg-foreground/95 md:min-h-[460px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img referrerPolicy="no-referrer" src={viewing.url} alt={`${photoCategoryLabel(viewing.category)} photo`} className="max-h-[65vh] w-auto max-w-full object-contain" />
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
              {viewing.fromCustomer ? (
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
                  options={[...PHOTO_CATEGORIES.map((c) => ({ value: c.id, label: c.label })), { value: "cover", label: "Use as cover photo" }, { value: "logo", label: "Use as logo" }]}
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
                  <dt className="text-muted-foreground">Photo</dt>
                  <dd className="tabular-nums">
                    {viewIndex! + 1} of {shown.length}
                  </dd>
                </div>
              </dl>
              {viewing.width != null && viewing.width < PHOTO_RECOMMENDED_PX && <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Smaller than {PHOTO_RECOMMENDED_PX} px. It may look blurry on large screens.</p>}
              {!viewing.fromCustomer && (
                <button type="button" className={buttonClass("outline", "sm", "w-full text-destructive hover:bg-destructive/10 hover:text-destructive")} disabled={!!busy} onClick={() => remove(viewing)}>
                  {busy === `del:${viewing.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete photo
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
