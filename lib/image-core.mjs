export function imageInfo(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<24||bytes.length>500000)throw Error('Use a JPEG or PNG image below 500 KB after resizing.');
 let mime,width=0,height=0;
 if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)){if(bytes.length<45||bytes[11]!==13||String.fromCharCode(...bytes.slice(12,16))!=='IHDR'||String.fromCharCode(...bytes.slice(-8,-4))!=='IEND')throw Error('PNG image is truncated or malformed.');mime='image/png';const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);width=v.getUint32(16);height=v.getUint32(20);}
 else if(bytes[0]===255&&bytes[1]===216){if(bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw Error('JPEG image is truncated.');mime='image/jpeg';let i=2;while(i+8<bytes.length){if(bytes[i++]!==255)continue;const marker=bytes[i++];if(marker===217||marker===218)break;if(marker===0||marker===255)continue;const len=bytes[i]*256+bytes[i+1];if(len<2||i+len>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){height=bytes[i+3]*256+bytes[i+4];width=bytes[i+5]*256+bytes[i+6];break;}i+=len;}}
 if(!mime||width<1||height<1||width>4096||height>4096||width*height>12000000)throw Error('Unsupported or oversized image. Use JPEG or PNG, up to 4096 × 4096.');
 return {mime,width,height};
}
