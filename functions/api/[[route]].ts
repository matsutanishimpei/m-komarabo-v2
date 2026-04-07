import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import type { Env } from './types'
import { auth } from './routes/auth'
import { komarabo } from './routes/komarabo'
import { wakuwaku } from './routes/wakuwaku'
import { admin } from './routes/admin'

const app = new Hono<Env>().basePath('/api')

// ルートの組み立て
app.route('/', auth)
app.route('/', komarabo)
app.route('/wakuwaku', wakuwaku)
app.route('/admin', admin)

export const onRequest = handle(app)