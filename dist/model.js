export const uid=()=>globalThis.crypto.randomUUID();
export function dateKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function addDays(key,n){const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+n);return dateKey(d);}
export function monday(key){const d=new Date(key+'T12:00:00');return addDays(key,-((d.getDay()+6)%7));}
export function minutes(time){const [h,m]=time.split(':').map(Number);return h*60+m;}
export function endTime(start,length){const n=minutes(start)+length;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
export function overlap(a,b){return Math.max(0,Math.min(minutes(a.start)+a.duration,minutes(b.start)+b.duration)-Math.max(minutes(a.start),minutes(b.start)));}
export function unavailableOn(event,date){if(date<event.from||(event.until&&date>event.until))return false;return event.repeat==='weekly'?event.weekday===((new Date(date+'T12:00:00').getDay()+6)%7):event.from===date;}
export function slotsOn(state,date){return state.slots.filter(x=>x.date===date);}
export function conflicts(state){const result=[];for(const slot of state.slots){for(const e of state.unavailable.filter(e=>unavailableOn(e,slot.date)))if(overlap(slot,e))result.push({slot:slot.id,text:`${slot.date}: блок пересекается с «${e.title}»`});for(const other of state.slots)if(slot.id<other.id&&slot.date===other.date&&overlap(slot,other))result.push({slot:slot.id,text:`${slot.date}: пересечение двух блоков`});}return result;}
export function load(state,category,date){const tasks=state.tasks.filter(t=>t.category===category&&t.date===date);const budget=slotsOn(state,date).filter(s=>s.category===category).reduce((n,s)=>n+s.duration,0);const actual=state.sessions.filter(s=>s.date===date&&s.category===category).reduce((n,s)=>n+s.minutes,0);const remaining=tasks.filter(t=>!t.done).reduce((n,t)=>n+Math.max(0,t.estimate-t.actual),0);return {budget,actual,remaining,planned:tasks.reduce((n,t)=>n+t.estimate,0),overflow:Math.max(0,actual+remaining-budget)};}
export function moveTask(state,id,date){const task=findTask(state,id);if(!task||!date||date===task.date)return;const from=task.date;if(!from){state.backlog=(state.backlog||[]).filter(t=>t.id!==id);state.tasks.push(task);}state.moves.push({id:uid(),task:id,title:task.title,from:from||null,to:date,source:from?'schedule':'backlog',minutes:Math.max(0,task.estimate-task.actual),at:Date.now()});task.date=date;task.originalDate ||= date;delete task.slotId;}

export function snapshotDay(state,date){if(state.baselines[date])return;state.baselines[date]={at:Date.now(),tasks:state.tasks.filter(t=>t.date===date).map(t=>({id:t.id,title:t.title,category:t.category,estimate:t.estimate})),slots:structuredClone(slotsOn(state,date))};}
export function seed(){const today=dateKey(),week=monday(today);const categories=[{id:'gramota',name:'Грамота',color:'#8b81c9',tag:'грамота'},{id:'alliance',name:'Альянс',color:'#cf885f',tag:'альянс'},{id:'admin',name:'Life Admin',color:'#7c9a7d',tag:'быт'},{id:'lp',name:'LP',color:'#638fa4',tag:'lp'}];const template=[{weekday:0,category:'gramota',start:'09:00',duration:240},{weekday:0,category:'admin',start:'14:00',duration:120},{weekday:1,category:'lp',start:'09:00',duration:180},{weekday:1,category:'alliance',start:'13:00',duration:180}];return {version:1,categories,template,slots:template.map(x=>({...x,id:uid(),date:addDays(week,x.weekday)})),tasks:[],backlog:[],unavailable:[],moves:[],baselines:{},reviews:{},sessions:[],timer:null,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};}

// Unfinished work without a slot, or beyond its category's daily capacity.
// Allocation follows task insertion order; the same task is listed only once.
export function inboxTasks(state){
 const groups=new Map(),result=[];
 for(const task of state.tasks){
  if(task.done)continue;
  const key=task.category+'|'+task.date;
  if(!groups.has(key)){
   const slots=state.slots.filter(s=>s.date===task.date&&s.category===task.category);
   const spent=state.sessions.filter(s=>s.date===task.date&&s.category===task.category).reduce((sum,s)=>sum+s.minutes,0);
   groups.set(key,{hasSlot:slots.length>0,free:Math.max(0,slots.reduce((sum,s)=>sum+s.duration,0)-spent)});
  }
  const group=groups.get(key),remaining=Math.max(0,task.estimate-task.actual);
  if(!group.hasSlot)result.push({task,reason:'no-slot',missingMinutes:remaining});
  else if(remaining>group.free)result.push({task,reason:'overflow',missingMinutes:remaining-group.free});
  group.free=Math.max(0,group.free-remaining);
 }
 return result.sort((a,b)=>a.task.date.localeCompare(b.task.date));
}

export function findTask(state,id){return state.tasks.find(t=>t.id===id)||(state.backlog||[]).find(t=>t.id===id);}
export function tasksInSlot(state,slot){const matching=state.slots.filter(s=>s.date===slot.date&&s.category===slot.category).sort((a,b)=>a.start.localeCompare(b.start));return state.tasks.filter(t=>t.date===slot.date&&t.category===slot.category&&(matching.find(s=>s.id===t.slotId)||matching[0])?.id===slot.id);}
export function placeTask(state,id,slotId){const slot=state.slots.find(s=>s.id===slotId),task=findTask(state,id);if(!slot||!task)throw Error('Задача или интервал больше не существуют.');if(!state.categories.some(c=>c.id===slot.category))throw Error('Блок больше не существует.');const from=task.date,fromCategory=task.category;if((state.backlog||[]).some(t=>t.id===id)){state.backlog=state.backlog.filter(t=>t.id!==id);state.tasks.push(task);}if(from!==slot.date||fromCategory!==slot.category)state.moves.push({id:uid(),task:id,title:task.title,from:from||null,to:slot.date,source:from?'schedule':'backlog',fromCategory,toCategory:slot.category,minutes:Math.max(0,task.estimate-task.actual),at:Date.now()});task.date=slot.date;task.originalDate ||= slot.date;task.category=slot.category;task.slotId=slot.id;return task;}
export function stashTask(state,id){const task=state.tasks.find(t=>t.id===id);if(!task)return;state.moves.push({id:uid(),task:id,title:task.title,from:task.date,to:null,target:'backlog',fromCategory:task.category,toCategory:task.category,minutes:Math.max(0,task.estimate-task.actual),at:Date.now()});state.tasks=state.tasks.filter(t=>t.id!==id);task.date=null;delete task.slotId;(state.backlog ||= []).push(task);return task;}
export function deleteTask(state,id){for(const source of ['tasks','backlog']){const list=state[source]||[],index=list.findIndex(t=>t.id===id);if(index>=0)return {source,index,task:list.splice(index,1)[0]};}return null;}
export function restoreTask(state,record){if(!record||findTask(state,record.task.id))return false;const list=state[record.source] ||= [];list.splice(Math.min(record.index,list.length),0,record.task);return true;}
export function suggestStart(state,date,duration){const occupied=[...state.slots.filter(s=>s.date===date),...state.unavailable.filter(e=>unavailableOn(e,date))];for(let n=540;n+duration<=1440;n+=15){const start=endTime('00:00',n);if(!occupied.some(s=>overlap(s,{start,duration})))return start;}return '09:00';}

export function pastMinutes(date,now=new Date()){const today=dateKey(now);return date<today?1440:date>today?0:now.getHours()*60+now.getMinutes()+now.getSeconds()/60;}
export function canSchedule(date,start,now=new Date()){return date>=dateKey(now)&&minutes(start)>=pastMinutes(date,now);}
export function canPlaceInSlot(slot,now=new Date()){return slot.date>=dateKey(now)&&minutes(slot.start)+slot.duration>pastMinutes(slot.date,now);}
