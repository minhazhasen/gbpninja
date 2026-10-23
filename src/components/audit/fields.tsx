"use client";

// Google-style "Business information" tabs: About, Contact, Location, Hours, More.
// Each field shows its current value; clicking it opens an inline editor (one at a time), like the real GBP editor.
import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, CirclePause, Clock, Infinity as InfinityIcon, ExternalLink, Loader2, Pencil, Plus, Wand2, X } from "lucide-react";
import { Card, buttonClass, inputClass } from "@/components/ui";
import { Segmented, SelectBox, Switch, useConfirm } from "@/components/ui-client";
import { searchCategories } from "@/app/(app)/actions";
import { DateField, TimeField } from "@/components/date-time-field";
import { pointsGain, type AuditCheck, type AuditSection } from "@/lib/audit";
import type { AttributeDef, AttributeValue, HoursPeriod, Location, OpenStatus, PostalAddress, ProfileSuggestions, SocialNetwork, SpecialHours, Suggestion } from "@/lib/gbp/types";
import {
  ATTRIBUTE_GROUPS,
  COUNTRIES,
  DAYS,
  DESCRIPTION_GOOD,
  DESCRIPTION_MAX,
  MAX_ADDITIONAL_PHONES,
  MAX_SECONDARY_CATEGORIES,
  MAX_SERVICE_AREAS,
  MORE_HOURS_TYPES,
  OPEN_STATUS,
  openStatusLabel,
  SOCIAL_NETWORKS,
  US_STATES,
  formatAddress,
  parseAddress,
  formatOpeningDate,
  hasContactInText,
  suggestDescription,
  type Day,
} from "@/lib/profile";
import { cn } from "@/lib/utils";
import { Chip, FieldHead, useDraft, useSave, type OnDraft } from "./shared";

const GOOGLE_URL = "https://business.google.com/";
const DAY_NAME: Record<Day, string> = { MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday" };

export const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
};
const dayText = (periods: HoursPeriod[], d: Day) => {
  const ps = periods.filter((p) => p.day === d).sort((a, b) => a.open.localeCompare(b.open));
  return ps.length ? ps.map((p) => `${fmtTime(p.open)}–${fmtTime(p.close)}`).join(", ") : "Closed";
};
/** "Mon–Thu 9 AM–5 PM" lines, grouping consecutive days with the same hours. */
export function weekSummary(periods: HoursPeriod[]) {
  const groups: { from: Day; to: Day; text: string }[] = [];
  for (const d of DAYS) {
    const text = dayText(periods, d);
    const last = groups.at(-1);
    if (last && last.text === text) last.to = d;
    else groups.push({ from: d, to: d, text });
  }
  return groups.map((g) => `${g.from === g.to ? DAY_NAME[g.from] : `${DAY_NAME[g.from].slice(0, 3)}–${DAY_NAME[g.to].slice(0, 3)}`}: ${g.text}`);
}
export const periodsInvalid = (ps: HoursPeriod[]) =>
  ps.some((p) => p.close <= p.open) ||
  DAYS.some((d) => {
    const s = ps.filter((p) => p.day === d).sort((a, b) => a.open.localeCompare(b.open));
    return s.some((p, i) => i > 0 && p.open < s[i - 1].close);
  });

// ---------------------------------------------------------------- building blocks
type Ctx = {
  location: Location;
  checks: Map<string, AuditCheck>;
  total: number;
  onDraft: OnDraft;
  suggestions: ProfileSuggestions;
  /** Tells the board which field is open so the guide panel can follow it. */
  onFocusField: (key: string | null) => void;
  /** The guide panel asked to add a category to the open category editor (`n` changes on every request). */
  categoryRequest?: { name: string; n: number } | null;
};

function FieldStatus({ checks, total }: { checks: AuditCheck[]; total: number }) {
  if (!checks.length) return null;
  const open = checks.filter((c) => c.status !== "pass");
  if (!open.length) return <CheckCircle2 className="h-4 w-4 text-success" aria-label="Done" />;
  const fail = open.some((c) => c.status === "fail");
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums text-primary" title={open.map((c) => c.detail).join(" ")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", fail ? "bg-destructive" : "bg-warning")} />+{open.reduce((n, c) => n + pointsGain(c, total), 0)} pts
    </span>
  );
}

/** One field: read view with value, or the inline editor when editing. */
function Field({
  label,
  value,
  checks,
  total,
  editing,
  onEdit,
  editable = true,
  children,
}: {
  label: string;
  value: React.ReactNode;
  checks: AuditCheck[];
  total: number;
  editing: boolean;
  onEdit: () => void;
  editable?: boolean;
  children?: React.ReactNode;
}) {
  const hints = checks.filter((c) => c.status !== "pass");
  if (editing)
    return (
      <div className="bg-muted/20 px-5 py-4 lg:px-6">
        <p className="mb-1 text-sm font-semibold">{label}</p>
        {hints.length > 0 && (
          <ul className="mb-3 space-y-0.5">
            {hints.map((c) => (
              <li key={c.id} className="text-xs text-muted-foreground">
                <span className={c.status === "fail" ? "text-destructive" : "text-warning"}>{c.status === "fail" ? "Missing" : "Needs work"}</span> · {c.detail}
              </li>
            ))}
          </ul>
        )}
        {children}
      </div>
    );
  const empty = value == null || value === false || value === "" || (Array.isArray(value) && !value.length);
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className={cn("mt-0.5 block break-words text-sm", empty ? (editable ? "font-medium text-primary" : "text-muted-foreground") : "text-muted-foreground")}>
          {empty ? (editable ? "Add" : "—") : value}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3 pt-0.5">
        <FieldStatus checks={checks} total={total} />
        {editable && <Pencil className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />}
      </span>
    </>
  );
  return editable ? (
    <button
      type="button"
      onClick={onEdit}
      className="group flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none lg:px-6"
    >
      {body}
    </button>
  ) : (
    <div className="flex items-start gap-4 px-5 py-4 lg:px-6">{body}</div>
  );
}

function EditActions({ onCancel, onSave, busy, disabled, error, note }: { onCancel: () => void; onSave: () => void; busy: boolean; disabled?: boolean; error?: string | null; note?: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
      <span className={cn("mr-auto text-xs", error ? "font-semibold text-destructive" : "text-muted-foreground")}>{error || note}</span>
      <button type="button" className={buttonClass("outline", "sm")} onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className={buttonClass("default", "sm")} disabled={disabled || busy || !!error} onClick={onSave}>
        {busy && <Loader2 className="animate-spin" />} Save
      </button>
    </div>
  );
}

function SectionCard({ section, total, children }: { section: AuditSection; total: number; children: React.ReactNode }) {
  const open = section.checks.filter((c) => c.status !== "pass");
  return (
    <Card className="overflow-hidden">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b px-5 py-3 lg:px-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{section.title}</h2>
          <p className="truncate text-xs text-muted-foreground">{section.summary}</p>
        </div>
        {open.length ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {open.length} to fix · <span className="font-semibold text-primary">+{open.reduce((n, c) => n + pointsGain(c, total), 0)} pts</span>
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> All done
          </span>
        )}
      </div>
      <div className="divide-y">{children}</div>
    </Card>
  );
}

