// Local edits never write back to the provider feed.
export function sanitizeCalendarOverrides(value,categories){
 const result={};if(!value||typeof value!=='object'||Array.isArray(value))return result;
 for(const [id,o] of Object.entries(value).slice(0,2000)){
  if(!/^gcal-[a-z0-9-]+$/.test(id)||!o||typeof o!=='object')continue;
  const edit={};if(typeof o.title==='string'&&o.title.trim())edit.title=o.title.trim().slice(0,240);
  if(o.category===null||categories.some(c=>c.id===o.category))edit.category=o.category;
  if(Number.isInteger(o.duration)&&o.duration>=1&&o.duration<=1440)edit.duration=o.duration;
  result[id]=edit;
 }return result;
}
export function applyCalendarOverrides(events,overrides){return events.map(e=>({...e,...overrides[e.id]}));}
