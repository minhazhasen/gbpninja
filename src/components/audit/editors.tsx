"use client";

// Services, products and photos editors on the audit page (the Business information tabs live in fields.tsx).
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Package, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";
import { Modal, Segmented, SelectBox } from "@/components/ui-client";
import type { Location, Product, ProductButton, ProductPriceType, ProfileSuggestions, ServiceItem, ServicePriceType, Suggestion } from "@/lib/gbp/types";
import { PRODUCT_BUTTON_LABEL, PRODUCT_DESCRIPTION_MAX, PRODUCT_NAME_MAX, SERVICE_DESCRIPTION_MAX, productPrice, servicePrice } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { FieldHead, SubHead, SuggestionChips, readImage, useSave } from "./shared";


// ---------------------------------------------------------------- services
const SERVICE_PRICE_TYPES: { value: ServicePriceType; label: string }[] = [
  { value: "none", label: "No price" },
  { value: "free", label: "Free" },
  { value: "fixed", label: "Fixed" },
  { value: "from", label: "From" },
];

function PriceInput({ value, onChange, label, id }: { value: string; onChange: (v: string) => void; label: string; id?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
      <input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" aria-label={label} className={cn(inputClass, "h-10 pl-7 tabular-nums")} />
    </div>
  );
}
const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? undefined : Number(s));

