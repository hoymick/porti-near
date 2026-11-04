export const themePreference=v=>['auto','light','dark'].includes(v)?v:'auto';
export function themeAt(preference,date=new Date()){const p=themePreference(preference);return p==='auto'?(date.getHours()>=7&&date.getHours()<19?'light':'dark'):p;}
