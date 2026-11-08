import {nearHashOK} from './near-core.mjs';

// Access-key evidence is a bounded state read, never a bytecode audit or an ownership claim.
export async function readContractControls(readAccount, readKeys, now = Date.now) {
  let account;
  try {
    account = await readAccount();
    if (!nearHashOK(account?.code_hash) || !nearHashOK(account?.block_hash)) throw new Error('Invalid account evidence');
  } catch {
    return {status:'unavailable', checkedAt:now(), source:'NEAR final RPC', summary:'Contract account state could not be read.', limitations:'Code, access keys, application roles and upgrade paths remain unknown.'};
  }
  const base = {source:'NEAR final RPC', checkedAt:now(), blockHash:account.block_hash, blockHeight:account.block_height, codeHash:account.code_hash, codeDeployed:account.code_hash !== '11111111111111111111111111111111'};
  try {
    const response = await readKeys(account.block_hash);
    if (!Array.isArray(response?.keys) || response.keys.length > 100 || response.block_hash !== account.block_hash) throw new Error('Invalid key evidence');
    let fullAccessKeyCount=0, functionCallKeyCount=0, unknownKeyCount=0;
    for (const key of response.keys) {
      const permission=key?.access_key?.permission;
      if (permission === 'FullAccess' || (permission && typeof permission === 'object' && Object.hasOwn(permission,'GasKeyFullAccess'))) fullAccessKeyCount++;
      else if (permission && typeof permission === 'object' && (Object.hasOwn(permission,'FunctionCall') || Object.hasOwn(permission,'GasKeyFunctionCall'))) functionCallKeyCount++;
      else unknownKeyCount++;
    }
    const complete = !response.last_key && unknownKeyCount === 0;
    return {...base, status:complete?'confirmed':'partial', keyCount:response.keys.length, fullAccessKeyCount, functionCallKeyCount, unknownKeyCount, keyListComplete:complete,
      summary:fullAccessKeyCount
        ? `${fullAccessKeyCount} full-access key(s) observed on the contract account. These keys can authorize code deployment and other account actions; this does not prove misuse or identify their owner.`
        : complete ? 'No full-access keys were returned at this finalized block. This does not prove the contract is immutable: its code may expose upgrade or privileged methods.' : 'No full-access keys were identified in the returned subset. The key list or permission coverage is incomplete.',
      limitations:'Account-level access-key inspection only. Bytecode, contract-managed upgrades, owner/role settings, mint/pause privileges, LP locks and sellability are not audited.'};
  } catch {
    return {...base, status:'partial', keyListComplete:false, summary:'Contract code hash was read, but access keys could not be confirmed at the same finalized block.', limitations:'Application roles, access-key permissions and upgrade paths remain unknown. Code hash presence is not a source-code audit.'};
  }
}
