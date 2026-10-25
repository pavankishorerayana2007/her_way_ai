import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import api from './routes/api.js';
import { requireAuth } from './middleware/auth.js';

const required = ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) console.error(`Missing required environment variables: ${missing.join(', ')}. Configure them before serving API requests.`);
const app = express();
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(x=>x.trim());
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin(origin, cb) { if (!origin || origins.includes(origin) || process.env.NODE_ENV === 'production' && !process.env.CLIENT_ORIGIN) return cb(null, true); cb(new Error('Origin is not allowed by CORS.')); }, allowedHeaders:['Content-Type','Authorization'], methods:['GET','POST','PATCH','DELETE','OPTIONS'] }));
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_req,res)=>res.json({status:'ok'}));
app.get('/config', (_req,res)=>res.json({supabaseUrl:process.env.SUPABASE_URL||'',supabaseAnonKey:process.env.SUPABASE_ANON_KEY||''}));
app.use('/api', rateLimit({ windowMs:60_000, limit:120, standardHeaders:true, legacyHeaders:false }), (req,res,next)=>{
  if (missing.length) return res.status(503).json({error:'The server is not configured. Set the required Supabase environment variables.'});
  next();
}, requireAuth, api);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static('dist', { index:false, maxAge:'1h' }));
  app.get('*path', (req,res,next)=>{ if(req.path.startsWith('/api')||req.path==='/health')return next(); res.sendFile('index.html',{root:'dist'}); });
}
app.use((err,_req,res,_next)=>{ console.error(err.message); res.status(err.status || 500).json({error:err.message || 'Unexpected server error.'}); });
const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log(`HerWay AI server listening on port ${port}`));
