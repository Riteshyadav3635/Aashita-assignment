'use client';

import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { horizontalListSortingStrategy, sortableKeyboardCoordinates, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth, useRole } from '@/lib/auth-context';
import { createSocketConnection } from '@/lib/socket';
import type { Board, List, Member, Task } from '@/lib/types';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';

type BoardViewProps = {
  workspaceId: string;
  board: Board;
  initialLists: List[];
};

type BoardState = {
  lists: List[];
};

function flattenTasks(lists: List[]) {
  return lists.flatMap((list) => list.tasks ?? []);
}

function findTaskById(tasks: Task[], taskId: string) {
  return tasks.find((task) => task.id === taskId) ?? null;
}

function applyOptimisticTaskMove(lists: List[], taskId: string, destinationListId: string, afterTaskId: string | null): List[] {
  const nextLists = lists.map((list) => ({
    ...list,
    tasks: (list.tasks ?? []).filter((task) => task.id !== taskId),
  }));

  const targetList = nextLists.find((list) => list.id === destinationListId);
  if (!targetList) {
    return lists;
  }

  const taskToMove = lists.flatMap((list) => list.tasks ?? []).find((task) => task.id === taskId);
  if (!taskToMove) {
    return lists;
  }

  const nextTasks = [...(targetList.tasks ?? [])];
  const anchorIndex = afterTaskId === null ? -1 : nextTasks.findIndex((task) => task.id === afterTaskId);
  nextTasks.splice(afterTaskId === null ? 0 : anchorIndex + 1, 0, { ...taskToMove, listId: destinationListId });

  return nextLists.map((list) => {
    if (list.id !== destinationListId) {
      return list;
    }

    return {
      ...list,
      tasks: nextTasks,
    };
  });
}

function TaskCard({ task, canEdit, onOpen }: { task: Task; canEdit: boolean; onOpen: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `task-${task.id}`,
    disabled: !canEdit,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transition,
        transform: CSS.Transform.toString(transform),
      }}
      className={`rounded-xl border border-slate-700 bg-slate-950/80 p-3 shadow-sm transition ${
        isDragging ? 'opacity-60 ring-2 ring-sky-500/60' : 'hover:border-slate-500'
      }`}
      {...(canEdit ? attributes : {})}
      {...(canEdit ? listeners : {})}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(task);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open task ${task.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-white">{task.title}</p>
          {task.description ? <p className="mt-1 text-xs text-slate-400">{task.description}</p> : null}
        </div>
        <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
          {task.status}
        </span>
      </div>
    </div>
  );
}

