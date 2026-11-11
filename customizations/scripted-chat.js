// Scripted replies projected into the native transcript. No demo chat.send calls.
(() => {
  'use strict';
  if (window.__openclawScriptedChat) return;
  const scriptKey = 'openclaw.local.scripted-chat.v1';
  const historyKey = 'openclaw.local.scripted-history.v2';
  const example = '用户：你好，介绍一下你自己。\n关键词：自我介绍|介绍自己\n分析：先确认问题，再组织一段简短的自我介绍。\n助手：你好！我是你的 AI 助手，可以帮助你整理资料、编写内容和解决问题。\n\n用户：你能帮我做什么？\n关键词：功能|能做什么\n分析：根据问题列出几个容易理解的使用场景。\n助手：我可以帮你写作、分析问题、解释知识，也可以协助你编写和检查代码。';
  const sessions = new WeakMap();
  let histories = {};
  try { histories = JSON.parse(localStorage.getItem(historyKey) || '{}'); if (!histories || Array.isArray(histories) || typeof histories !== 'object') histories = {}; } catch {}
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m10 8 6 4-6 4zM7 3v18M17 3v3M17 18v3"/></svg>';
  const editIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6zM14 5l5 5"/></svg>';
  function parse(text) {
    const rounds = []; let round, field;
    for (const line of text.replace(/\r/g, '').split('\n')) {
      const match = /^(用户|User|关键词|匹配|Keywords|分析|思考|Analysis|助手|Assistant)[：:]\s?(.*)$/i.exec(line);
      if (match) {
        const label = match[1].toLowerCase();
        field = ['用户', 'user'].includes(label) ? 'user' : ['助手', 'assistant'].includes(label) ? 'answer' : ['关键词','匹配','keywords'].includes(label) ? 'keywords' : 'analysis';
        if (field === 'user') { round = {user:'', keywords:'', analysis:'', answer:''}; rounds.push(round); }
        if (!round) throw Error('请先写“用户：”，再写“分析：”和“助手：”。');
        if (round[field]) throw Error('同一组不能重复填写“' + match[1] + '”。');
        round[field] = match[2];
      } else if (line.trim() || field) {
        if (!round || !field) { if (line.trim()) throw Error('每组请以“用户：”开头。'); }
        else round[field] += '\n' + line;
      }
    }
    for (const r of rounds) {
      for (const f of ['user','keywords','analysis','answer']) r[f] = r[f].trim();
      if (!r.user || !r.answer) throw Error('每组必须有非空的“用户：”和“助手：”。');
    }
    if (!rounds.length) throw Error('请至少填写一组对话。');
    return rounds;
  }
  function normalize(text) { return text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,''); }
  function similarity(a,b) {
    if(a.length<4||b.length<4)return 0;
    const pairs=text=>{const result=new Set();for(let i=0;i<text.length-1;i++)result.add(text.slice(i,i+2));return result;};
    const x=pairs(a),y=pairs(b);let count=0;for(const p of x)if(y.has(p))count++;
    return 2*count/(x.size+y.size);
  }
  function findMatch(rounds, input) {
    const query=normalize(input);if(!query)return null;
    let best=null, score=0;
    for(const round of rounds) {
      const question=normalize(round.user);
      const aliases=round.keywords.split(/[|｜,，;；\n]/).map(normalize).filter(Boolean);
      let rank=query===question?4:aliases.some(k=>query===k)?3:aliases.some(k=>query.includes(k))?2:0;
      if(!rank && Math.min(question.length,query.length)>=4 && Math.min(question.length,query.length)/Math.max(question.length,query.length)>=0.5 && (query.includes(question)||question.includes(query)))rank=1.5;
      if(!rank) {const fuzzy=similarity(query,question);if(fuzzy>=0.68)rank=fuzzy;}
      if(rank>score){best=round;score=rank;}
    }
    return best;
  }
  const duration = answer => Math.min(20000, Math.max(1200, Array.from(answer).length * 45));
  function scope(pane) { return JSON.stringify([pane.state?.settings?.gatewayUrl || location.origin,pane.context?.gateway?.snapshot?.selfUser?.id || 'local',pane.state?.sessionKey,pane.state?.currentSessionId]); }
  function state(pane) {
    let s=sessions.get(pane);
    if(!s){s={enabled:false,rounds:[],draft:'',messages:[],phase:'idle',generation:0,scope:null,notice:''};sessions.set(pane,s);}
    return s;
  }
  function saveHistory(s) {
    if(!s.scope)return;
    histories[s.scope]=s.messages;
    try{localStorage.setItem(historyKey,JSON.stringify(histories));}catch{s.notice='本机存储空间不足，本次演示记录暂未保存。';}
  }
  function stop(s) { clearTimeout(s.timer);s.generation++;s.phase='idle';s.runId=null;saveHistory(s); }
  function refresh(pane, follow=false) {
    pane.requestUpdate();
    if(follow)pane.updateComplete?.then(()=>pane.state?.scrollToBottom?.());
  }
  function exit(pane) { const s=state(pane);stop(s);s.enabled=false;s.notice='';refresh(pane);scan(); }
  function enable(pane, rounds) {
    if(pane.state?.chatRunId || pane.state?.chatSending)throw Error('当前模型正在回复，请等回复结束后再开启演示。');
    const s=state(pane);stop(s);const target=scope(pane);
    if(s.scope!==target){s.messages=Array.isArray(histories[target])?histories[target].map(m=>({...m,content:Array.isArray(m.content)?m.content.map(c=>c.type==='thinking'&&typeof c.thinking==='string'?{...c,thinking:c.thinking.replace(/^脚本分析（演示）\n/,'')}:c):m.content})):[];s.draft='';}
    s.scope=target;s.rounds=rounds;s.enabled=true;s.notice='';refresh(pane);scan();
  }
  function element(tag, cls, text) {const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
  function message(role,text,runId) {
    const now=Date.now();return {role,timestamp:now,content:text?[{type:'text',text}]:[],__openclaw:{id:'local-script:'+crypto.randomUUID(),recordTimestampMs:now,runId,runTerminal:role==='assistant'}};
  }
  function send(pane) {
    const s=state(pane);if(!s.enabled||s.phase!=='idle')return;
    const input=s.draft.trim();if(!input)return;
    const round=findMatch(s.rounds,input);
    if(!round){s.notice='未找到匹配脚本。请换个问法，或点铅笔图标添加问题和关键词。';refresh(pane);scan();return;}
    s.notice='';s.draft='';s.runId='local-script-run:'+crypto.randomUUID();
    const token=++s.generation;
    const user=message('user',input,s.runId);
    user.__openclaw={...user.__openclaw,...s.userMeta};
    const reply=message('assistant','',s.runId);
    const analysis=round.analysis || '正在按预设脚本整理回复。';
    reply.content=[{type:'thinking',thinking:analysis}];
    reply.__openclaw.runTerminal=false;
    s.messages=[...s.messages,user,reply];s.phase='thinking';saveHistory(s);refresh(pane,true);
    const valid=()=>s.enabled&&s.generation===token&&s.scope===scope(pane);
    const update=(text,done=false)=>{
      const updated={...reply,content:[{type:'thinking',thinking:analysis},...(text?[{type:'text',text}]:[])],__openclaw:{...reply.__openclaw,runTerminal:done}};
      s.messages=s.messages.map(m=>m.__openclaw.id===reply.__openclaw.id?updated:m);
      refresh(pane);
    };
    s.timer=setTimeout(()=>{
      if(!valid())return;s.phase='typing';
      const chars=Array.from(round.answer);let n=0;
      function tick(){
        if(!valid())return;
        n=Math.min(chars.length,n+Math.max(1,Math.ceil(chars.length/450)));
        const done=n===chars.length;
        if(done){s.phase='idle';s.runId=null;}
        update(chars.slice(0,n).join(''),done);
        if(!done)s.timer=setTimeout(tick,30);else{saveHistory(s);scan();}
      }
      tick();
    },duration(round.answer));
  }
  function editor(pane) {
    if(document.querySelector('.local-script-editor'))return;
    const s=state(pane),dialog=element('dialog','local-script-editor');dialog.setAttribute('aria-labelledby','local-script-title');
    const title=element('h2','','预设对话脚本');title.id='local-script-title';
    const hint=element('p','','保存后点击胶片图标开关模式，在原来的聊天框自由输入问题，自动查找匹配的回复。“关键词：”可选，用 | 分隔多个说法。分析内容由脚本预设。脚本和演示记录保存在本机，不调用模型。');
    const label=element('label','','对话脚本');label.htmlFor='local-script-source';
    const input=element('textarea');input.id='local-script-source';input.spellcheck=false;
    try{input.value=localStorage.getItem(scriptKey)||example;}catch{input.value=example;}
    const error=element('p','local-script-error');error.setAttribute('role','alert');
    const actions=element('div','local-script-actions');
    const cancel=element('button','','取消');cancel.onclick=()=>dialog.close();
    function save(turnOn) {
      try {
        const rounds=parse(input.value);
        if(turnOn && (pane.state?.chatRunId||pane.state?.chatSending))throw Error('当前模型正在回复，请等回复结束后再开启演示。');
        localStorage.setItem(scriptKey,input.value);
        if(turnOn)enable(pane,rounds);else{s.rounds=rounds;refresh(pane);}
        dialog.close();
      }catch(e){error.textContent=e.name==='QuotaExceededError'?'本机存储空间不足，脚本未保存。':e.message;}
    }
    const saveOnly=element('button','','保存脚本');saveOnly.onclick=()=>save(false);
    const saveEnable=element('button','','保存并启用');saveEnable.onclick=()=>save(true);
    actions.append(cancel,saveOnly,saveEnable);dialog.append(title,hint,label,input,error,actions);
    dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  }
  function toggle(pane) {
    const s=state(pane);if(s.enabled){exit(pane);return;}
    try{const text=localStorage.getItem(scriptKey);if(!text){editor(pane);return;}enable(pane,parse(text));}
    catch(e){editor(pane);document.querySelector('.local-script-error').textContent=e.message;}
  }
  function scan() {
    for(const pane of document.querySelectorAll('openclaw-chat-pane')) {
      const s=state(pane);if(s.enabled&&s.scope!==scope(pane)){stop(s);s.enabled=false;s.notice='';refresh(pane);}
      pane.classList.toggle('local-script-active',s.enabled);
      const anchor=pane.querySelector('.agent-chat__input-btn--attach')?.parentElement;
      if(anchor&&!pane.querySelector('.local-script-toggle')) {
        const button=element('button','agent-chat__input-btn local-script-toggle');button.type='button';button.innerHTML=icon;button.onclick=()=>toggle(pane);
        button.oncontextmenu=e=>{e.preventDefault();editor(pane);};anchor.after(button);
      }
      const button=pane.querySelector('.local-script-toggle');
      if(button){button.setAttribute('aria-pressed',String(s.enabled));button.setAttribute('aria-label','脚本演示模式');button.title=s.enabled?'关闭脚本演示（右键编辑脚本）':'开启脚本演示（右键编辑脚本）';
        if(!pane.querySelector('.local-script-edit')){const edit=element('button','agent-chat__input-btn local-script-edit');edit.type='button';edit.innerHTML=editIcon;edit.title='编辑预设对话脚本';edit.setAttribute('aria-label','编辑预设对话脚本');edit.onclick=()=>editor(pane);button.after(edit);}
      }
      const composer=pane.querySelector('textarea[aria-label="Chat composer"]');if(composer)composer.readOnly=false;
      const shell=pane.querySelector('.agent-chat__composer-shell');let status=pane.querySelector('.local-script-status');
      if(s.enabled&&s.notice&&shell){if(!status){status=element('div','local-script-status');status.setAttribute('role','status');shell.before(status);}
        const copy=s.notice;
        if(status.textContent!==copy)status.textContent=copy;
      }else status?.remove();
    }
  }
  const style=element('style');style.textContent=`
.local-script-toggle,.local-script-edit{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex-shrink:0;cursor:pointer}
.local-script-toggle[aria-pressed="true"]{color:#e35d44;background:#e35d441c;border-radius:8px}
.local-script-status{padding:5px 16px;font-size:12px;color:var(--muted,#777)}
.local-script-active .agent-chat__capability-menu,.local-script-active .chat-send-btn--voice,.local-script-active .chat-send-btn--talk-mode,.local-script-active .chat-talk-input-picker__trigger{display:none!important}
.local-script-active .chat-group-rewind,.local-script-active .chat-reply-btn{display:none!important}
.local-script-editor{width:min(700px,90vw);max-height:85vh;overflow:auto;border:1px solid #8885;border-radius:16px;padding:26px;background:var(--bg,#fff);color:var(--text,#222);box-shadow:0 16px 80px #0004}.local-script-editor::backdrop{background:#0006}.local-script-editor h2{margin:0 0 12px;font-size:20px}.local-script-editor p{font-size:13px;line-height:1.6}.local-script-editor label{display:block;margin-bottom:8px}.local-script-editor textarea{box-sizing:border-box;width:100%;min-height:300px;padding:14px;border:1px solid #8886;border-radius:8px;background:transparent;color:inherit;line-height:1.7;resize:vertical}.local-script-actions{display:flex;gap:10px;justify-content:flex-end}.local-script-actions button{padding:8px 12px;border:1px solid #8885;border-radius:8px;background:transparent;color:inherit;cursor:pointer}.local-script-actions button:last-child{background:#ba452e;color:white}.local-script-error{color:#d64530;min-height:20px}
`;document.head.append(style);
  customElements.whenDefined('openclaw-chat-pane').then(()=>{
    const proto=customElements.get('openclaw-chat-pane').prototype,original=proto.renderChatPaneLayout;
    proto.renderChatPaneLayout=function(args){
      const s=state(this);let props=args.chatProps;
      s.userMeta={senderIsOwner:true,senderId:props.userId,senderIdentity:{type:"profile",id:props.userId},senderProfileAvatarUrl:props.userAvatar};
      if(s.enabled&&s.scope===scope(this)) {
        const noop=()=>{};const busy=s.phase!=='idle';
        props={...props,messages:[...props.messages,...s.messages],showThinking:true,selectedSession:{...props.selectedSession,reasoningLevel:"on"},
          toolMessages:[],guardianNotices:[],streamSegments:[],stream:null,streamStartedAt:null,runId:s.runId,
          draft:s.draft,getDraft:()=>s.draft,onDraftChange:text=>{s.draft=typeof text==='string'?text:'';s.notice='';refresh(this);},onSend:()=>send(this),onAbort:()=>{stop(s);refresh(this);scan();},
          sending:busy,runActive:busy,runWorking:busy,canAbort:busy,canSend:!!s.draft.trim()&&!busy,
          submitPending:false,submitDisabledReason:null,modelRequiredReason:null,disabledReason:null,error:null,runError:null,
          onSlashIntent:noop,onSlashCommand:noop,onTypingChange:noop,onHistoryKeydown:noop,onGoalSubmit:noop,onToggleRealtimeTalk:noop,onToggleRealtimeCamera:noop,
          onRefresh:noop,attachments:[],getAttachments:()=>[],getPendingAttachmentReads:()=>0,queue:[],replyTarget:null,onRewindMessage:noop,onForkMessage:noop,onSetReply:noop,onReact:noop};
      }
      return original.call(this,{...args,chatProps:props});
    };
    let queued=false;new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;scan();});}}).observe(document.body,{childList:true,subtree:true});
    scan();
  });
  window.__openclawScriptedChat={parse,duration,findMatch,messages:pane=>{const s=state(pane);return s.enabled&&s.scope===scope(pane)?s.messages:[];}};
})();
