import bcrypt from 'bcryptjs';
const SESSION_AGE=7*86400,MAX_BYTES=1048576;
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const encode=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
const digest=async text=>encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));
const cookie=(request,token,age=SESSION_AGE)=>`pz_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
export async function currentUser(request,db){const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]||request.headers.get('cookie')?.match(/(?:^|;\s*)pz_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return null;return db.prepare('SELECT accounts.id, accounts.email FROM sessions JOIN accounts ON accounts.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?').bind(await digest(token),Date.now()).first();}
async function limit(db,bucket,max){const now=Date.now();const row=await db.prepare('INSERT INTO auth_limits (bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at < ? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at < ? THEN excluded.expires_at ELSE expires_at END RETURNING attempts').bind(bucket,now+3600000,now,now).first();return row.attempts<=max;}
async function body(request){if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new Error('JSON');if(Number(request.headers.get('content-length'))>MAX_BYTES)throw new Error('size');const raw=await request.text();if(new TextEncoder().encode(raw).length>MAX_BYTES)throw new Error('size');return JSON.parse(raw);}
function validPlan(s){const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]+$/.test(x),date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x),time=x=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x),num=x=>Number.isFinite(x)&&x>=0;return s?.version===1&&['categories','slots','tasks','template','unavailable','moves','sessions'].every(k=>Array.isArray(s[k]))&&s.baselines&&typeof s.baselines==='object'&&s.reviews&&typeof s.reviews==='object'&&s.categories.every(c=>id(c.id)&&typeof c.name==='string'&&/^#[a-f0-9]{6}$/i.test(c.color))&&s.tasks.every(t=>id(t.id)&&id(t.category)&&date(t.date)&&typeof t.title==='string'&&num(t.estimate)&&num(t.actual))&&s.slots.every(x=>id(x.id)&&id(x.category)&&date(x.date)&&time(x.start)&&num(x.duration))&&s.unavailable.every(x=>id(x.id)&&typeof x.title==='string'&&date(x.from)&&(!x.until||date(x.until))&&time(x.start)&&num(x.duration))&&s.sessions.every(x=>id(x.id)&&date(x.date)&&num(x.minutes))&&s.moves.every(x=>id(x.id)&&date(x.from)&&date(x.to)&&num(x.minutes));}
async function coreAPI(request,env){const db=env.DB,path=new URL(request.url).pathname,method=request.method;
 if(!db)return json({error:'Хранилище аккаунтов пока недоступно.'},503);
 if(!['GET','POST','PUT'].includes(method))return json({error:'Метод не поддерживается.'},405);
 if(method!=='GET'&&!trustedOrigin(request,env))return json({error:'Запрос отклонён.'},403);
 let data;try{if(method!=='GET')data=await body(request);}catch{return json({error:'Некорректные данные запроса.'},400);}
 if(path==='/api/auth/register'||path==='/api/auth/login'){
  if(method!=='POST')return json({error:'Метод не поддерживается.'},405);
  const email=typeof data.email==='string'?data.email.trim().toLowerCase():'',password=data.password;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||new TextEncoder().encode(password).length>72)return json({error:'Укажите email и пароль от 12 символов (не более 72 байт).'},400);
  const ip=request.headers.get('cf-connecting-ip')||'local';
  if(!await limit(db,'ip:'+await digest(ip),60)||!await limit(db,'email:'+await digest(email),15))return json({error:'Слишком много попыток. Попробуйте через час.'},429);
  let account=await db.prepare('SELECT id,email,password_hash FROM accounts WHERE email = ?').bind(email).first();
  if(path.endsWith('/register')){if(account)return json({error:'Не удалось создать аккаунт с этим email. Попробуйте войти.'},409);const id=crypto.randomUUID(),hash=await bcrypt.hash(password,12);try{await db.prepare('INSERT INTO accounts (id,email,password_hash,created_at) VALUES (?,?,?,?)').bind(id,email,hash,Date.now()).run();}catch{return json({error:'Не удалось создать аккаунт. Попробуйте войти.'},409);}account={id,email};}
  else{const fake='$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxpCCFKzcwlb0fIYkQ4oS8A4E2q';const ok=await bcrypt.compare(password,account?.password_hash||fake);if(!account||!ok)return json({error:'Неверный email или пароль.'},401);}
  const token=random();await db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token),account.id,Date.now()+SESSION_AGE*1000).run();
  await db.batch([db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),db.prepare('DELETE FROM auth_limits WHERE expires_at < ?').bind(Date.now())]);
  return json({user:{id:account.id,email:account.email},...(request.headers.get('origin')===env.PUBLIC_APP_ORIGIN?{token}: {})},200,{'Set-Cookie':cookie(request,token)});
 }
 const user=await currentUser(request,db);
 if(path==='/api/auth/me')return json({user});
 if(!user)return json({error:'Войдите в аккаунт.'},401);
 if(path==='/api/auth/logout'&&method==='POST'){const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]||request.headers.get('cookie')?.match(/pz_session=([a-f0-9]{64})/)?.[1];if(token)await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await digest(token)).run();return json({ok:true},200,{'Set-Cookie':cookie(request,'',0)});}
 if(path==='/api/plan'&&method==='GET'){const row=await db.prepare('SELECT state_json,revision FROM user_plans WHERE user_id = ?').bind(user.id).first();return json(row?{state:JSON.parse(row.state_json),revision:row.revision}:{state:null,revision:0});}
 if(path==='/api/plan'&&method==='PUT'){
  if(!validPlan(data.state)||!Number.isInteger(data.revision)||data.revision<0)return json({error:'Некорректный формат плана.'},400);
  // Running focus sessions are synced as timestamps, never as active intervals on the server.
  const args=[JSON.stringify(data.state),Date.now(),user.id,data.revision];let row;
  if(data.revision===0){row=await db.prepare('INSERT INTO user_plans (state_json,updated_at,user_id,revision) VALUES (?,?,?,1) ON CONFLICT(user_id) DO NOTHING RETURNING revision').bind(...args.slice(0,3)).first();}
  else row=await db.prepare('UPDATE user_plans SET state_json=?,updated_at=?,revision=revision+1 WHERE user_id=? AND revision=? RETURNING revision').bind(...args).first();
  if(!row)return json({error:'План изменён на другом устройстве. Обновите страницу перед продолжением.'},409);
  return json({revision:row.revision});
 }
 return json({error:'Не найдено.'},404);
}

function trustedOrigin(request,env){const origin=request.headers.get('origin');return origin===new URL(request.url).origin||!!env.PUBLIC_APP_ORIGIN&&origin===env.PUBLIC_APP_ORIGIN;}
export async function api(request,env){const origin=request.headers.get('origin'),external=origin===env.PUBLIC_APP_ORIGIN&&!!origin;if(request.method==='OPTIONS'){if(!trustedOrigin(request,env))return json({error:'Origin rejected'},403);return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600','Vary':'Origin'}});}if(origin&&!trustedOrigin(request,env))return json({error:'Запрос отклонён.'},403);const response=await coreAPI(request,env);if(!external)return response;const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');return new Response(response.body,{status:response.status,headers});}