/** Field list with one editor open at a time. */
function useEditing(report: (key: string | null) => void) {
  const [editing, setEditing] = useState<string | null>(null);
  const set = (k: string | null) => {
    setEditing(k);
    report(k);
  };
  return { is: (k: string) => editing === k, open: (k: string) => () => set(k), close: () => set(null) };
}
const pick = (checks: Map<string, AuditCheck>, ...ids: string[]) => ids.map((id) => checks.get(id)).filter(Boolean) as AuditCheck[];

/** Generic single-value editor: local state, live draft, Save/Cancel. */
function useFieldSave(location: Location, onDone: () => void) {
  const { busy, save } = useSave(location.id);
  return {
    busy: !!busy,
    // Location uses plain strings for days; the action validates them.
    commit: async (patch: Partial<Location>, msg: string) => (await save("field", patch as Parameters<typeof save>[1], msg)) && onDone(),
  };
}

function TextFieldEditor({
  location,
  field,
  onDraft,
  onDone,
  placeholder,
  type = "text",
  note,
  label,
}: {
  location: Location;
  field: "title" | "websiteUri" | "appointmentUri" | "chatUri";
  onDraft: OnDraft;
  onDone: () => void;
  placeholder?: string;
  type?: string;
  note?: string;
  label: string;
}) {
  const [v, setV] = useState((location[field] as string | undefined) ?? "");
  useDraft(onDraft, { [field]: v });
  const { busy, commit } = useFieldSave(location, onDone);
  const urlBad = type === "url" && v.trim() !== "" && !/^https?:\/\/\S+\.\S+/.test(v.trim());
  const save = async () => {
    await commit({ [field]: v.trim() }, `${label} saved`);
  };
  return (
    <>
      <input
        autoFocus
        type={type}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone();
          if (e.key === "Enter" && !urlBad && !(field === "title" && !v.trim())) {
            e.preventDefault();
            void save();
          }
        }}
        placeholder={placeholder}
        className={cn(inputClass, "h-10 max-w-xl")}
        aria-label={label}
      />
      <EditActions
        onCancel={onDone}
        busy={busy}
        disabled={v === ((location[field] as string | undefined) ?? "") || (field === "title" && !v.trim())}
        error={urlBad ? "Enter a full link starting with https://" : null}
        note={note}
        onSave={save}
      />
    </>
  );
}

// ---------------------------------------------------------------- About
export function AboutFields({ section, ctx }: { section: AuditSection; ctx: Ctx }) {
  const { location: l, checks, total, onDraft, suggestions } = ctx;
  const e = useEditing(ctx.onFocusField);
  const { confirm, dialog } = useConfirm();
  // Like the primary category: warn before the name editor opens.
  const editName = async () => {
    const ok = await confirm({
      title: "Change your business name?",
      description:
        "Google may review a name change before it goes live, and the profile can be suspended if the name doesn't match the name customers see on your sign, website and documents. Don't add keywords or locations to it.",
      confirmLabel: "Change name",
    });
    if (ok) e.open("name")();
  };
  return (
    <SectionCard section={section} total={total}>
      {dialog}
      <Field label="Verification" value={l.verified ? "Verified with Google" : "Not verified"} checks={pick(checks, "verified")} total={total} editing={false} onEdit={() => {}} editable={false} />
      {!l.verified && (
        <div className="-mt-2 px-5 pb-4 lg:px-6">
          <a href={GOOGLE_URL} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}>
            Verify in Google <ExternalLink />
          </a>
        </div>
      )}
      <Field label="Business name" value={l.title} checks={[]} total={total} editing={e.is("name")} onEdit={editName}>
        <TextFieldEditor location={l} field="title" label="Business name" onDraft={onDraft} onDone={e.close} note="Use your real-world name. Google may review name changes." />
      </Field>
      <Field
        label="Business category"
        value={
          <span className="space-y-0.5">
            <span className="flex items-center gap-2">
              {l.primaryCategory}
              <span className="rounded border px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Primary</span>
            </span>
            {l.additionalCategories.map((c) => (
              <span key={c} className="block">
                {c}
              </span>
            ))}
          </span>
        }
        checks={pick(checks, "primary-category", "secondary-categories")}
        total={total}
        editing={e.is("cat")}
        onEdit={e.open("cat")}
      >
        <CategoryEditor location={l} suggestions={suggestions} onDraft={onDraft} onDone={e.close} request={ctx.categoryRequest} />
      </Field>
      <Field
        label="Description"
        value={l.description}
        checks={pick(checks, "description-length", "description-keywords", "description-policy")}
        total={total}
        editing={e.is("desc")}
        onEdit={e.open("desc")}
      >
        <DescriptionEditor location={l} onDraft={onDraft} onDone={e.close} />
      </Field>
      <Field label="Opening date" value={formatOpeningDate(l.openingDate)} checks={pick(checks, "opening-date")} total={total} editing={e.is("open")} onEdit={e.open("open")}>
        <OpeningDateEditor location={l} onDraft={onDraft} onDone={e.close} />
      </Field>
    </SectionCard>
  );
}