function ServiceModal({
  open,
  onClose,
  initial,
  categories,
  onSave,
  onDelete,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  initial: ServiceItem | null;
  categories: string[];
  onSave: (s: ServiceItem) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  busy: boolean;
}) {
  const [f, setF] = useState({ name: "", category: categories[0], priceType: "none" as ServicePriceType, price: "", description: "" });
  useEffect(() => {
    if (open)
      setF({
        name: initial?.name ?? "",
        category: initial?.category || categories[0],
        priceType: initial?.priceType ?? "none",
        price: initial?.price != null ? String(initial.price) : "",
        description: initial?.description ?? "",
      });
  }, [open, initial, categories]);
  const needsPrice = f.priceType === "fixed" || f.priceType === "from";
  const valid = f.name.trim() && (!needsPrice || num(f.price) != null) && f.description.length <= SERVICE_DESCRIPTION_MAX;
  const submit = async () => {
    const ok = await onSave({
      name: f.name.trim(),
      category: f.category,
      priceType: f.priceType,
      ...(needsPrice && { price: num(f.price) }),
      ...(f.description.trim() && { description: f.description.trim() }),
    });
    if (ok) onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.name ? "Edit service" : "Add service"} className="sm:max-w-lg">
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void submit();
        }}
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <FieldHead label="Category" />
            <SelectBox value={f.category} onChange={(v) => setF({ ...f, category: v })} options={categories.map((c) => ({ value: c, label: c }))} label="Category" className="[&_select]:h-10" />
          </div>
          <div>
            <FieldHead label="Service name" htmlFor="svc-name" count={f.name.length} max={120} />
            <input id="svc-name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} placeholder="e.g. Teeth whitening" className={cn(inputClass, "h-10")} />
          </div>
          <div>
            <FieldHead label="Price" />
            <div className="flex flex-wrap items-center gap-3">
              <Segmented value={f.priceType} onChange={(v) => setF({ ...f, priceType: v })} options={SERVICE_PRICE_TYPES} label="Price type" />
              {needsPrice && (
                <div className="w-32">
                  <PriceInput value={f.price} onChange={(v) => setF({ ...f, price: v })} label="Price" />
                </div>
              )}
            </div>
          </div>
          <div>
            <FieldHead label="Description" htmlFor="svc-desc" count={f.description.length} max={SERVICE_DESCRIPTION_MAX} />
            <textarea id="svc-desc" rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={SERVICE_DESCRIPTION_MAX} placeholder="What's included, how long it takes, who it's for." className={inputClass} />
          </div>
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-3">
          {onDelete && (
            <button type="button" className={buttonClass("ghost", "sm", "text-destructive hover:bg-destructive/10 hover:text-destructive")} disabled={busy} onClick={async () => (await onDelete()) && onClose()}>
              <Trash2 /> Delete
            </button>
          )}
          <button type="button" className={buttonClass("outline", "sm", "ml-auto")} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={buttonClass("default", "sm")} disabled={!valid || busy}>
            {busy && <Loader2 className="animate-spin" />} Save service
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ServicesEditor({ location, suggestions }: { location: Location; suggestions: ProfileSuggestions }) {
  const { busy, save } = useSave(location.id);
  const svc = location.services;
  const categories = useMemo(() => [location.primaryCategory, ...location.additionalCategories], [location.primaryCategory, location.additionalCategories]);
  const [editing, setEditing] = useState<{ index: number | null; item: ServiceItem | null } | null>(null);
  const set = (next: ServiceItem[], key: string, msg: string) => save(key, { services: next }, msg);
  const groups = categories.map((cat) => ({ cat, items: svc.map((s, i) => ({ s, i })).filter(({ s }) => (s.category && categories.includes(s.category) ? s.category : location.primaryCategory) === cat) }));
  const ideas = [...suggestions.websiteServices, ...suggestions.marketServices];

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.cat}>
          <SubHead
            action={
              <button type="button" className={buttonClass("ghost", "sm", "h-7")} onClick={() => setEditing({ index: null, item: { name: "", category: g.cat } })}>
                <Plus /> Add service
              </button>
            }
          >
            {g.cat} · {g.items.length}
          </SubHead>
          {g.items.length ? (
            <ul className="divide-y rounded-xl border">
              {g.items.map(({ s, i }) => (
                <li key={s.name}>
                  <button type="button" onClick={() => setEditing({ index: i, item: s })} className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.name}</span>
                      <span className={cn("block truncate text-xs", s.description ? "text-muted-foreground" : "text-warning")}>{s.description || "No description. Add one to help customers decide."}</span>
                    </span>
                    <span className={cn("shrink-0 text-sm tabular-nums", servicePrice(s) ? "font-semibold" : "text-xs text-muted-foreground")}>{servicePrice(s) || "No price"}</span>
                    <Pencil className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <button type="button" onClick={() => setEditing({ index: null, item: { name: "", category: g.cat } })} className="w-full rounded-xl border border-dashed px-4 py-3 text-left text-sm text-muted-foreground hover:border-primary hover:text-primary">
              + Add a {g.cat.toLowerCase()} service
            </button>
          )}
        </div>
      ))}

      <div>
        <SubHead
          action={
            ideas.length > 1 ? (
              <button type="button" className={buttonClass("ghost", "sm", "h-7")} disabled={!!busy} onClick={() => set([...svc, ...ideas.map((s) => ({ name: s.name, category: location.primaryCategory }))], "add-all", `${ideas.length} services added`)}>
                <Plus /> Add all
              </button>
            ) : undefined
          }
        >
          <span className="inline-flex items-center gap-1.5">
            Suggested
            {suggestions.websiteSource && <span className="font-normal normal-case tracking-normal text-muted-foreground">· from {suggestions.websiteSource} and nearby competitors</span>}
          </span>
        </SubHead>
        <SuggestionChips items={ideas} busyKey={busy} onAdd={(s) => set([...svc, { name: s.name, category: location.primaryCategory }], `add:${s.name}`, `Added "${s.name}". Add a price next.`)} />
        {!suggestions.websiteSource && <p className="mt-2 text-xs text-muted-foreground">Add your website in Business info to get suggestions from it.</p>}
      </div>

      <ServiceModal
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing?.item ?? null}
        categories={categories}
        busy={!!busy}
        onSave={(item) => {
          const idx = editing?.index;
          if (svc.some((s, i) => i !== idx && s.name.toLowerCase() === item.name.toLowerCase())) {
            toast.error(`"${item.name}" is already listed`);
            return Promise.resolve(false);
          }
          const next = idx == null ? [...svc, item] : svc.map((s, i) => (i === idx ? item : s));
          return set(next, "svc", idx == null ? `Added "${item.name}"` : "Service saved");
        }}
        onDelete={editing?.index != null ? () => set(svc.filter((_, i) => i !== editing.index), "svc", `Deleted "${editing.item?.name}"`) : undefined}
      />
    </div>
  );
}

// ---------------------------------------------------------------- products
const PRODUCT_PRICE_TYPES: { value: ProductPriceType; label: string }[] = [
  { value: "none", label: "No price" },
  { value: "fixed", label: "Fixed" },
  { value: "range", label: "Range" },
];

