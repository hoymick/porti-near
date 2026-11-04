import test from 'node:test';
import assert from 'node:assert/strict';
import {chatBlocks,inlineChat,displayChatText} from '../lib/chat-format.mjs';
test('financial values remain exact while assistant formatting becomes structured',()=>{
 const value='1.513652869461049488602404';
 const blocks=chatBlocks('# Evidence\n\n- **Price:** `'+value+' NEAR`\n- **Supply:** `14276262.346841678200762141037475`');
 assert.equal(blocks[0].type,'heading');assert.equal(blocks[1].type,'ul');
 assert.deepEqual(inlineChat(blocks[1].items[0]),[{type:'strong',text:'Price:'},{type:'text',text:' '},{type:'code',text:value+' NEAR'}]);
 assert.equal(chatBlocks('```\n'+value+'\n```')[0].text,value);
});
test('malformed assistant tool markup is not shown as an answer; user text stays exact',()=>{
 const raw='<tool_call>read_chart<arg_key>token</arg_key></tool_call>';
 assert.ok(!displayChatText(raw).includes('<tool_call>'));
 assert.equal(displayChatText(raw,false),raw);
 assert.equal(displayChatText('Plain answer.'),'Plain answer.');
});
test('links allow only ordinary web URLs and HTML stays text',()=>{
 assert.equal(inlineChat('[source](https://example.com/a)')[0].href,'https://example.com/a');
 for(const value of ['[bad](javascript:alert(1))','[bad](https://user:password@example.com)','<img src=x onerror=alert(1)>'])assert.ok(inlineChat(value).every(x=>x.type!=='link'));
 assert.equal(chatBlocks('<script>alert(1)</script>')[0].text,'<script>alert(1)</script>');
});