/** Typeahead over Google's category list. Empty input shows suggestions for this profile. */
function CategoryCombobox({
  placeholder,
  exclude,
  suggestions,
  onPick,
  disabled,
  autoFocus,
  label,
}: {
  placeholder: string;
  exclude: string[];
  suggestions: Suggestion[];
  onPick: (name: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  label: string;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(!!autoFocus);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ name: string; reason?: string }[]>([]);
  const [active, setActive] = useState(0);
  const taken = (n: string) => exclude.some((x) => x.toLowerCase() === n.toLowerCase());

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults(suggestions.filter((s) => !taken(s.name)).map((s) => ({ name: s.name, reason: s.reason })));
      setLoading(false);
      return;
    }
    setLoading(true);
    let stale = false;
    const t = setTimeout(async () => {
      const res = await searchCategories(query);
      if (stale) return;
      setLoading(false);
      setResults(res.ok ? res.categories.filter((c) => !taken(c.displayName)).map((c) => ({ name: c.displayName })) : []);
      setActive(0);
    }, 150);
    return () => {
      stale = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, suggestions, exclude.join("|")]);

  const choose = (name: string) => {
    onPick(name);
    setQ("");
    setActive(0);
  };
  const showList = open && !disabled && (results.length > 0 || q.trim() !== "");
  return (
    <div className="relative max-w-xl">
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-activedescendant={showList && results[active] ? `${id}-opt-${active}` : undefined}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        disabled={disabled}
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (results[active]) choose(results[active].name);
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className={cn(inputClass, "h-10")}
      />
      {loading && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
      {showList && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border bg-card shadow-lg">
          {!q.trim() && <p className="border-b px-3 py-2 label-caps">Suggested for this profile</p>}
          <ul id={`${id}-list`} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto py-1">
            {results.map((r, i) => (
              <li
                key={r.name}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r.name)}
                className={cn("cursor-pointer px-3 py-2 text-sm", i === active && "bg-accent text-accent-foreground")}
              >
                {r.name}
                {r.reason && <span className="block text-xs text-muted-foreground">{r.reason}</span>}
              </li>
            ))}
            {!results.length && !loading && <li className="px-3 py-3 text-sm text-muted-foreground">No matching category. Google only accepts categories from its list.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function CategoryEditor({
  location,
  suggestions,
  onDraft,
  onDone,
  request,
}: {
  location: Location;
  suggestions: ProfileSuggestions;
  onDraft: OnDraft;
  onDone: () => void;
  request?: { name: string; n: number } | null;
}) {
  const [primary, setPrimary] = useState(location.primaryCategory);
  const [extra, setExtra] = useState(location.additionalCategories);
  // "+" in the guide panel (competitors' categories) adds to this draft; Save still saves it.
  const handled = useRef(request?.n ?? 0);
  useEffect(() => {
    if (!request || request.n === handled.current) return;
    handled.current = request.n;
    const k = request.name.toLowerCase();
    if (k === primary.toLowerCase()) return;
    setExtra((xs) => (xs.length >= MAX_SECONDARY_CATEGORIES || xs.some((x) => x.toLowerCase() === k) ? xs : [...xs, request.name]));
  }, [request, primary]);
  const [changingPrimary, setChangingPrimary] = useState(false);
  const { confirm, dialog } = useConfirm();
  useDraft(onDraft, { primaryCategory: primary, additionalCategories: extra });
  const { busy, commit } = useFieldSave(location, onDone);
  const full = extra.length >= MAX_SECONDARY_CATEGORIES;

  const startPrimaryChange = async () => {
    const ok = await confirm({
      title: "Change your primary category?",
      description:
        "Your primary category has the biggest effect on which searches you appear in. Changing it can lower your ranking while Google re-evaluates the profile, and Google may review the change. Services tied to the old category can be removed.",
      confirmLabel: "Change category",
    });
    if (ok) setChangingPrimary(true);
  };

  return (
    <div className="space-y-5">
      {dialog}
      <div>
        <FieldHead label="Primary category" />
        {changingPrimary ? (
          <div className="space-y-2">
            <CategoryCombobox
              autoFocus
              label="Primary category"
              placeholder="Search Google categories"
              exclude={[primary]}
              suggestions={[]}
              onPick={(name) => {
                setPrimary(name);
                setExtra((xs) => xs.filter((x) => x.toLowerCase() !== name.toLowerCase()));
                setChangingPrimary(false);
              }}
            />
            <button type="button" className={buttonClass("ghost", "sm", "h-7 px-2")} onClick={() => setChangingPrimary(false)}>
              Keep {primary}
            </button>
          </div>
        ) : (
          <div className="flex max-w-xl items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <span className="truncate">{primary}</span>
              <span className="shrink-0 rounded border px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Primary</span>
              {primary !== location.primaryCategory && <span className="shrink-0 text-xs font-normal text-warning">Changed from {location.primaryCategory}</span>}
            </span>
            <button type="button" className={buttonClass("ghost", "sm", "h-8")} onClick={startPrimaryChange}>
              <Pencil /> Change
            </button>
          </div>
        )}
      </div>

      <div>
        <FieldHead label={`Additional categories · ${extra.length} of ${MAX_SECONDARY_CATEGORIES}`} />
        {extra.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {extra.map((c) => (
              <Chip key={c} onRemove={() => setExtra(extra.filter((x) => x !== c))}>
                {c}
              </Chip>
            ))}
          </div>
        )}
        <CategoryCombobox
          label="Additional category"
          placeholder={full ? `Google allows ${MAX_SECONDARY_CATEGORIES} additional categories` : "Search Google categories to add"}
          disabled={full}
          exclude={[primary, ...extra]}
          suggestions={suggestions.categories}
          onPick={(name) => setExtra((xs) => (xs.length >= MAX_SECONDARY_CATEGORIES ? xs : [...xs, name]))}
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">Pick categories that describe what you do, not what you sell or where you are.</p>
      </div>

      <EditActions onCancel={onDone} busy={busy} disabled={changingPrimary} onSave={() => commit({ primaryCategory: primary, additionalCategories: extra }, "Categories saved")} />
    </div>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Google's opening date: Year and Month required, Day optional. Stored as YYYY-MM or YYYY-MM-DD. */
function OpeningDateEditor({ location, onDraft, onDone }: { location: Location; onDraft: OnDraft; onDone: () => void }) {
  const [y0, m0, d0] = (location.openingDate ?? "").split("-");
  const [year, setYear] = useState(y0 ?? "");
  const [month, setMonth] = useState(m0 ? String(Number(m0)) : "");
  const [day, setDay] = useState(d0 ? String(Number(d0)) : "");
  const maxYear = new Date().getFullYear() + 1;
  const yearNum = Number(year);
  const yearOk = /^\d{4}$/.test(year) && yearNum >= 1800 && yearNum <= maxYear;
  const daysInMonth = yearOk && month ? new Date(yearNum, Number(month), 0).getDate() : 31;
  const dayOk = !day || Number(day) <= daysInMonth;
  const value = yearOk && month ? `${year}-${month.padStart(2, "0")}${day && dayOk ? `-${day.padStart(2, "0")}` : ""}` : "";
  useDraft(onDraft, value ? { openingDate: value } : {});
  const { busy, commit } = useFieldSave(location, onDone);
  const error = year && !yearOk ? `Enter a year between 1800 and ${maxYear}.` : !dayOk ? `${MONTHS[Number(month) - 1]} ${year} has ${daysInMonth} days.` : null;

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">Add the date that you opened or will open at this address.</p>
      <div className="grid max-w-xl gap-3 sm:grid-cols-3">
        <div>
          <FieldHead label="Year *" htmlFor="od-year" />
          <input
            id="od-year"
            autoFocus
            inputMode="numeric"
            maxLength={4}
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
            placeholder="2001"
            aria-invalid={!!year && !yearOk}
            className={cn(inputClass, "h-10 tabular-nums", year && !yearOk && "border-destructive")}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Required</p>
        </div>
        <div>
          <FieldHead label="Month *" />
          <SelectBox
            value={month}
            onChange={setMonth}
            label="Month"
            className="[&_select]:h-10"
            options={[{ value: "", label: "Select month" }, ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))]}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Required</p>
        </div>
        <div>
          <FieldHead label="Day" />
          <SelectBox
            value={day}
            onChange={setDay}
            label="Day"
            className="[&_select]:h-10"
            options={[{ value: "", label: "None" }, ...Array.from({ length: daysInMonth }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))]}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Optional</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs font-semibold text-destructive">{error}</span>
        {location.openingDate && (
          <button
            type="button"
            className={buttonClass("ghost", "sm", "text-destructive hover:bg-destructive/10 hover:text-destructive")}
            disabled={busy}
            onClick={() => commit({ openingDate: "" }, "Opening date removed")}
          >
            Delete
          </button>
        )}
        <button type="button" className={buttonClass("outline", "sm")} onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className={buttonClass("default", "sm")}
          disabled={busy || !value || !!error || value === location.openingDate}
          onClick={() => commit({ openingDate: value }, "Opening date saved")}
        >
          {busy && <Loader2 className="animate-spin" />} Save
        </button>
      </div>
    </div>
  );
}

