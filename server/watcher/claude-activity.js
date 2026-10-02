import { open } from 'node:fs/promises';

// Only direct questions addressed to the user at the end of a response.
// Ignore code and quotations, which often contain unrelated question marks.
export function finalQuestion(text) {
  const clean=text.replace(/```[\s\S]*?```/g,'').replace(/^>.*$/gm,'').trim().replace(/[\s*_`]+$/g,'');
  if (!clean.endsWith('?')) return null;
  const match=clean.match(/(?:^|[.!]\s+|\n)([^.!?\n]*\?)$/);
  const question=match?.[1]?.replace(/^[*_\s]+/,'').trim();
  return question && /^(?:want me|would you|could you|can you|do you|did you|are you|have you|should I|shall I|can I|may I|which\b|what\b.*\byou\b|how\b.*\byou\b|where\b.*\byou\b)/i.test(question) ? question.slice(0,240) : null;
}

/** Activity metadata only; no prompt/output text is returned or replayed. */
export function activityRecord(record, {allowSidechain=false} = {}) {
  if (record.isSidechain && !allowSidechain || record.isMeta || record.isApiErrorMessage) return null;
  const at = Date.parse(record.timestamp);
  if (!Number.isFinite(at)) return null;
  const message = record.message ?? {}, content = message.content;
  const blocks = Array.isArray(content) ? content : [];
  const texts = typeof content === 'string' ? [content] : blocks.filter(b=>b.type==='text').map(b=>b.text ?? '');
  if (record.type === 'user' && texts.some(text => /^\[Request interrupted by user(?: for tool use)?\]$/.test(text.trim()))) {
    return {pendingTurn:false,completed:false,interrupted:true,responseCanComplete:false,lastResponseAt:null,needsYou:false,questionCandidate:null,attentionToolId:null,at};
  }
  if (record.type === 'user' && (typeof content === 'string' || blocks.some(b => b.type === 'text')) && !blocks.some(b => b.type === 'tool_result')) {
    return { pendingTurn:true, completed:false, interrupted:false, turnStartedAt:at, responseCanComplete:false, lastResponseAt:null, needsYou:false, questionCandidate:null, attentionToolId:null, at };
  }
  if (record.type === 'user' && blocks.some(b=>b.type==='tool_result')) {
    return {answeredToolIds:blocks.filter(b=>b.type==='tool_result').map(b=>b.tool_use_id),at};
  }
  if (record.type === 'assistant') {
    const terminal = message.stop_reason === 'end_turn';
    const candidate = terminal || (blocks.some(b => b.type === 'text') && !blocks.some(b => b.type === 'tool_use') && message.stop_reason !== 'tool_use');
    const ask=blocks.find(b=>b.type==='tool_use' && b.name==='AskUserQuestion');
    return { pendingTurn:!terminal, interrupted:false, lastResponseAt:at, responseCanComplete:candidate, completed:terminal,
      questionCandidate:candidate ? finalQuestion(texts.join('\n')) : null,
      ...(ask ? {needsYou:true,attentionToolId:ask.id,attentionReason:'question',attentionText:String(ask.input?.questions?.[0]?.question ?? 'Claude has a question for you').slice(0,240)} : {}),at };
  }
  if (record.type === 'system' && record.subtype === 'turn_duration') return { pendingTurn:false, completed:true, at };
  return null;
}

export async function readActivity(path) {
  let file;
  try {
    file = await open(path,'r'); const {size}=await file.stat();
    const start=Math.max(0,size-512*1024), data=Buffer.alloc(size-start);
    await file.read(data,0,data.length,start);
    const lines=data.toString('utf8').split('\n'); if(start) lines.shift();
    let state=null;
    for(const line of lines) {
      try { const patch=activityRecord(JSON.parse(line)); if(patch && patch.at >= (state?.at ?? 0)) {
          if (patch.answeredToolIds?.includes(state?.attentionToolId)) state={...state,needsYou:false,attentionToolId:null};
          state={...state,...patch};
        } } catch { /* partial line */ }
    }
    return state;
  } catch { return null; } finally { await file?.close(); }
}
