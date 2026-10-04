'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { BoardView } from '@/components/board-view';
import { apiFetch } from '@/lib/api';
import type { Board, List } from '@/lib/types';

export default function BoardDetailPage() {
  const { workspaceId, boardId } = useParams<{ workspaceId: string; boardId: string }>();

  const { data: boardData } = useQuery({
    queryKey: ['board-page', workspaceId, boardId],
    queryFn: () => apiFetch<{ board: Board }>(`/api/workspaces/${workspaceId}/boards/${boardId}`),
  });

  const { data: listData } = useQuery({
    queryKey: ['board-lists-page', workspaceId, boardId],
    queryFn: () => apiFetch<{ lists: List[] }>(`/api/workspaces/${workspaceId}/boards/${boardId}/lists`),
  });

  if (!boardData?.board || !listData) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/80 text-slate-300">
        Loading board…
      </div>
    );
  }

  return <BoardView workspaceId={workspaceId} board={boardData.board} initialLists={listData.lists} />;
}
