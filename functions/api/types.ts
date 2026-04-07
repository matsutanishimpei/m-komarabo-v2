export type Env = {
  Bindings: {
    DB: D1Database
  }
  Variables: {
    user: {
      id: number
      user_hash: string
      is_admin: number
    }
  }
}