function DescriptionEditor({ location, onDraft, onDone }: { location: Location; onDraft: OnDraft; onDone: () => void }) {
  const [text, setText] = useState(location.description ?? "");
  useDraft(onDraft, { description: text });
  const { busy, commit } = useFieldSave(location, onDone);
  const len = text.trim().length;
  return (
    <div>
      <textarea
        autoFocus
        rows={7}
        value={text}
        maxLength={DESCRIPTION_MAX}
        onChange={(e) => setText(e.target.value)}
        className={inputClass}
        placeholder="Describe what you do, who you serve and what makes you different."
        aria-label="Description"
      />
      <div className="mt-2 flex items-center gap-3">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <span
            className={cn("block h-full rounded-full transition-[width]", len >= DESCRIPTION_GOOD ? "bg-success" : "bg-warning")}
            style={{ width: `${Math.min(100, (len / DESCRIPTION_GOOD) * 100)}%` }}
          />
        </span>
        <span className={cn("text-xs tabular-nums", len >= DESCRIPTION_GOOD ? "text-success" : "text-muted-foreground")}>
          {len}/{DESCRIPTION_MAX} · aim for {DESCRIPTION_GOOD}+
        </span>
        <button type="button" className={buttonClass("ghost", "sm", "h-7")} onClick={() => setText(suggestDescription(location))}>
          <Wand2 /> Suggest
        </button>
      </div>
      <EditActions
        onCancel={onDone}
        busy={busy}
        error={hasContactInText(text) ? "Remove links and phone numbers. Google may reject them." : null}
        onSave={() => commit({ description: text }, "Description saved")}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Contact
export function ContactFields({ section, ctx }: { section: AuditSection; ctx: Ctx }) {
  const { location: l, checks, total, onDraft } = ctx;
  const e = useEditing(ctx.onFocusField);
  const socials = SOCIAL_NETWORKS.filter((n) => l.socialProfiles?.[n.id]);
  return (
    <SectionCard section={section} total={total}>
      <Field
        label="Phone number"
        value={
          l.phone && (
            <>
              {l.phone}
              {(l.additionalPhones ?? []).map((p) => (
                <span key={p} className="block">
                  {p}
                </span>
              ))}
            </>
          )
        }
        checks={pick(checks, "phone")}
        total={total}
        editing={e.is("phone")}
        onEdit={e.open("phone")}
      >
        <PhoneEditor location={l} onDraft={onDraft} onDone={e.close} />
      </Field>
      <Field label="Chat" value={l.chatUri} checks={[]} total={total} editing={e.is("chat")} onEdit={e.open("chat")}>
        <TextFieldEditor
          location={l}
          field="chatUri"
          type="url"
          label="Chat link"
          placeholder="https://wa.me/15125550100"
          onDraft={onDraft}
          onDone={e.close}
          note="A WhatsApp or SMS link adds a Chat button."
        />
      </Field>
      <Field label="Website" value={l.websiteUri} checks={pick(checks, "website")} total={total} editing={e.is("web")} onEdit={e.open("web")}>
        <TextFieldEditor location={l} field="websiteUri" type="url" label="Website" placeholder="https://" onDraft={onDraft} onDone={e.close} />
      </Field>
      <Field label="Appointment link" value={l.appointmentUri} checks={pick(checks, "booking")} total={total} editing={e.is("book")} onEdit={e.open("book")}>
        <TextFieldEditor location={l} field="appointmentUri" type="url" label="Appointment link" placeholder="https://" onDraft={onDraft} onDone={e.close} note="Adds a Book button to your profile." />
      </Field>
      <Field
        label="Social profiles"
        value={
          socials.length > 0 &&
          socials.map((n) => (
            <span key={n.id} className="block truncate">
              {l.socialProfiles?.[n.id]}
            </span>
          ))
        }
        checks={pick(checks, "social-profiles")}
        total={total}
        editing={e.is("social")}
        onEdit={e.open("social")}
      >
        <SocialEditor location={l} onDraft={onDraft} onDone={e.close} />
      </Field>
    </SectionCard>
  );
}

function PhoneEditor({ location, onDraft, onDone }: { location: Location; onDraft: OnDraft; onDone: () => void }) {
  const [phone, setPhone] = useState(location.phone ?? "");
  const [more, setMore] = useState(location.additionalPhones ?? []);
  useDraft(onDraft, { phone, additionalPhones: more.filter((p) => p.trim()) });
  const { busy, commit } = useFieldSave(location, onDone);
  return (
    <div className="max-w-md space-y-3">
      <div>
        <FieldHead label="Primary phone" htmlFor="ph-1" />
        <input id="ph-1" autoFocus type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 512 555 0100" className={cn(inputClass, "h-10")} />
      </div>
      {more.map((p, i) => (
        <div key={i}>
          <FieldHead label={`Additional phone ${i + 1}`} />
          <div className="flex gap-2">
            <input type="tel" value={p} onChange={(e) => setMore(more.map((x, j) => (j === i ? e.target.value : x)))} className={cn(inputClass, "h-10")} aria-label={`Additional phone ${i + 1}`} />
            <button type="button" className={buttonClass("ghost", "icon", "h-10 w-10 text-muted-foreground")} onClick={() => setMore(more.filter((_, j) => j !== i))} aria-label="Remove number">
              <X />
            </button>
          </div>
        </div>
      ))}
      {more.length < MAX_ADDITIONAL_PHONES && (
        <button type="button" className={buttonClass("ghost", "sm", "h-8 px-2")} onClick={() => setMore([...more, ""])}>
          <Plus /> Add phone number
        </button>
      )}
      <EditActions onCancel={onDone} busy={busy} onSave={() => commit({ phone: phone.trim(), additionalPhones: more.map((p) => p.trim()).filter(Boolean) }, "Phone numbers saved")} />
    </div>
  );
}

function SocialEditor({ location, onDraft, onDone }: { location: Location; onDraft: OnDraft; onDone: () => void }) {
  const [v, setV] = useState<Partial<Record<SocialNetwork, string>>>(location.socialProfiles ?? {});
  useDraft(onDraft, { socialProfiles: v });
  const { busy, commit } = useFieldSave(location, onDone);
  const bad = Object.values(v).some((x) => x && !/^https?:\/\/\S+\.\S+/.test(x.trim()));
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SOCIAL_NETWORKS.map((n) => (
          <div key={n.id}>
            <FieldHead label={n.label} htmlFor={`so-${n.id}`} />
            <input id={`so-${n.id}`} type="url" value={v[n.id] ?? ""} onChange={(e) => setV({ ...v, [n.id]: e.target.value })} placeholder={n.placeholder} className={cn(inputClass, "h-10")} />
          </div>
        ))}
      </div>
      <EditActions
        onCancel={onDone}
        busy={busy}
        error={bad ? "Enter full profile links starting with https://" : null}
        onSave={() => commit({ socialProfiles: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, (x ?? "").trim()])) }, "Social profiles saved")}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Location
