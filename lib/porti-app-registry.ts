import { definePortiApp } from "../sdk/porti-apps";
export const portiApps = [
  definePortiApp({schemaVersion:1,id:"rhea-pools",name:"Rhea Pool Lens",version:"1.0.0",description:"Inspect a pool in the Rhea / Ref exchange contract, including token accounts, raw reserves and pool fees.",category:"Exchange",network:"mainnet",website:"https://rhea.finance",permissions:["chain:read"],actions:[{id:"read-pool",label:"Inspect exchange pool",effect:"read"}]}),
  definePortiApp({schemaVersion:1,id:"near-staking",name:"NEAR Staking Lens",version:"1.0.0",description:"Read a standard NEAR staking pool’s total stake, delegator count and reward fee from finalized blocks.",category:"Staking",network:"mainnet",website:"https://docs.near.org",permissions:["chain:read"],actions:[{id:"read-pool",label:"Inspect staking pool",effect:"read"}]}),
];
export function registeredApp(id: string) { return portiApps.find(app => app.id === id); }
