export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member' | 'guest';
  createdAt: string;
  updatedAt: string;
}

export type ApiResponse<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
    };