export function LocationFields({ section, ctx }: { section: AuditSection; ctx: Ctx }) {
  const { location: l, checks, total, onDraft } = ctx;
  const e = useEditing(ctx.onFocusField);
  const areas = l.serviceArea ?? [];
  return (
    <SectionCard section={section} total={total}>
      <Field
        label="Business location"
        value={
          l.address && (
            <span className="block space-y-2">
              <span className="block">{l.address}</span>
              {l.hideAddress && <span className="block text-xs text-warning">Hidden from customers</span>}
              <GoogleMap address={l.address} />
            </span>
          )
        }
        checks={pick(checks, "address")}
        total={total}
        editing={e.is("addr")}
        onEdit={e.open("addr")}
      >
        <AddressEditor location={l} onDraft={onDraft} onDone={e.close} />
      </Field>
      <Field
        label="Service area"
        value={
          areas.length > 0 &&
          areas.map((a) => (
            <span key={a} className="block">
              {a}
            </span>
          ))
        }
        checks={pick(checks, "service-area")}
        total={total}
        editing={e.is("area")}
        onEdit={e.open("area")}
      >
        <AreaEditor location={l} onDraft={onDraft} onDone={e.close} />
      </Field>
    </SectionCard>
  );
}

/** Real Google map for an address (keyless embed). Waits for typing to settle before reloading. */
function GoogleMap({ address, className }: { address: string; className?: string }) {
  const [q, setQ] = useState(address);
  useEffect(() => {
    const t = setTimeout(() => setQ(address), 600);
    return () => clearTimeout(t);
  }, [address]);
  if (!q.trim()) return null;
  return (
    <span className={cn("block h-56 max-w-2xl overflow-hidden rounded-xl border bg-muted", className)}>
      <iframe
        title={`Map of ${q}`}
        src={`https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`}
        className="h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </span>
  );
}

/** Google's address form: country, street, optional line 2, city, state, ZIP. Saves the structured address. */
function AddressEditor({ location, onDraft, onDone }: { location: Location; onDraft: OnDraft; onDone: () => void }) {
  const initial = location.postalAddress ?? parseAddress(location.address);
  const [a, setA] = useState<PostalAddress>({ ...initial, addressLines: [initial.addressLines[0] ?? "", initial.addressLines[1] ?? ""] });
  const [line2, setLine2] = useState(!!initial.addressLines[1]);
  const [show, setShow] = useState(!location.hideAddress);
  const formatted = formatAddress(a);
  useDraft(onDraft, { address: formatted, hideAddress: !show });
  const { busy, commit } = useFieldSave(location, onDone);
  const set = (patch: Partial<PostalAddress>) => setA((x) => ({ ...x, ...patch }));
  const setLine = (i: number, v: string) => setA((x) => ({ ...x, addressLines: x.addressLines.map((l, j) => (j === i ? v : l)) }));
  const us = a.regionCode === "US";
  const error = !a.addressLines[0].trim()
    ? "Enter the street address."
    : !a.locality.trim()
      ? "Enter the city."
      : us && !a.administrativeArea
        ? "Pick a state."
        : us && !/^\d{5}(-\d{4})?$/.test(a.postalCode.trim())
          ? "Enter a 5-digit ZIP code."
          : null;
  const input = (id: string, label: string, value: string, onChange: (v: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <FieldHead label={label} htmlFor={id} />
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, "h-10")} {...props} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="max-w-2xl">
        <p className="mb-2 text-sm font-medium">Show business address to customers</p>
        <Segmented
          value={show ? "yes" : "no"}
          onChange={(v) => setShow(v === "yes")}
          label="Show business address to customers"
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
        <p className="mt-1 text-xs text-muted-foreground">Choose No if you serve customers at their location and they can&apos;t visit you. Add a service area instead.</p>
      </div>

      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FieldHead label="Country / region" />
          <SelectBox
            value={a.regionCode}
            onChange={(v) => set({ regionCode: v, administrativeArea: "" })}
            label="Country or region"
            className="[&_select]:h-10"
            options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
          />
        </div>
        <div className="sm:col-span-2">
          {input("addr-1", "Street address", a.addressLines[0], (v) => setLine(0, v), { autoFocus: true, placeholder: "120 Main St", autoComplete: "address-line1" })}
        </div>
        {line2 ? (
          <div className="sm:col-span-2">
            {input("addr-2", "Address line 2 (optional)", a.addressLines[1], (v) => setLine(1, v), { placeholder: "Suite, unit, #268", autoComplete: "address-line2" })}
          </div>
        ) : (
          <div className="sm:col-span-2">
            <button type="button" className={buttonClass("ghost", "sm", "h-8 px-2")} onClick={() => setLine2(true)}>
              <Plus /> Add address line
            </button>
          </div>
        )}
        {input("addr-city", "City", a.locality, (v) => set({ locality: v }), { autoComplete: "address-level2" })}
        {us ? (
          <div>
            <FieldHead label="State" />
            <SelectBox
              value={a.administrativeArea}
              onChange={(v) => set({ administrativeArea: v })}
              label="State"
              className="[&_select]:h-10"
              options={[{ value: "", label: "Select state" }, ...US_STATES.map(([code, name]) => ({ value: code, label: name }))]}
            />
          </div>
        ) : (
          input("addr-state", "State / province", a.administrativeArea, (v) => set({ administrativeArea: v }), { autoComplete: "address-level1" })
        )}
        {input("addr-zip", us ? "ZIP code" : "Postal code", a.postalCode, (v) => set({ postalCode: v }), { autoComplete: "postal-code", inputMode: us ? "numeric" : "text" })}
      </div>

      <div className="max-w-2xl">
        <p className="mb-1.5 text-xs text-muted-foreground">Check that the pin is on your entrance. If it isn&apos;t, adjust the pin in Google Business Profile.</p>
        <GoogleMap address={formatted} />
      </div>

      <EditActions
        onCancel={onDone}
        busy={busy}
        error={error}
        note="Address changes may need re-verification."
        onSave={() => commit({ postalAddress: { ...a, addressLines: a.addressLines.map((x) => x.trim()).filter(Boolean) }, address: formatted, hideAddress: !show }, "Location saved")}
      />
    </div>
  );
}

