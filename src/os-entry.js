import legacy from './cloudflare-entry.js';

const encoder=new TextEncoder();
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
function bearer(request){const value=request.headers.get('authorization')||'';return value.startsWith('Bearer ')?value.slice(7):''}
async function safeEqual(a,b){const[ha,hb]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(a||'')),crypto.subtle.digest('SHA-256',encoder.encode(b||''))]);const aa=new Uint8Array(ha),bb=new Uint8Array(hb);let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0}
async function authorized(request,env){if(!env.OS_BRIDGE_KEY)return false;const supplied=bearer(request)||request.headers.get('x-os-bridge-key')||'';return supplied?safeEqual(supplied,env.OS_BRIDGE_KEY):false}
async function readJson(request){if(!(request.headers.get('content-type')||'').includes('application/json'))throw new Error('JSON body required.');return request.json()}

async function ensureSchema(db){
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS os_content_jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      objective TEXT NOT NULL,
      project_id TEXT,
      priority INTEGER NOT NULL DEFAULT 60,
      risk_level TEXT NOT NULL DEFAULT 'low',
      status TEXT NOT NULL DEFAULT 'queued',
      plan_json TEXT NOT NULL DEFAULT '[]',
      callback_url TEXT,
      source_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_os_content_jobs_status ON os_content_jobs(status,priority DESC,created_at ASC)`)
  ]);
}

function normalize(body){
  const job=body&&typeof body==='object'&&body.job&&typeof body.job==='object'?body.job:body;
  const id=String(job?.id||'').trim(),objective=String(job?.objective||'').trim().slice(0,12000);
  if(!id||!objective)throw new Error('job.id and job.objective are required.');
  return {id,title:String(job?.title||objective).trim().slice(0,300),objective,projectId:job?.projectId?String(job.projectId).slice(0,300):null,priority:Math.max(1,Math.min(100,Number(job?.priority||60))),riskLevel:String(job?.riskLevel||'low').slice(0,30),plan:Array.isArray(job?.plan)?job.plan.slice(0,30):[],callbackUrl:job?.callbackUrl?String(job.callbackUrl).slice(0,1500):null,source:body?.sourceEvidence&&typeof body.sourceEvidence==='object'?body.sourceEvidence:{}};
}

async function sendCallback(env,row,status,result={}){
  if(!row.callback_url||!env.OS_CALLBACK_TOKEN)return;
  try{await fetch(row.callback_url,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${env.OS_CALLBACK_TOKEN}`},body:JSON.stringify({jobId:row.id,status,result})})}catch(error){console.error('GhostWriter OS callback failed',error)}
}

async function osApi(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/os/health'&&request.method==='GET'){
    await ensureSchema(env.DB);const counts=await env.DB.prepare('SELECT status,COUNT(*) count FROM os_content_jobs GROUP BY status').all();
    return json({ok:true,service:'ghost-writer-receiver',osReceiver:true,writeProtected:Boolean(env.OS_BRIDGE_KEY),queue:counts.results||[]});
  }
  if(!path.startsWith('/api/os/'))return null;
  if(!(await authorized(request,env)))return json({error:env.OS_BRIDGE_KEY?'OS bridge key required.':'OS_BRIDGE_KEY is not configured.'},env.OS_BRIDGE_KEY?401:503);
  await ensureSchema(env.DB);
  if(path==='/api/os/jobs'&&request.method==='POST'){
    const input=normalize(await readJson(request)),now=new Date().toISOString();
    const existing=await env.DB.prepare('SELECT id,status FROM os_content_jobs WHERE id=?').bind(input.id).first();
    if(existing)return json({accepted:true,duplicate:true,jobId:existing.id,status:existing.status});
    await env.DB.prepare(`INSERT INTO os_content_jobs
      (id,title,objective,project_id,priority,risk_level,status,plan_json,callback_url,source_json,result_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'queued',?,?,?,'{}',?,?)`)
      .bind(input.id,input.title,input.objective,input.projectId,input.priority,input.riskLevel,JSON.stringify(input.plan),input.callbackUrl,JSON.stringify(input.source),now,now).run();
    return json({accepted:true,status:'queued',jobId:input.id,queue:'ghostwriter'},202);
  }
  if(path==='/api/os/jobs'&&request.method==='GET'){
    const rows=await env.DB.prepare(`SELECT * FROM os_content_jobs ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END,priority DESC,created_at ASC LIMIT 100`).all();
    return json({jobs:(rows.results||[]).map(row=>({...row,plan:JSON.parse(row.plan_json||'[]'),source:JSON.parse(row.source_json||'{}'),result:JSON.parse(row.result_json||'{}')}))});
  }
  const match=path.match(/^\/api\/os\/jobs\/([^/]+)$/);
  if(match&&request.method==='PATCH'){
    const id=decodeURIComponent(match[1]),input=await readJson(request),allowed=new Set(['queued','running','blocked','complete','cancelled']);const status=String(input.status||'');
    if(!allowed.has(status))return json({error:'Invalid status.'},400);
    const current=await env.DB.prepare('SELECT * FROM os_content_jobs WHERE id=?').bind(id).first();if(!current)return json({error:'Job not found.'},404);
    const result=input.result&&typeof input.result==='object'?input.result:{},now=new Date().toISOString();
    await env.DB.prepare('UPDATE os_content_jobs SET status=?,result_json=?,updated_at=?,completed_at=CASE WHEN ?=\'complete\' THEN ? ELSE completed_at END WHERE id=?').bind(status,JSON.stringify(result),now,status,now,id).run();
    const row=await env.DB.prepare('SELECT * FROM os_content_jobs WHERE id=?').bind(id).first();if(status==='complete'||status==='blocked')await sendCallback(env,row,status,result);
    return json({ok:true,jobId:id,status});
  }
  return json({error:'OS bridge route not found.'},404);
}

export default {
  async fetch(request,env,ctx){
    try{const handled=await osApi(request,env);if(handled)return handled;return legacy.fetch(request,env,ctx)}
    catch(error){console.error('GhostWriter OS bridge',error);return json({error:error?.message||'Internal server error.'},500)}
  },
  scheduled(controller,env,ctx){return legacy.scheduled(controller,env,ctx)}
};
