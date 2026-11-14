import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedTools, testnetRead } from './policy.mjs';
test('only official read tools can pass; signing/import/export/transfer tools fail', () => {
 assert.equal(allowedTools.length,3);
 for (const name of ['tokens_send_near','system_import_account','account_export_account','account_create_account','contract_call_raw_function']) {
  assert.throws(()=>testnetRead(name,{networkId:'testnet'}),/read-only/);
 }
});
test('testnet is explicit even when omitted upstream; mainnet is rejected', () => {
 const result=testnetRead('account_view_account_summary',{accountId:'accoryn.testnet'});
 assert.equal(result.networkId,'testnet');
 assert.throws(()=>testnetRead('account_view_account_summary',{networkId:'mainnet',accountId:'alice.near'}),/testnet/);
});