function AreaEditor({ location, onDraft, onDone }: { location: Location; onDraft: OnDraft; onDone: () => void }) {
  const [areas, setAreas] = useState(location.serviceArea ?? []);
  const [add, setAdd] = useState("");
  useDraft(onDraft, { serviceArea: areas });
  const { busy, commit } = useFieldSave(location, onDone);
  const full = areas.length >= MAX_SERVICE_AREAS;
  const push = () => {
    const v = add.trim();
    if (v && !full && !areas.some((a) => a.toLowerCase() === v.toLowerCase())) setAreas([...areas, v]);
    setAdd("");
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {areas.map((a) => (
          <Chip key={a} onRemove={() => setAreas(areas.filter((x) => x !== a))}>
            {a}
          </Chip>
        ))}
        {!areas.length && <p className="text-sm text-muted-foreground">No service areas yet.</p>}
      </div>
      <div className="flex max-w-xl gap-2">
        <input
          autoFocus
          value={add}
          disabled={full}
          onChange={(e) => setAdd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              push();
            }
          }}
          placeholder="City, ZIP code or region, e.g. Henderson, NV, USA"
          className={cn(inputClass, "h-9 py-1.5")}
        />
        <button type="button" className={buttonClass("outline", "sm", "h-9")} disabled={full || !add.trim()} onClick={push}>
          <Plus /> Add
        </button>
      </div>
      <EditActions onCancel={onDone} busy={busy} note={`${areas.length} of ${MAX_SERVICE_AREAS} areas`} onSave={() => commit({ serviceArea: areas }, "Service area saved")} />
    </div>
  );
}

