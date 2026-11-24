import test from 'node:test';
import assert from 'node:assert/strict';
import {pastMinutes,canSchedule,canPlaceInSlot} from '../dist/model.js';
const now=new Date(2026,10,24,11,15,30);
test('past days are fully closed; future days stay open',()=>{assert.equal(pastMinutes('2026-11-23',now),1440);assert.equal(pastMinutes('2026-11-25',now),0);assert.equal(canSchedule('2026-11-23','23:59',now),false);assert.equal(canSchedule('2026-11-25','00:00',now),true);});
test('today closes at actual clock time, including seconds',()=>{assert.equal(canSchedule('2026-11-24','11:15',now),false);assert.equal(canSchedule('2026-11-24','11:16',now),true);});
test('ended slots reject placement; ongoing slots accept future work',()=>{assert.equal(canPlaceInSlot({date:'2026-11-24',start:'10:00',duration:60},now),false);assert.equal(canPlaceInSlot({date:'2026-11-24',start:'11:00',duration:60},now),true);assert.equal(canPlaceInSlot({date:'2026-11-23',start:'23:00',duration:60},now),false);});
