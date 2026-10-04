declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
      };
      membership?: {
        workspaceId: string;
        userId: string;
        role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
      };
    }
  }
}

export {};