// ---------------------------------------------------------------- Hours
/** Weekly editor like Google's: per day a Closed box and one or more open/close ranges. */
function WeekEditor({ value, onChange }: { value: HoursPeriod[]; onChange: (v: HoursPeriod[]) => void }) {
  const forDay = (d: Day) => value.map((p, i) => ({ p, i })).filter(({ p }) => p.day === d);
  const setAt = (i: number, patch: Partial<HoursPeriod>) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const ordered = (ps: HoursPeriod[]) => DAYS.flatMap((d) => ps.filter((p) => p.day === d));
  const copyMonday = () => {
    const mon = value.filter((p) => p.day === "MONDAY");
    onChange(
      ordered([
        ...value.filter((p) => !["TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].includes(p.day)),
        ...["TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].flatMap((day) => mon.map((p) => ({ ...p, day }))),
      ]),
    );
  };
  return (
    <div>
      <div className="divide-y rounded-xl border bg-card">
        {DAYS.map((d) => {
          const rows = forDay(d);
          const closed = !rows.length;
          return (
            <div key={d} className="grid min-h-14 items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:grid-cols-[6.5rem_6.5rem_minmax(0,1fr)]">
              <div className="flex items-center justify-between gap-3 sm:contents">
                <p className="text-sm font-medium">{DAY_NAME[d]}</p>
                <span className="flex items-center gap-2">
                  <Switch
                    checked={!closed}
                    onChange={(open) => onChange(open ? ordered([...value, { day: d, open: "09:00", close: "17:00" }]) : value.filter((p) => p.day !== d))}
                    label={`Open on ${DAY_NAME[d]}`}
                  />
                  <span className={cn("text-xs", closed ? "text-muted-foreground" : "font-medium")}>{closed ? "Closed" : "Open"}</span>
                </span>
              </div>
              {!closed && (
                <div className="space-y-2">
                  {rows.map(({ p, i }, k) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                        <TimeField value={p.open} onChange={(v) => setAt(i, { open: v })} invalid={p.close <= p.open} />
                        <span className="text-xs text-muted-foreground">to</span>
                        <TimeField value={p.close} onChange={(v) => setAt(i, { close: v })} invalid={p.close <= p.open} />
                      </div>
                      {k === 0 ? (
                        <button
                          type="button"
                          className={buttonClass("ghost", "icon", "h-9 w-9 text-muted-foreground")}
                          aria-label={`Add hours on ${DAY_NAME[d]}`}
                          title="Add another opening period"
                          onClick={() => {
                            const last = rows.at(-1)!.p;
                            onChange(ordered([...value, { day: d, open: last.close, close: last.close < "20:00" ? "20:00" : "23:00" }]));
                          }}
                        >
                          <Plus />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={buttonClass("ghost", "icon", "h-9 w-9 text-muted-foreground")}
                          aria-label="Remove period"
                          onClick={() => onChange(value.filter((_, j) => j !== i))}
                        >
                          <X />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {value.some((p) => p.day === "MONDAY") && (
        <button type="button" className={buttonClass("ghost", "sm", "mt-2 h-8 px-2")} onClick={copyMonday}>
          Copy Monday to Tue–Fri
        </button>
      )}
    </div>
  );
}

export function HoursFields({ section, ctx }: { section: AuditSection; ctx: Ctx }) {
  const { location: l, checks, total, onDraft } = ctx;
  const e = useEditing(ctx.onFocusField);
  const status = l.openStatus ?? "open";
  const statusLabel = status === "always_open" ? "Open 24 hours, 7 days a week" : openStatusLabel(status);
  const special = [...(l.specialHours ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set((l.moreHours ?? []).map((m) => m.type));
  return (
    <SectionCard section={section} total={total}>
      <Field
        label="Hours"
        value={
          <>
            <span className={cn("block", status !== "open" && status !== "always_open" && "font-medium text-warning")}>{statusLabel}</span>
            {status === "open" &&
              (l.regularHours?.length ? (
                weekSummary(l.regularHours).map((t) => (
                  <span key={t} className="block">
                    {t}
                  </span>
                ))
              ) : (
                <span className="block font-medium text-primary">Add hours</span>
              ))}
          </>
        }
        checks={pick(checks, "hours-status", "hours-set", "hours-weekend")}
        total={total}
        editing={e.is("hours")}
        onEdit={e.open("hours")}
      >
        <RegularHoursEditor location={l} onDraft={onDraft} onDone={e.close} />
      </Field>
      <Field
        label="Special hours"
        value={
          special.length > 0 &&
          special.map((h) => (
            <span key={h.date} className="block">
              {new Date(`${h.date}T00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}:{" "}
              {h.closed ? "Closed" : `${fmtTime(h.open!)}–${fmtTime(h.close!)}`}
            </span>
          ))
        }
        checks={pick(checks, "special-hours")}
        total={total}
        editing={e.is("special")}
        onEdit={e.open("special")}
      >
        <SpecialHoursEditor location={l} onDraft={onDraft} onDone={e.close} />
      </Field>
      {(l.moreHours ?? []).map((m) => (
        <Field
          key={m.type}
          label={`${m.type} hours`}
          value={weekSummary(m.periods).map((t) => (
            <span key={t} className="block">
              {t}
            </span>
          ))}
          checks={[]}
          total={total}
          editing={e.is(`more:${m.type}`)}
          onEdit={e.open(`more:${m.type}`)}
        >
          <MoreHoursEditor location={l} type={m.type} onDraft={onDraft} onDone={e.close} />
        </Field>
      ))}
      {MORE_HOURS_TYPES.some((t) => !used.has(t)) && (
        <div className="px-5 py-4 lg:px-6">
          <p className="text-sm font-medium">Add more hours</p>
          <p className="mb-3 text-xs text-muted-foreground">Hours for specific services, like delivery or online operating hours.</p>
          <div className="flex flex-wrap gap-2">
            {MORE_HOURS_TYPES.filter((t) => !used.has(t)).map((t) => (
              <MoreHoursChip key={t} type={t} onPick={() => e.open(`more:${t}:new`)()} />
            ))}
          </div>
        </div>
      )}
      {MORE_HOURS_TYPES.filter((t) => e.is(`more:${t}:new`)).map((t) => (
        <div key={t} className="bg-muted/20 px-5 py-4 lg:px-6">
          <p className="mb-3 text-sm font-semibold">{t} hours</p>
          <MoreHoursEditor location={l} type={t} onDraft={onDraft} onDone={e.close} />
        </div>
      ))}
    </SectionCard>
  );
}

function MoreHoursChip({ type, onPick }: { type: string; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors hover:border-primary hover:bg-accent hover:text-accent-foreground"
    >
      <Plus className="h-3.5 w-3.5 text-primary" />
      {type}
    </button>
  );
}

const STATUS_ICON: Record<string, React.ElementType> = { open: Clock, always_open: InfinityIcon, temporarily_closed: CirclePause };

function RegularHoursEditor({ location, onDraft, onDone }: { location: Location; onDraft: OnDraft; onDone: () => void }) {
  const initial = location.openStatus ?? "open";
  // Statuses we don't offer (open with no main hours, permanently closed) start on "Open with main hours".
  const [status, setStatus] = useState<OpenStatus>(OPEN_STATUS.some((s) => s.value === initial) ? initial : "open");
  const [hours, setHours] = useState<HoursPeriod[]>(location.regularHours ?? []);
  const bad = status === "open" && (periodsInvalid(hours) || !hours.length);
  useDraft(onDraft, bad ? { openStatus: status } : { openStatus: status, regularHours: hours });
  const { busy, commit } = useFieldSave(location, onDone);
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Opening status">
        {OPEN_STATUS.map((s) => {
          const Icon = STATUS_ICON[s.value];
          const on = status === s.value;
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setStatus(s.value)}
              className={cn(
                "flex items-start gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-accent text-accent-foreground" : "hover:border-primary/40 hover:bg-muted/40",
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{s.label}</span>
                <span className={cn("block text-xs", on ? "text-accent-foreground/80" : "text-muted-foreground")}>{s.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      {status === "open" && <WeekEditor value={hours} onChange={setHours} />}
      {status === "always_open" && (
        <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">Customers will see &quot;Open 24 hours&quot; every day. Your weekly hours are kept in case you switch back.</p>
      )}
      {status === "temporarily_closed" && (
        <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">Your profile will show &quot;Temporarily closed&quot; on Search and Maps. Your hours are kept for when you reopen.</p>
      )}
      <EditActions
        onCancel={onDone}
        busy={busy}
        error={bad ? (hours.length ? "Check the times: closing must be after opening and periods can't overlap." : "Open at least one day, or choose Always open.") : null}
        onSave={() => commit(status === "open" ? { openStatus: status, regularHours: hours } : { openStatus: status }, "Hours saved")}
      />
    </div>
  );
}

function SpecialHoursEditor({ location, onDraft, onDone }: { location: Location; onDraft: OnDraft; onDone: () => void }) {
  const [rows, setRows] = useState<SpecialHours[]>(location.specialHours ?? []);
  const clean = rows.map((h) => (h.closed ? { date: h.date, closed: true } : h));
  const bad = rows.some((h) => !h.date || (!h.closed && (!h.open || !h.close || h.close <= h.open))) || new Set(rows.map((h) => h.date)).size !== rows.length;
  useDraft(onDraft, bad ? {} : { specialHours: clean });
  const { busy, commit } = useFieldSave(location, onDone);
  const set = (i: number, patch: Partial<SpecialHours>) => setRows(rows.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="divide-y rounded-xl border bg-card">
          {rows.map((h, i) => (
            <div key={i} className="grid items-center gap-3 px-4 py-2.5 sm:grid-cols-[13rem_6.5rem_minmax(0,1fr)_auto]">
              <DateField value={h.date} onChange={(v) => set(i, { date: v })} min={today} placeholder="Pick a date" clearable={false} invalid={!h.date} />
              <span className="flex items-center gap-2">
                <Switch checked={!h.closed} onChange={(open) => set(i, { closed: !open, open: h.open ?? "09:00", close: h.close ?? "13:00" })} label="Open on this date" />
                <span className={cn("text-xs", h.closed ? "text-muted-foreground" : "font-medium")}>{h.closed ? "Closed" : "Open"}</span>
              </span>
              {h.closed ? (
                <span />
              ) : (
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                  <TimeField value={h.open ?? "09:00"} onChange={(v) => set(i, { open: v })} />
                  <span className="text-xs text-muted-foreground">to</span>
                  <TimeField value={h.close ?? "13:00"} onChange={(v) => set(i, { close: v })} />
                </div>
              )}
              <button type="button" className={buttonClass("ghost", "icon", "h-8 w-8 text-muted-foreground")} aria-label="Remove date" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <X />
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className={buttonClass("outline", "sm")} onClick={() => setRows([...rows, { date: "", closed: true }])}>
        <Plus /> Add a date
      </button>
      <EditActions onCancel={onDone} busy={busy} error={bad ? "Pick a date for each row (once each) and valid times." : null} onSave={() => commit({ specialHours: clean }, "Special hours saved")} />
    </div>
  );
}

function MoreHoursEditor({ location, type, onDraft, onDone }: { location: Location; type: string; onDraft: OnDraft; onDone: () => void }) {
  const all = location.moreHours ?? [];
  const existing = all.find((m) => m.type === type);
  const [hours, setHours] = useState<HoursPeriod[]>(existing?.periods ?? (location.regularHours ?? []).map((p) => ({ ...p })));
  const bad = periodsInvalid(hours) || !hours.length;
  const next = (periods: HoursPeriod[] | null) => {
    const rest = all.filter((m) => m.type !== type);
    return periods ? [...rest, { type, periods }] : rest;
  };
  useDraft(onDraft, bad ? {} : { moreHours: next(hours) as Location["moreHours"] });
  const { busy, commit } = useFieldSave(location, onDone);
  return (
    <div className="space-y-3">
      <WeekEditor value={hours} onChange={setHours} />
      <div className="flex flex-wrap items-center gap-2">
        {existing && (
          <button
            type="button"
            className={buttonClass("ghost", "sm", "text-destructive hover:bg-destructive/10 hover:text-destructive")}
            disabled={busy}
            onClick={() => commit({ moreHours: next(null) }, `${type} hours removed`)}
          >
            Remove {type.toLowerCase()} hours
          </button>
        )}
      </div>
      <EditActions onCancel={onDone} busy={busy} error={bad ? "Add at least one valid opening period." : null} onSave={() => commit({ moreHours: next(hours) }, `${type} hours saved`)} />
    </div>
  );
}

// ---------------------------------------------------------------- More (attributes)
export function MoreFields({ section, ctx }: { section: AuditSection; ctx: Ctx }) {
  const { location: l, total, suggestions } = ctx;
  const e = useEditing(ctx.onFocusField);
  // Live: Google's own attribute list for this profile and its real values — nothing from our catalogue or guessed.
  if (l.notInApi) return <GoogleAttributeFields section={section} ctx={ctx} />;
  const suggested = new Set(suggestions.attributes.map((s) => s.name));
  return (
    <SectionCard section={section} total={total}>
      <p className="px-5 py-3 text-xs text-muted-foreground lg:px-6">
        Only add what&apos;s true. Google shows these under About and uses them to match searches like &quot;wheelchair accessible {l.primaryCategory.toLowerCase()}&quot;.
      </p>
      {ATTRIBUTE_GROUPS.map((g) => {
        const on = g.items.filter(([id]) => l.attributes.includes(id));
        const ideas = g.items.filter(([id]) => suggested.has(id) && !l.attributes.includes(id)).length;
        return (
          <Field
            key={g.group}
            label={g.group}
            value={
              on.length > 0
                ? on.map(([id, label]) => (
                    <span key={id} className="block">
                      {label}
                    </span>
                  ))
                : ideas > 0 && <span className="font-medium text-primary">Add · {ideas} suggested for you</span>
            }
            checks={[]}
            total={total}
            editing={e.is(g.group)}
            onEdit={e.open(g.group)}
          >
            <AttributeGroupEditor location={l} items={g.items} suggested={suggested} onDone={e.close} />
          </Field>
        );
      })}
    </SectionCard>
  );
}

function AttributeGroupEditor({ location, items, suggested, onDone }: { location: Location; items: [string, string][]; suggested: Set<string>; onDone: () => void }) {
  const ids = items.map(([id]) => id);
  const [on, setOn] = useState(location.attributes.filter((a) => ids.includes(a)));
  const { busy, commit } = useFieldSave(location, onDone);
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(([id, label]) => (
          <div key={id} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn("text-sm", !on.includes(id) && "text-muted-foreground")}>{label}</span>
              {suggested.has(id) && !on.includes(id) && <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">Suggested</span>}
            </span>
            <Switch checked={on.includes(id)} onChange={(v) => setOn(v ? [...on, id] : on.filter((x) => x !== id))} label={label} />
          </div>
        ))}
      </div>
      <EditActions onCancel={onDone} busy={busy} onSave={() => commit({ attributes: [...location.attributes.filter((a) => !ids.includes(a)), ...on] }, "Attributes saved")} />
    </div>
  );
}

// ---------------------------------------------------------------- More (live: Google's attributes)
const answerText = (d: AttributeDef, v: AttributeValue | undefined) => {
  if (v === undefined) return null;
  if (d.type === "bool") return v ? d.label : `${d.label}: No`;
  if (d.type === "enum") return `${d.label}: ${d.options?.find((o) => o.value === v)?.label ?? String(v)}`;
  if (d.type === "repeated_enum") return `${d.label}: ${(v as string[]).map((x) => d.options?.find((o) => o.value === x)?.label ?? x).join(", ")}`;
  return `${d.label}: ${String(v)}`;
};

function GoogleAttributeFields({ section, ctx }: { section: AuditSection; ctx: Ctx }) {
  const { location: l, total } = ctx;
  const e = useEditing(ctx.onFocusField);
  const defs = l.attributeCatalog ?? [];
  const values = l.attributeValues ?? {};
  const groups = [...new Set(defs.map((d) => d.group))].map((group) => ({ group, items: defs.filter((d) => d.group === group) }));
  return (
    <SectionCard section={section} total={total}>
      <p className="px-5 py-3 text-xs text-muted-foreground lg:px-6">
        The attributes Google offers for a {l.primaryCategory || "business"} like yours, with your answers on Google. Only add what&apos;s true.
      </p>
      {!groups.length && <p className="px-5 pb-4 text-sm text-muted-foreground lg:px-6">Attributes couldn&apos;t be loaded from Google yet. Reload the page to try again.</p>}
      {groups.map((g) => {
        const answered = g.items.filter((d) => values[d.id] !== undefined && !(Array.isArray(values[d.id]) && !(values[d.id] as string[]).length));
        return (
          <Field
            key={g.group}
            label={g.group}
            value={answered.length > 0 && answered.map((d) => <span key={d.id} className="block">{answerText(d, values[d.id])}</span>)}
            checks={[]}
            total={total}
            editing={e.is(g.group)}
            onEdit={e.open(g.group)}
          >
            <GoogleAttributeEditor location={l} items={g.items} onDone={e.close} />
          </Field>
        );
      })}
    </SectionCard>
  );
}

function GoogleAttributeEditor({ location, items, onDone }: { location: Location; items: AttributeDef[]; onDone: () => void }) {
  const [draft, setDraft] = useState<Record<string, AttributeValue | undefined>>(() => Object.fromEntries(items.map((d) => [d.id, location.attributeValues?.[d.id]])));
  const { busy, commit } = useFieldSave(location, onDone);
  const set = (id: string, v: AttributeValue | undefined) => setDraft((x) => ({ ...x, [id]: v }));
  const save = () => {
    const next: Record<string, AttributeValue> = { ...(location.attributeValues ?? {}) };
    for (const d of items) {
      const v = draft[d.id];
      if (v === undefined || (Array.isArray(v) && !v.length) || v === "") delete next[d.id];
      else next[d.id] = v;
    }
    commit({ attributeValues: next }, "Saved on Google");
  };
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((d) => (
          <div key={d.id} className={cn("flex min-h-11 flex-col justify-center gap-2 rounded-lg border bg-card px-3 py-2", (d.type === "repeated_enum" || d.type === "url") && "sm:col-span-2")}>
            <div className="flex items-center justify-between gap-3">
              <span className={cn("min-w-0 text-sm", draft[d.id] === undefined && "text-muted-foreground")}>{d.label}</span>
              {d.type === "bool" && (
                <Segmented
                  size="sm"
                  label={d.label}
                  value={draft[d.id] === true ? "yes" : draft[d.id] === false ? "no" : "unset"}
                  onChange={(v) => set(d.id, v === "yes" ? true : v === "no" ? false : undefined)}
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                    { value: "unset", label: "—" },
                  ]}
                />
              )}
              {d.type === "enum" && (
                <SelectBox
                  label={d.label}
                  value={typeof draft[d.id] === "string" ? (draft[d.id] as string) : ""}
                  onChange={(v) => set(d.id, v || undefined)}
                  options={[{ value: "", label: "Not set" }, ...(d.options ?? [])]}
                  className="w-44 shrink-0"
                />
              )}
            </div>
            {d.type === "repeated_enum" && (
              <div className="flex flex-wrap gap-1.5">
                {(d.options ?? []).map((o) => {
                  const cur = (draft[d.id] as string[] | undefined) ?? [];
                  const on = cur.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set(d.id, on ? cur.filter((x) => x !== o.value) : [...cur, o.value])}
                      className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", on ? "border-primary/40 bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted")}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            )}
            {d.type === "url" && (
              <input type="url" value={typeof draft[d.id] === "string" ? (draft[d.id] as string) : ""} onChange={(ev) => set(d.id, ev.target.value.trim() || undefined)} placeholder="https://" aria-label={d.label} className={inputClass} />
            )}
          </div>
        ))}
      </div>
      <EditActions onCancel={onDone} busy={busy} onSave={save} />
    </div>
  );
}
