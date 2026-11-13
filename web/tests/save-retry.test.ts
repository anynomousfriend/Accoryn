import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canSaveRegistration} from '../src/object-registration/controller.ts';
test('a failed save can retry the retained complete views without recapture',()=>{
 assert.equal(canSaveRegistration('error',3,true),true);
 assert.equal(canSaveRegistration('review',3,true),true);
 for(const phase of ['saving','processing','stopped','idle'])assert.equal(canSaveRegistration(phase,3,true),false);
 assert.equal(canSaveRegistration('error',2,true),false);
 assert.equal(canSaveRegistration('error',3,false),false);
});