function ProductModal({
  open,
  onClose,
  initial,
  categories,
  onSave,
  onDelete,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  initial: Product | null;
  categories: string[];
  onSave: (p: Product) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  busy: boolean;
}) {
  const empty = { name: "", category: "", priceType: "fixed" as ProductPriceType, price: "", priceMax: "", description: "", photo: "", button: "none" as ProductButton, buttonUrl: "" };
  const [f, setF] = useState(empty);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open)
      setF({
        name: initial?.name ?? "",
        category: initial?.category ?? "",
        priceType: initial?.priceType ?? "fixed",
        price: initial?.price != null ? String(initial.price) : "",
        priceMax: initial?.priceMax != null ? String(initial.priceMax) : "",
        description: initial?.description ?? "",
        photo: initial?.photo ?? "",
        button: initial?.button ?? "none",
        buttonUrl: initial?.buttonUrl ?? "",
      });
  }, [open, initial]);
  const needsUrl = f.button !== "none" && f.button !== "call";
  const priceOk = f.priceType === "none" || (num(f.price) != null && (f.priceType === "fixed" || num(f.priceMax) == null || num(f.priceMax)! >= num(f.price)!));
  const valid = f.name.trim() && priceOk && (!needsUrl || /^https?:\/\/\S+\.\S+/.test(f.buttonUrl.trim()));
  const pick = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choose an image file");
    try {
      setF((x) => ({ ...x, photo: "" }));
      const url = await readImage(file);
      setF((x) => ({ ...x, photo: url }));
    } catch {
      toast.error("Couldn't read that image");
    }
  };
  const submit = async () => {
    const p: Product = {
      name: f.name.trim(),
      ...(f.category.trim() && { category: f.category.trim() }),
      priceType: f.priceType,
      ...(f.priceType !== "none" && { price: num(f.price) }),
      ...(f.priceType === "range" && num(f.priceMax) != null && { priceMax: num(f.priceMax) }),
      ...(f.description.trim() && { description: f.description.trim() }),
      ...(f.photo && { photo: f.photo }),
      button: f.button,
      ...(needsUrl && { buttonUrl: f.buttonUrl.trim() }),
    };
    if (await onSave(p)) onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.name && onDelete ? "Edit product" : "Add product"} className="sm:max-w-2xl">
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void submit();
        }}
      >
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-4 sm:grid-cols-[200px_minmax(0,1fr)]">
          <div>
            <FieldHead label="Photo" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void pick(e.dataTransfer.files[0]);
              }}
              className="group relative flex aspect-square w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed bg-muted/40 text-xs text-muted-foreground hover:border-primary hover:text-primary"
            >
              {f.photo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute inset-x-2 bottom-2 rounded-md bg-card/90 py-1 text-center font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100">Replace photo</span>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span className="font-medium">Upload photo</span>
                  <span className="text-[11px]">Square, 720px+</span>
                </>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            {f.photo && (
              <button type="button" className={buttonClass("ghost", "sm", "mt-1 h-7 w-full text-xs")} onClick={() => setF({ ...f, photo: "" })}>
                Remove photo
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <FieldHead label="Product name" htmlFor="p-name" count={f.name.length} max={PRODUCT_NAME_MAX} />
              <input id="p-name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={PRODUCT_NAME_MAX} className={cn(inputClass, "h-10")} />
            </div>
            <div>
              <FieldHead label="Product category" htmlFor="p-cat" count={f.category.length} max={PRODUCT_NAME_MAX} />
              <input id="p-cat" list="p-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} maxLength={PRODUCT_NAME_MAX} placeholder="e.g. Oral care" className={cn(inputClass, "h-10")} />
              <datalist id="p-cats">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <FieldHead label="Price (USD)" />
              <Segmented value={f.priceType} onChange={(v) => setF({ ...f, priceType: v })} options={PRODUCT_PRICE_TYPES} label="Price type" />
              {f.priceType !== "none" && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-32">
                    <PriceInput value={f.price} onChange={(v) => setF({ ...f, price: v })} label={f.priceType === "range" ? "Minimum price" : "Price"} />
                  </div>
                  {f.priceType === "range" && (
                    <>
                      <span className="text-xs text-muted-foreground">to</span>
                      <div className="w-32">
                        <PriceInput value={f.priceMax} onChange={(v) => setF({ ...f, priceMax: v })} label="Maximum price" />
                      </div>
                    </>
                  )}
                </div>
              )}
              {!priceOk && f.price !== "" && <p className="mt-1 text-xs text-destructive">The maximum price must be at least the minimum.</p>}
            </div>
            <div>
              <FieldHead label="Description" htmlFor="p-desc" count={f.description.length} max={PRODUCT_DESCRIPTION_MAX} />
              <textarea id="p-desc" rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={PRODUCT_DESCRIPTION_MAX} className={inputClass} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <div>
                <FieldHead label="Button" />
                <SelectBox
                  value={f.button}
                  onChange={(v) => setF({ ...f, button: v as ProductButton })}
                  options={(Object.keys(PRODUCT_BUTTON_LABEL) as ProductButton[]).map((k) => ({ value: k, label: PRODUCT_BUTTON_LABEL[k] }))}
                  label="Button"
                  className="[&_select]:h-10"
                />
              </div>
              {needsUrl && (
                <div>
                  <FieldHead label="Button link" htmlFor="p-url" />
                  <input id="p-url" type="url" value={f.buttonUrl} onChange={(e) => setF({ ...f, buttonUrl: e.target.value })} placeholder="https://" className={cn(inputClass, "h-10")} />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-3">
          {onDelete && (
            <button type="button" className={buttonClass("ghost", "sm", "text-destructive hover:bg-destructive/10 hover:text-destructive")} disabled={busy} onClick={async () => (await onDelete()) && onClose()}>
              <Trash2 /> Delete
            </button>
          )}
          <button type="button" className={buttonClass("outline", "sm", "ml-auto")} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={buttonClass("default", "sm")} disabled={!valid || busy}>
            {busy && <Loader2 className="animate-spin" />} Save product
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ProductsEditor({ location, suggestions }: { location: Location; suggestions: Suggestion[] }) {
  const { busy, save } = useSave(location.id);
  const products = useMemo(() => location.products ?? [], [location.products]);
  const [editing, setEditing] = useState<{ index: number | null; item: Product | null } | null>(null);
  const [cat, setCat] = useState("all");
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean) as string[])], [products]);
  const shown = products.map((p, i) => ({ p, i })).filter(({ p }) => cat === "all" || p.category === cat);
  const set = (next: Product[], key: string, msg: string) => save(key, { products: next }, msg);

  return (
    <div className="space-y-6">
      <div>
        <SubHead
          action={
            <button type="button" className={buttonClass("default", "sm", "h-8")} onClick={() => setEditing({ index: null, item: null })}>
              <Plus /> Add product
            </button>
          }
        >
          Catalogue · {products.length}
        </SubHead>
        {categories.length > 1 && (
          <Segmented size="sm" value={cat} onChange={setCat} label="Product category" className="mb-3" options={[{ value: "all", label: "All" }, ...categories.map((c) => ({ value: c, label: c }))]} />
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map(({ p, i }) => {
            const missing = [!p.photo && "photo", !productPrice(p) && "price", !p.description && "description"].filter(Boolean);
            return (
              <button key={p.name} type="button" onClick={() => setEditing({ index: i, item: p })} className="group overflow-hidden rounded-xl border text-left transition-colors hover:border-primary/40">
                <span className="relative flex aspect-[4/3] items-center justify-center bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.photo ? <img src={p.photo} alt="" className="h-full w-full object-cover" /> : <Package className="h-7 w-7 text-muted-foreground/50" />}
                  <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-card/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                </span>
                <span className="block space-y-0.5 px-3 py-2.5">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-muted-foreground">{p.category || "No category"}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{productPrice(p)}</span>
                  </span>
                  {missing.length > 0 && <span className="block truncate text-[11px] text-warning">Missing {missing.join(", ")}</span>}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setEditing({ index: null, item: null })}
            className="flex min-h-40 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="h-5 w-5" />
            Add product
          </button>
        </div>
      </div>

      <div>
        <SubHead>Suggested for {location.primaryCategory.toLowerCase()}s</SubHead>
        <SuggestionChips items={suggestions} onAdd={(s) => setEditing({ index: null, item: { name: s.name } })} />
      </div>

      <ProductModal
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing?.item ?? null}
        categories={categories}
        busy={!!busy}
        onSave={(item) => {
          const idx = editing?.index;
          if (products.some((p, i) => i !== idx && p.name.toLowerCase() === item.name.toLowerCase())) {
            toast.error(`"${item.name}" is already listed`);
            return Promise.resolve(false);
          }
          const next = idx == null ? [...products, item] : products.map((p, i) => (i === idx ? item : p));
          return set(next, "prod", idx == null ? `Added "${item.name}"` : "Product saved");
        }}
        onDelete={editing?.index != null ? () => set(products.filter((_, i) => i !== editing.index), "prod", `Deleted "${editing.item?.name}"`) : undefined}
      />
    </div>
  );
}
