import test from 'node:test';import assert from 'node:assert/strict';
import {sanitizeCalendarOverrides,applyCalendarOverrides} from '../server/calendar-overrides.js';
test('local calendar edits allow only supported fields and existing categories',()=>{
 const edits=sanitizeCalendarOverrides({'gcal-abc':{title:' Edited ',category:'c',duration:45,start:'00:00',source:'fake'},bad:{title:'bad'},'gcal-def':{category:'unknown',duration:-1}},[{id:'c'}]);
 assert.deepEqual(edits['gcal-abc'],{title:'Edited',category:'c',duration:45});assert.equal(edits.bad,undefined);assert.deepEqual(edits['gcal-def'],{});
 const base=[{id:'gcal-abc',title:'Original',duration:60,source:'google',start:'10:00'}];const edited=applyCalendarOverrides(base,edits);assert.equal(edited[0].title,'Edited');assert.equal(edited[0].start,'10:00');assert.equal(base[0].title,'Original');
});
