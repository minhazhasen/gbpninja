"use client";

// Admin → Tasks: the platform team's own tasks (bookings, issues, workspace follow-ups…) on the same board as workspace Tasks.
import { TasksBoard, type TaskApi } from "@/components/tasks/tasks-board";
import type { TaskMember } from "@/components/tasks/task-bits";
import { createPlatformTask, deletePlatformTask, updatePlatformTask } from "@/app/admin/actions";
import type { Task } from "@/lib/gbp/types";
import type { TaskView } from "@/lib/tasks";

const API: TaskApi = { create: createPlatformTask, update: updatePlatformTask, remove: deletePlatformTask };

export function PlatformTasks(props: { tasks: Task[]; members: TaskMember[]; workspaces: { id: string; title: string }[]; meId: string; view: TaskView; openTaskId: string | null }) {
  return (
    <TasksBoard
      location={null}
      tasks={props.tasks}
      members={props.members}
      locations={props.workspaces}
      meId={props.meId}
      view={props.view}
      openTaskId={props.openTaskId}
      api={API}
      platform={{ subtitle: "Bookings, issues and other work for the platform team", scope: { label: "Workspace", all: "No workspace" } }}
    />
  );
}
