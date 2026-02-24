export type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  ADMIN_EMAILS: string;  // カンマ区切りの管理者メールアドレス一覧
};

// JWTペイロードの型定義
export type JwtPayload = {
  sub: string;          // Google sub (内部のみ)
  id: string;           // 内部UUID
  display_name: string; // 表示名
  role: string;         // admin/student
  iat: number;
  exp: number;
};

// c.get('user') の型定義
export type AuthUser = {
  id: string;
  display_name: string;
  role: string;
  sub: string;
};

// Hono Variables 型
export type Variables = {
  user: AuthUser;
};