function ListColumn({ list, tasks, onCreateTask, onRename, onDelete, canEdit, onOpenTask }: { list: List; tasks: Task[]; onCreateTask: (listId: string, title: string) => Promise<void>; onRename: (listId: string, name: string) => Promise<void>; onDelete: (list: List) => Promise<void>; canEdit: boolean; onOpenTask: (task: Task) => void }) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `list-${list.id}` });
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: `column-${list.id}`, disabled: !canEdit });
  const [title, setTitle] = useState('');
  const [name, setName] = useState(list.name);
  const [editingName, setEditingName] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`w-80 shrink-0 rounded-2xl border bg-slate-900/80 p-3 ${
        isOver ? 'border-sky-500/50' : 'border-slate-800'
      } ${isDragging ? 'opacity-60' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div ref={setDropRef} className="flex min-w-0 flex-1 items-center gap-2">
          {canEdit ? <button type="button" {...attributes} {...listeners} aria-label={`Move ${list.name} list`} className="cursor-grab touch-none text-slate-400 active:cursor-grabbing">⠿</button> : null}
          {editingName ? <form className="flex min-w-0 gap-1" onSubmit={(event) => { event.preventDefault(); void onRename(list.id, name).then(() => setEditingName(false)).catch(() => undefined); }}><input aria-label="List name" value={name} onChange={(event) => setName(event.target.value)} className="w-36 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white" /><button type="submit" className="text-xs text-sky-300">Save</button></form> : <h3 className="truncate font-semibold text-white">{list.name}</h3>}
        </div>
        <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">{tasks.length}</span>
      </div>

      {canEdit && !editingName ? <div className="-mt-1 mb-3 flex gap-3 text-xs text-slate-400"><button type="button" onClick={() => { setName(list.name); setEditingName(true); }} className="hover:text-white">Rename</button><button type="button" onClick={() => { void onDelete(list); }} className="hover:text-rose-300">Delete list</button></div> : null}

      <SortableContext items={tasks.map((task) => `task-${task.id}`)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-3 text-sm text-slate-400">No tasks yet</div>
          ) : (
            tasks.map((task) => <TaskCard key={task.id} task={task} canEdit={canEdit} onOpen={onOpenTask} />)
          )}
        </div>
      </SortableContext>

      {canEdit ? <div className="mt-4 flex gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="New task"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500"
        />
        <button
          type="button"
          onClick={async () => {
            const value = title.trim();
            if (!value) return;
            await onCreateTask(list.id, value).then(() => setTitle('')).catch(() => undefined);
          }}
          className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-400"
        >
          Add
        </button>
      </div> : null}
    </div>
  );
}

export function BoardView({ workspaceId, board, initialLists }: BoardViewProps) {
  const { getAccessToken, user, refreshSession } = useAuth();
  const role = useRole(workspaceId);
  // UI gating mirrors the API role policy; the API remains the security authority.
  const canEdit = role !== null && role !== 'VIEWER';
  const queryClient = useQueryClient();
  const [boardState, setBoardState] = useState<BoardState>({
    lists: initialLists,
  });
  const [listTitle, setListTitle] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [savingTask, setSavingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [conflictTask, setConflictTask] = useState<Task | null>(null);
  const [taskFormVersion, setTaskFormVersion] = useState(0);
  const [newLabelName, setNewLabelName] = useState('');
  const openedTaskFromUrl = useRef(false);

  const allTasks = useMemo(() => flattenTasks(boardState.lists), [boardState.lists]);
  const { data: labelsData, refetch: refetchLabels } = useQuery({
    queryKey: ['workspace-labels', workspaceId],
    queryFn: () => apiFetch<{ labels: Array<{ id: string; name: string; color: string }> }>(`/api/workspaces/${workspaceId}/labels`),
  });
  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => apiFetch<{ members: Member[] }>(`/api/workspaces/${workspaceId}/members`),
  });

  useEffect(() => {
    if (openedTaskFromUrl.current || typeof window === 'undefined') return;
    const taskId = new URLSearchParams(window.location.search).get('task');
    if (!taskId) { openedTaskFromUrl.current = true; return; }
    const task = allTasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    openedTaskFromUrl.current = true;
    setSelectedTask(task);
  }, [allTasks]);

  const listTasks = useMemo(() => {
    const byList = new Map<string, Task[]>();
    for (const list of boardState.lists) {
      byList.set(list.id, list.tasks ?? []);
    }
    return byList;
  }, [boardState.lists]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refreshBoard = useCallback(async () => {
    const listResponse = await apiFetch<{ lists: List[] }>(`/api/workspaces/${workspaceId}/boards/${board.id}/lists`);
    setBoardState({ lists: listResponse.lists });
    return listResponse.lists;
  }, [board.id, workspaceId]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !user) return;

    const socket = createSocketConnection();
    const events = [
      'board:updated',
      'list:created',
      'list:updated',
      'list:moved',
      'list:deleted',
      'task:created',
      'task:updated',
      'task:moved',
      'task:deleted',
    ] as const;

    const refreshFromSocket = () => {
      void refreshBoard();
    };
    const reconnectWithFreshToken = (error: Error) => {
      setConnection('reconnecting');
      if (error.message.includes('UNAUTHENTICATED')) {
        void refreshSession().then(() => {
          const nextToken = getAccessToken();
          if (nextToken) {
            socket.disconnect();
            socket.auth = (callback) => callback({ token: nextToken });
            socket.connect();
          }
        });
      }
    };

    socket.on('connect', () => {
      setConnection('live');
      socket.emit('board:join', { workspaceId, boardId: board.id }, (response: { ok?: boolean; code?: string }) => {
        if (!response.ok) {
          console.warn('Board socket join failed:', response.code ?? 'unknown');
        }
      });
      // Re-sync after initial connection and every reconnect to recover missed events.
      void refreshBoard();
    });
    socket.on('disconnect', () => setConnection('reconnecting'));
    socket.on('connect_error', reconnectWithFreshToken);

    for (const eventName of events) {
      socket.on(eventName, refreshFromSocket);
    }

    socket.connect();

    return () => {
      for (const eventName of events) {
        socket.off(eventName, refreshFromSocket);
      }
      socket.off('disconnect');
      socket.off('connect_error', reconnectWithFreshToken);
      socket.disconnect();
    };
  }, [board.id, getAccessToken, refreshBoard, refreshSession, user, workspaceId]);

  const createList = async () => {
    if (!canEdit) return;
    const value = listTitle.trim();
    if (!value) return;
    try {
      await apiFetch<{ list: List }>(`/api/workspaces/${workspaceId}/boards/${board.id}/lists`, {
        method: 'POST',
        body: JSON.stringify({ name: value }),
      });
      setListTitle('');
      await refreshBoard();
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'The list could not be created.');
    }
  };

  const createTask = async (listId: string, title: string) => {
    if (!canEdit) return;
    try {
      await apiFetch<{ task: Task }>(`/api/workspaces/${workspaceId}/boards/${board.id}/lists/${listId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      await refreshBoard();
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'The task could not be created.');
      throw error;
    }
  };

  const renameList = async (listId: string, name: string) => {
    if (!name.trim()) return;
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/boards/${board.id}/lists/${listId}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
      await refreshBoard();
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'The list name could not be saved.');
      throw error;
    }
  };

  const deleteList = async (list: List) => {
    if (!window.confirm(`Delete “${list.name}” and all its tasks?`)) return;
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/boards/${board.id}/lists/${list.id}`, { method: 'DELETE' });
      await refreshBoard();
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'The list could not be deleted.');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canEdit) return;
    const { active, over } = event;
    if (!over) return;

    const activeRawId = String(active.id);
    if (activeRawId.startsWith('column-')) {
      const activeListId = activeRawId.replace(/^column-/, '');
      const overRawId = String(over.id);
      const overTask = overRawId.startsWith('task-') ? findTaskById(allTasks, overRawId.replace(/^task-/, '')) : null;
      const overListId = overRawId.startsWith('column-') ? overRawId.replace(/^column-/, '') : overRawId.startsWith('list-') ? overRawId.replace(/^list-/, '') : overTask?.listId;
      if (!overListId || overListId === activeListId) return;
      const previousState = boardState;
      const nextLists = [...boardState.lists];
      const oldIndex = nextLists.findIndex((list) => list.id === activeListId);
      const newIndex = nextLists.findIndex((list) => list.id === overListId);
      if (oldIndex < 0 || newIndex < 0) return;
      const [movingList] = nextLists.splice(oldIndex, 1);
      nextLists.splice(newIndex, 0, movingList);
      setBoardState({ lists: nextLists });
      const movedIndex = nextLists.findIndex((list) => list.id === activeListId);
      const afterListId = movedIndex > 0 ? nextLists[movedIndex - 1].id : null;
      try {
        await apiFetch(`/api/workspaces/${workspaceId}/boards/${board.id}/lists/${activeListId}/move`, {
          method: 'PATCH',
          body: JSON.stringify({ afterListId }),
        });
      } catch (error) {
        setBoardState(previousState);
        setMoveError(error instanceof Error ? error.message : 'The list could not be moved.');
        await refreshBoard();
      }
      return;
    }

    const activeId = activeRawId.replace(/^task-/, '');
    const activeTask = findTaskById(allTasks, activeId);
    if (!activeTask) return;

    const overId = String(over.id);
    const targetTask = overId.startsWith('task-') ? findTaskById(allTasks, overId.replace(/^task-/, '')) : null;
    const destinationListId = overId.startsWith('list-')
      ? overId.replace(/^list-/, '')
      : targetTask?.listId ?? activeTask.listId;

    let afterTaskId: string | null = null;
    if (targetTask && targetTask.listId === destinationListId) {
      const ordered = (listTasks.get(destinationListId) ?? []).filter((task) => task.id !== activeTask.id);
      const targetIndex = ordered.findIndex((task) => task.id === targetTask.id);
      if (targetIndex > 0) afterTaskId = ordered[targetIndex - 1].id;
    }

    if (destinationListId === activeTask.listId && targetTask?.id === activeTask.id) {
      return;
    }

    const previousState = boardState;
    setMoveError(null);
    setBoardState((current) => ({
      lists: applyOptimisticTaskMove(current.lists, activeTask.id, destinationListId, afterTaskId),
    }));

    try {
      await apiFetch(`/api/workspaces/${workspaceId}/boards/${board.id}/tasks/${activeTask.id}/move`, {
        method: 'PATCH',
        body: JSON.stringify({
          listId: destinationListId,
          afterTaskId,
          version: activeTask.version ?? 1,
        }),
      });

      await refreshBoard();
    } catch (error) {
      setBoardState(previousState);

      if (error instanceof ApiError && (error.code === 'VERSION_MISMATCH' || error.code === 'STALE_POSITION')) {
        setMoveError('This task changed while you were moving it. The board has been refreshed.');
        await refreshBoard();
        return;
      }

      setMoveError('The task move could not be saved. Please try again.');
    }
  };

  const saveTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTask) return;
    const form = new FormData(event.currentTarget);
    setSavingTask(true);
    setTaskError(null);
    try {
      const result = await apiFetch<{ task: Task }>(`/api/workspaces/${workspaceId}/boards/${board.id}/tasks/${selectedTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: String(form.get('title') ?? '').trim(),
          description: String(form.get('description') ?? '').trim() || null,
          status: String(form.get('status')),
          dueDate: String(form.get('dueDate') ?? '') || null,
          assigneeId: String(form.get('assigneeId') ?? '') || null,
          labelIds: form.getAll('labelIds').map(String),
          version: selectedTask.version ?? 1,
        }),
      });
      setBoardState((current) => ({ lists: current.lists.map((list) => ({ ...list, tasks: (list.tasks ?? []).map((task) => task.id === result.task.id ? result.task : task) })) }));
      setSelectedTask(null);
      setConflictTask(null);
      void queryClient.invalidateQueries({ queryKey: ['workspace-dashboard', workspaceId] });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_MISMATCH') {
        setTaskError('This task changed in another session. Choose which version to keep.');
        const latestLists = await refreshBoard();
        setConflictTask(latestLists.flatMap((list) => list.tasks ?? []).find((task) => task.id === selectedTask.id) ?? null);
      } else {
        setTaskError(error instanceof Error ? error.message : 'Could not save this task.');
      }
    } finally {
      setSavingTask(false);
    }
  };

  const deleteTask = async () => {
    if (!selectedTask || !canEdit) return;
    setSavingTask(true);
    setTaskError(null);
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/boards/${board.id}/tasks/${selectedTask.id}`, { method: 'DELETE' });
      setBoardState((current) => ({ lists: current.lists.map((list) => ({ ...list, tasks: (list.tasks ?? []).filter((task) => task.id !== selectedTask.id) })) }));
      setSelectedTask(null);
      setConflictTask(null);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : 'Could not delete this task.');
    } finally {
      setSavingTask(false);
    }
  };

  const createLabel = async () => {
    const name = newLabelName.trim();
    if (!name || !canEdit) return;
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/labels`, { method: 'POST', body: JSON.stringify({ name, color: '#38bdf8' }) });
      setNewLabelName('');
      await refetchLabels();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : 'Could not create the label.');
    }
  };

  const deleteLabel = async (labelId: string) => {
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/labels/${labelId}`, { method: 'DELETE' });
      await refetchLabels();
      await refreshBoard();
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : 'Could not delete the label.');
    }
  };

  const openTask = (task: Task) => {
    setTaskFormVersion((version) => version + 1);
    setTaskError(null);
    setConflictTask(null);
    setSelectedTask(task);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-sky-400">Board</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{board.name}</h1>
          {moveError ? <p className="mt-2 text-sm text-amber-300">{moveError}</p> : null}
          <p className="mt-2 text-xs text-slate-400" aria-live="polite">{connection === 'live' ? '● Live updates connected' : connection === 'connecting' ? 'Connecting to live updates…' : 'Reconnecting to live updates…'}</p>
        </div>

        {canEdit ? <div className="flex items-center gap-3">
          <input
            value={listTitle}
            onChange={(event) => setListTitle(event.target.value)}
            placeholder="New list name"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500"
          />
          <button
            type="button"
            onClick={() => {
              void createList();
            }}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400"
          >
            Add list
          </button>
        </div> : <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">Read only · Viewer</span>}
      </header>

      <DndContext sensors={canEdit ? sensors : undefined} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <SortableContext items={boardState.lists.map((list) => `column-${list.id}`)} strategy={horizontalListSortingStrategy}>
        <div className="flex gap-4 overflow-x-auto pb-3">
          {boardState.lists.map((list) => (
            <ListColumn key={list.id} list={list} tasks={listTasks.get(list.id) ?? []} onCreateTask={createTask} onRename={renameList} onDelete={deleteList} canEdit={canEdit} onOpenTask={openTask} />
          ))}
        </div>
        </SortableContext>
      </DndContext>

      <Dialog open={selectedTask !== null} onOpenChange={(open) => { if (!open) { setSelectedTask(null); setTaskError(null); setConflictTask(null); } }} title={selectedTask?.title ?? 'Task details'} description={canEdit ? 'Edit the task details. Changes are saved with a version check.' : 'Task details (read only)'}>
        {selectedTask ? <form key={`${selectedTask.id}:${taskFormVersion}`} className="space-y-3" onSubmit={(event) => { void saveTask(event); }}>
          <label className="block text-xs text-[var(--color-muted)]">Title<input name="title" required maxLength={200} defaultValue={selectedTask.title} readOnly={!canEdit} className="mt-1 w-full rounded-[6px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]" /></label>
          <label className="block text-xs text-[var(--color-muted)]">Description<textarea name="description" maxLength={10000} defaultValue={selectedTask.description ?? ''} readOnly={!canEdit} rows={4} className="mt-1 w-full resize-y rounded-[6px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]" /></label>
          <label className="block text-xs text-[var(--color-muted)]">Status<Select name="status" defaultValue={selectedTask.status} disabled={!canEdit} className="mt-1"><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="DONE">Done</option></Select></label>
          <label className="block text-xs text-[var(--color-muted)]">Assignee<Select name="assigneeId" defaultValue={selectedTask.assigneeId ?? ''} disabled={!canEdit} className="mt-1"><option value="">Unassigned</option>{membersData?.members.map((member) => <option key={member.userId} value={member.userId}>{member.name} · {member.email}</option>)}</Select></label>
          <label className="block text-xs text-[var(--color-muted)]">Due date<input name="dueDate" type="date" defaultValue={selectedTask.dueDate ? new Date(selectedTask.dueDate).toISOString().slice(0, 10) : ''} readOnly={!canEdit} className="mt-1 w-full rounded-[6px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]" /></label>
          <fieldset className="space-y-2"><legend className="text-xs text-[var(--color-muted)]">Labels</legend><div className="flex flex-wrap gap-2">{labelsData?.labels.map((label) => <label key={label.id} className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs" style={{ borderColor: `${label.color}88` }}><input type="checkbox" name="labelIds" value={label.id} defaultChecked={selectedTask.labels?.some((entry) => entry.label.id === label.id)} disabled={!canEdit} />{label.name}{canEdit ? <button type="button" aria-label={`Delete label ${label.name}`} onClick={() => { if (window.confirm(`Delete the label “${label.name}” from all tasks?`)) void deleteLabel(label.id); }} className="ml-1 text-rose-500">×</button> : null}</label>)}</div>{canEdit ? <div className="flex gap-2"><input value={newLabelName} onChange={(event) => setNewLabelName(event.target.value)} aria-label="New label name" placeholder="Create label" className="h-8 flex-1 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs text-[var(--color-text)]" /><button type="button" onClick={() => { void createLabel(); }} disabled={!newLabelName.trim()} className="rounded-[6px] border border-[var(--color-border)] px-2 text-xs disabled:opacity-40">Add label</button></div> : null}</fieldset>
          {taskError ? <div role="alert" className="space-y-2 rounded-[6px] border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700"><p>{taskError}</p>{conflictTask && canEdit ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setTaskFormVersion((version) => version + 1); setSelectedTask(conflictTask); setConflictTask(null); setTaskError(null); }} className="rounded border border-[var(--color-border)] px-2 py-1">Use theirs</button><button type="button" onClick={() => { setSelectedTask({ ...selectedTask, version: conflictTask.version }); setConflictTask(null); setTaskError(null); }} className="rounded bg-[var(--color-accent)] px-2 py-1 text-white">Keep mine</button></div> : null}</div> : null}
          <div className="flex justify-between gap-2 pt-2">
            {canEdit ? <button type="button" disabled={savingTask} onClick={() => { void deleteTask(); }} className="rounded-[6px] border border-rose-300/40 px-3 py-2 text-sm text-rose-600 disabled:opacity-50">Delete</button> : <span />}
            <div className="flex gap-2"><button type="button" onClick={() => setSelectedTask(null)} className="rounded-[6px] border border-[var(--color-border)] px-3 py-2 text-sm">Close</button>{canEdit ? <button type="submit" disabled={savingTask} className="rounded-[6px] bg-[var(--color-accent)] px-3 py-2 text-sm text-white disabled:opacity-50">{savingTask ? 'Saving…' : 'Save changes'}</button> : null}</div>
          </div>
        </form> : null}
      </Dialog>
    </div>
  );
}
