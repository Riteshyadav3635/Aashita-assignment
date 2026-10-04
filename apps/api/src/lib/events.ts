import { EventEmitter } from 'node:events';

export type DomainEvent =
  | { type: 'workspace.created'; workspaceId: string; actorId: string }
  | { type: 'member.invited'; workspaceId: string; userId: string; actorId: string; targetEmail: string; role: string }
  | { type: 'member.joined'; workspaceId: string; userId: string; actorId: string }
  | { type: 'member.removed'; workspaceId: string; userId: string; actorId: string }
  | { type: 'member.role_changed'; workspaceId: string; userId: string; actorId: string; role: string }
  | { type: 'board.created'; workspaceId: string; boardId: string; actorId: string }
  | { type: 'board.updated'; workspaceId: string; boardId: string; actorId: string }
  | { type: 'board.deleted'; workspaceId: string; boardId: string; actorId: string }
  | { type: 'list.created'; workspaceId: string; boardId: string; listId: string; actorId: string }
  | { type: 'list.updated'; workspaceId: string; boardId: string; listId: string; actorId: string }
  | { type: 'list.moved'; workspaceId: string; boardId: string; listId: string; actorId: string }
  | { type: 'list.deleted'; workspaceId: string; boardId: string; listId: string; actorId: string }
  | { type: 'task.created'; workspaceId: string; boardId: string; listId: string; taskId: string; actorId: string }
  | { type: 'task.updated'; workspaceId: string; boardId: string; listId: string; taskId: string; actorId: string }
  | { type: 'task.moved'; workspaceId: string; boardId: string; listId: string; taskId: string; actorId: string }
  | { type: 'task.deleted'; workspaceId: string; boardId: string; listId: string; taskId: string; actorId: string }
  | { type: 'invitation.revoked'; workspaceId: string; invitationId: string; actorId: string }
  | { type: 'label.created' | 'label.updated' | 'label.deleted'; workspaceId: string; actorId: string };

class EventPublisher {
  private emitter = new EventEmitter();

  publish(event: DomainEvent) {
    this.emitter.emit(event.type, event);
  }

  subscribe<T extends DomainEvent['type']>(eventType: T, listener: (event: Extract<DomainEvent, { type: T }>) => void) {
    this.emitter.on(eventType, listener as (...args: unknown[]) => void);
  }
}

export const eventPublisher = new EventPublisher();
