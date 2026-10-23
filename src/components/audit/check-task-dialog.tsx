"use client";

// "Add as task" for an optimization checklist item: assign it to someone with a due date. The task finishes itself once the check passes.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { ListTodo, Loader2 } from "lucide-react";
import { DateField } from "@/components/date-time-field";
import { buttonClass, inputClass } from "@/components/ui";
import { Modal, SelectBox } from "@/components/ui-client";
import { MemberAvatar, type TaskMember } from "@/components/tasks/task-bits";
import { createTask } from "@/app/(app)/actions";
import type { AuditCheck } from "@/lib/audit";
import type { TaskPriority, TaskStage } from "@/lib/gbp/types";
import { TASK_PRIORITIES, stageInfo } from "@/lib/tasks";
import { cn, withLocation } from "@/lib/utils";

/** Open task for a checklist item (shown instead of the "Add as task" button). */
export interface CheckTask {
  id: string;
  stage: TaskStage;
  assigneeId: string | null;
  dueDate: string | null;
}

const PRIORITY_FOR: Record<AuditCheck["severity"], TaskPriority> = { high: "high", medium: "medium", low: "low" };

export function CheckTaskChip({ task, locationId, member }: { task: CheckTask; locationId: string; member: TaskMember | null }) {
  return (
    <Link
      href={withLocation("/tasks", locationId, { task: task.id })}
      className="inline-flex h-8 max-w-[11rem] items-center gap-1.5 rounded-lg border bg-card pl-1.5 pr-2.5 text-xs font-medium hover:bg-muted"
      title={`Task: ${stageInfo(task.stage).label}${member ? ` · ${member.name}` : " · unassigned"}`}
    >
      <MemberAvatar member={member} className="h-5 w-5 text-[9px]" />
      <span className="truncate">{member ? member.name.split(" ")[0] : "Unassigned"}</span>
      <span className="text-muted-foreground">·</span>
      <span className="truncate text-muted-foreground">{stageInfo(task.stage).label}</span>
    </Link>
  );
}

export function CheckTaskDialog({ check, locationId, members, onClose }: { check: AuditCheck | null; locationId: string; members: TaskMember[]; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!check) return;
    setTitle(`Fix: ${check.title}`);
    setNote(check.detail);
    setAssigneeId("");
    setDueDate(format(addDays(new Date(), check.severity === "high" ? 3 : 7), "yyyy-MM-dd"));
    setPriority(PRIORITY_FOR[check.severity]);
  }, [check]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!check) return;
    setSaving(true);
    const res = await createTask({ title, description: note.trim() || null, stage: "todo", priority, assigneeId: assigneeId || null, dueDate: dueDate || null, locationId, auditCheckId: check.id });
    setSaving(false);
    if (!res.ok) return void toast.error(res.error);
    const who = members.find((m) => m.id === assigneeId)?.name;
    toast.success(who ? `Task assigned to ${who}` : "Task added", {
      description: "It's marked done automatically once this item passes.",
      action: { label: "View", onClick: () => router.push(withLocation("/tasks", locationId, { task: res.id })) },
    });
    onClose();
    router.refresh();
  };

  return (
    <Modal open={!!check} onClose={() => !saving && onClose()} title="Add as task" className="h-auto max-h-[92dvh] sm:max-w-lg">
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block space-y-1.5">
            <span className="label-caps block">Task</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} autoFocus />
          </label>
          <label className="block space-y-1.5">
            <span className="label-caps block">Note</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={5000} className={cn(inputClass, "resize-y")} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <span className="label-caps block">Assign to</span>
              <div className="flex items-center gap-2">
                <MemberAvatar member={members.find((m) => m.id === assigneeId) ?? null} className="h-8 w-8 text-xs" />
                <SelectBox label="Assign to" value={assigneeId} onChange={setAssigneeId} options={[{ value: "", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))]} className="flex-1 [&_select]:h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="label-caps block">Due date</span>
              <DateField value={dueDate} onChange={setDueDate} placeholder="No due date" />
            </div>
            <div className="space-y-1.5">
              <span className="label-caps block">Priority</span>
              <SelectBox label="Priority" value={priority} onChange={(v) => setPriority(v as TaskPriority)} options={TASK_PRIORITIES.map((p) => ({ value: p.key, label: p.label }))} className="[&_select]:h-10" />
            </div>
          </div>
          <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <ListTodo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Shows up in Tasks for this location. When the profile passes this check, the task is marked done.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={buttonClass()} disabled={saving || !title.trim()}>
            {saving && <Loader2 className="animate-spin" />} Add task
          </button>
        </div>
      </form>
    </Modal>
  );
}
