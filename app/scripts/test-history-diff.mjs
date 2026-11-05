import assert from 'node:assert/strict';
import {buildHistoryDiff} from '../src/lib/history-diff.ts';

function rowsOf(before,after){
 return buildHistoryDiff(before,after).segments.flatMap(segment=>segment.type==='hunk'?segment.rows:[]);
}

const added=buildHistoryDiff('a\n','a\nb\n');
assert.equal(added.tooLarge,false);
assert.equal(added.adds,1);
assert.equal(added.dels,0);

const removed=buildHistoryDiff('a\nb\n','a\n');
assert.equal(removed.adds,0);
assert.equal(removed.dels,1);

const word=rowsOf('hello world','hello there');
assert.ok(word.some(row=>row.left.spans.some(span=>span.mark&&span.text.includes('world'))));
assert.ok(word.some(row=>row.right.spans.some(span=>span.mark&&span.text.includes('there'))));

const gap=Array(10).fill('same').join('\n');
const distant=buildHistoryDiff(`alpha\n${gap}\nomega`,`ALPHA\n${gap}\nOMEGA`);
assert.equal(distant.hunks,2);
assert.ok(distant.segments.some(segment=>segment.type==='skip'&&segment.count>0));

const same=buildHistoryDiff('một\nhai','một\nhai');
assert.equal(same.identical,true);
assert.equal(same.hunks,0);

const blank=buildHistoryDiff('','');
assert.equal(blank.identical,true);
const fromEmpty=buildHistoryDiff('','xin chào');
assert.equal(fromEmpty.identical,false);
assert.ok(fromEmpty.adds>=1);

const vi=rowsOf('Ly cà phê nóng','Ly cà phê sữa nóng');
assert.ok(vi.some(row=>row.right.spans.some(span=>span.mark&&span.text.includes('sữa'))));

const table=rowsOf('| Sữa | 150 |','| Yến mạch | 150 |');
assert.ok(table.some(row=>row.right.spans.some(span=>span.mark&&span.text.includes('Yến'))));
assert.ok(table.some(row=>row.left.spans.some(span=>span.mark&&span.text.includes('Sữa'))));

const code=rowsOf('```\nconst x = 1\n```','```\nconst x = 2\n```');
assert.ok(code.some(row=>row.right.spans.some(span=>span.mark&&span.text.includes('2'))));

const html=rowsOf('say <b>hi</b>','say <b>yo</b>');
assert.ok(html.some(row=>row.left.text.includes('<b>')&&row.right.text.includes('<b>')));

const unrelated=rowsOf('keep\ngone\nmid\nkeep2','keep\nmid\nadded\nkeep2');
assert.equal(unrelated.some(row=>row.left.text.includes('gone')&&row.right.text.includes('added')),false);

const long='a'.repeat(401);
const longDiff=buildHistoryDiff(long,'b'+'a'.repeat(400));
assert.equal(longDiff.tooLarge,false);
assert.equal(longDiff.segments.flatMap(segment=>segment.type==='hunk'?segment.rows:[]).some(row=>[...row.left.spans,...row.right.spans].some(span=>span.mark)),false);

const huge=buildHistoryDiff(Array(600).fill('a').join('\n'),Array(600).fill('b').join('\n'));
assert.equal(huge.tooLarge,true);
assert.equal(huge.hunks,0);

console.log('PASS: history diff add, delete, word, hunks, identical, empty, Vietnamese, table, code, html, unpaired lines, long line, too large');
