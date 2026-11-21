/* Integration checks against a real, isolated headless Chrome. No npm dependencies. */
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'.qa');
fs.mkdirSync(qa,{recursive:true});
const chromePath=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(x=>fs.existsSync(x));
if(!chromePath)throw new Error('Set CHROME_PATH to Chrome or Edge.');
const server=spawn(process.execPath,['server.cjs'],{cwd:root,env:{...process.env,PORT:'3107'},windowsHide:true,stdio:'ignore'});
const browser=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--remote-debugging-port=9224',`--user-data-dir=${path.join(qa,'browser-profile')}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore',fs.openSync(path.join(qa,'browser.log'),'a')]});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0,requests=new Map(),errors=[];
function call(method,params={}){return new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{requests.delete(key);reject(new Error('CDP timeout: '+method));},12000);requests.set(key,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+': '+JSON.stringify(r.exceptionDetails.exception));return r.result.value;}
const click=selector=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing element: '+${JSON.stringify(selector)});if(e.disabled)throw new Error('Disabled element: '+${JSON.stringify(selector)});e.click();return true;})()`);
const input=(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const action=name=>click(`[data-action="${name}"]`);
const state=()=>evaluate("JSON.parse(localStorage.getItem('lingo.progress.v1'))");
async function waitFor(url){for(let i=0;i<60;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});if(r.ok)return r;}catch{}await sleep(200);}throw new Error('Not ready: '+url);}
async function reload(clear=false){if(clear)await call('Storage.clearDataForOrigin',{origin:'http://localhost:3107',storageTypes:'local_storage'});await call('Page.navigate',{url:'http://localhost:3107'});for(let i=0;i<60;i++){await sleep(100);if(await evaluate("document.readyState==='complete'&&!!document.querySelector('#app h1')"))return;}throw new Error('Page did not render');}
async function screenshot(name,width=1440,height=1050){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await sleep(850);const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(qa,name+'.png'),Buffer.from(shot.data,'base64'));assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'Horizontal overflow: '+name);}
const mockSpeech=`Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>['en-GB','zh-CN','ru-RU','uz-UZ','ko-KR','uk-UA'].map(lang=>({lang})),cancel(){},speak(u){u.onstart?.();u.onend?.();}}});window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};window.SpeechRecognition=class {start(){setTimeout(()=>{this.onresult?.({results:[Object.assign([{transcript:window.__spoken||''}],{isFinal:true})]});this.onend?.();},5);}abort(){}stop(){this.onend?.();}};`;
async function initialFlow(native,target,name='Амина'){await action('start');await click(`[data-action="native"][data-lang="${native}"]`);await action('flow-next');await input('#name-input',name);await evaluate("document.querySelector('#name-form').requestSubmit()");await click(`[data-action="target"][data-lang="${target}"]`);await action('flow-next');}
async function finishPlan(capture=false){await action('flow-next');if(capture)await screenshot('schedule-mobile',390,844);await action('flow-next');if(capture)await screenshot('plan-mobile',390,844);await action('finish-onboarding');assert.equal(await evaluate("!!document.querySelector('.dashboard-page')"),true);}
async function solveQuestion(q,target,correct=true){if(q.skill==='reading'||q.skill==='listening'){if(q.skill==='listening')await action('listen');const selector=correct?`[data-action="answer"][data-id="${q.id}"]`:await evaluate(`'[data-action="answer"][data-id="'+[...document.querySelectorAll('[data-action="answer"]')].find(e=>e.dataset.id!==${JSON.stringify(q.id)}).dataset.id+'"]'`);await click(selector);}else if(q.skill==='speaking'){await evaluate(`window.__spoken=${JSON.stringify(correct?q.text:'incorrect')}`);await action('record');await sleep(30);}else await input('#answer-input',correct?q.text:'incorrect');await action('check-answer');await action('next-question');}
(async()=>{try{
  await waitFor('http://localhost:3107');
  const targets=await (await waitFor('http://127.0.0.1:9224/json/list')).json();
  ws=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{const msg=JSON.parse(event.data);if(process.env.DEBUG_CDP)console.log('CDP',event.data.slice(0,200));if(msg.id&&requests.has(msg.id)){const p=requests.get(msg.id);requests.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);}if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails);};
  await call('Page.enable');await call('Runtime.enable');await reload(true);
  await screenshot('welcome-desktop');await screenshot('welcome-mobile',390,844);await screenshot('welcome-small',320,760);
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await sleep(80);
  assert.equal(await evaluate("[...document.querySelectorAll('.language-card')].every(e=>getComputedStyle(e).opacity==='1')"),true,'Reduced motion keeps all languages visible');
  assert.equal(await evaluate("document.getAnimations().filter(a=>a.playState==='running').length"),0,'Reduced motion stops decorative animations');
  assert.equal(await evaluate("document.querySelectorAll('.fx-confetti,.fx-tap').length"),0);
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  if(process.argv.includes('--ui')) {
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.is-welcome .sidebar')).display"),'none');
    await click('[data-action="scroll-section"][data-section="languages-section"]');await sleep(800);
    assert.equal(await evaluate("document.querySelector('#languages-section').getBoundingClientRect().top<180"),true,'Catalog navigation scrolls to languages');
    await action('home');await sleep(80);assert.equal(await evaluate('scrollY'),0,'Logo returns to the beginning');
    const greeting=await evaluate("document.querySelector('[data-orbit-greeting]').textContent");await sleep(5000);
    assert.notEqual(await evaluate("document.querySelector('[data-orbit-greeting]').textContent"),greeting,'Hero cycles supported greetings');
    await evaluate(mockSpeech);await initialFlow('ru','en');await action('skip-test');await screenshot('schedule-mobile',390,844);await action('flow-next');await screenshot('plan-mobile',390,844);await action('finish-onboarding');
    await action('next-lesson');await action('begin-exercises');
    const lesson=await evaluate("Array.from({length:8},(_,i)=>({skill:['reading','listening','writing','speaking'][i%4],...LingoData.phrases.filter(p=>p.unit===0)[i%6]}))");
    for(const q of lesson)await solveQuestion({...q,text:q.en},'en');
    await sleep(320);await screenshot('lesson-celebration',390,844);await action('lesson-home');
    await screenshot('profile-desktop',1440,1050);await screenshot('profile-mobile',390,844);await screenshot('profile-small',320,760);
    await click('[data-action="nav"][data-view="practice"]');await screenshot('practice-mobile',390,844);
    await click('[data-action="nav"][data-view="dictionary"]');await screenshot('dictionary-mobile',390,844);
    assert.deepEqual(errors,[],'Browser runtime errors');console.log('PASS redesigned navigation, rotating greetings, onboarding, schedule, lesson effects, dashboard at 320–1440px, practice and vocabulary.');return;
  }
  const locales=await evaluate('Object.keys(LingoData.ui)');
  for(const native of locales){await action('locale');await click(`[data-action="set-locale"][data-lang="${native}"]`);assert.equal(await evaluate('document.documentElement.lang'),native);await screenshot('welcome-'+native,390,844);}
  await reload(true);
  const combinations=[['ru','en'],['en','zh'],['uz','ru'],['uk','uz'],['zh','ko'],['ko','uk']];
  for(const [native,target] of combinations){await reload(true);await evaluate(mockSpeech);await initialFlow(native,target);if(native==='ru'){await screenshot('onboarding-intro-desktop',1440,1050);await screenshot('onboarding-intro-mobile',390,844);}await action('start-test');
    const questions=await evaluate(`Array.from({length:5},(_,i)=>Object.entries(LingoData.placementIds).map(([skill,ids])=>({skill,id:ids[i],text:LingoData.phrases.find(p=>p.id===ids[i])[${JSON.stringify(target)}]}))).flat()`);
    for(let i=0;i<questions.length;i++){if(native==='ru'&&i<4)await screenshot('placement-'+questions[i].skill,390,844);await solveQuestion(questions[i],target);if(i===3){const stored=await state();assert.equal(stored.draft.index,4);await reload();await evaluate(mockSpeech);assert.equal(await evaluate("document.querySelector('.exercise-header>span').textContent"),'5 / 20');}}
    let stored=await state();assert.equal(stored.draft.level,'B2',target+' level');assert.deepEqual(Object.values(stored.draft.scores),[100,100,100,100]);
    await finishPlan(native==='ru');stored=await state();assert.equal(stored.target,target);assert.equal(stored.courses[target].startAt,8);
    assert.equal(await evaluate("document.querySelector('.unit-header h3').textContent"),await evaluate("LingoData.units[8][document.documentElement.lang]"));await screenshot('profile-'+target,390,844);
    await action('next-lesson');assert.equal(await evaluate("!!document.querySelector('.study-words')"),true);await action('begin-exercises');
    const lesson=await evaluate(`Array.from({length:8},(_,i)=>({skill:['reading','listening','writing','speaking'][i%4],...LingoData.phrases.filter(p=>p.unit===8)[i%6]}))`);
    for(const q of lesson)await solveQuestion({...q,text:q[target]},target);
    if(native==='ru'){await sleep(320);assert.equal(await evaluate("document.querySelectorAll('.fx-confetti').length>0"),true,'Successful lesson celebrates');await screenshot('lesson-celebration',390,844);}stored=await state();assert.equal(stored.courses[target].completed.includes(32),true);assert.equal(stored.courses[target].xp,36);assert.equal(stored.courses[target].learned.length,6);
    await action('lesson-home');await sleep(40);assert.equal(await evaluate("document.querySelectorAll('.fx-confetti').length"),0,'Leaving the result clears particles');await reload();stored=await state();assert.equal(stored.courses[target].completed.length,1);
    console.log('PASS full flow, placement, lesson and persistence:',native,'→',target);
  }
  // Real-browser fallback paths, wrong answers, dictionary and settings.
  await reload(true);await initialFlow('ru','en','<Амина>');await action('start-test');await action('skip-answer');
  assert.equal((await state()).draft.answers[0].correct,false);await reload();assert.equal(await evaluate("document.querySelector('.exercise-header>span').textContent"),'2 / 20');
  await evaluate("void Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[],cancel(){}}})");await action('listen');assert.equal(await evaluate("!!document.querySelector('[data-action=\"reveal-audio\"]')"),true);await action('reveal-audio');await click('[data-action="answer"][data-id="thankYou"]');await action('check-answer');assert.equal((await state()).draft.answers[1].verified,false);await action('next-question');
  await input('#answer-input','incorrect');await action('check-answer');await action('next-question');await action('manual');await input('#answer-input','Hello');await action('check-answer');assert.equal((await state()).draft.answers[3].verified,false);await action('next-question');
  await action('exit-exercise');assert.equal(await evaluate("!!document.querySelector('[data-action=\"resume-flow\"]')"),true);await action('resume-flow');assert.equal(await evaluate("document.querySelector('.exercise-header>span').textContent"),'5 / 20');
  for(let i=4;i<20;i++){await action('skip-answer');await action('next-question');}assert.equal((await state()).draft.level,'A1');await finishPlan();
  assert.equal(await evaluate("document.querySelector('.page-heading h1').textContent.includes('<Амина>')"),true);
  await screenshot('profile-desktop',1440,1050);await screenshot('profile-mobile',390,844);
  await click('[data-action="nav"][data-view="dictionary"]');await action('all-words');await input('#word-search','Hello');assert.equal(await evaluate("document.querySelectorAll('.word-card').length"),1);await action('bookmark');assert.deepEqual((await state()).courses.en.saved,['hello']);await click('[data-action="dictionary-tab"][data-tab="saved"]');assert.equal(await evaluate("document.querySelectorAll('.word-card').length"),1);
  await click('[data-action="nav"][data-view="progress"]');await screenshot('progress-mobile',390,844);
  await action('edit-schedule').catch(async()=>{await click('[data-action="nav"][data-view="settings"]');await action('edit-schedule');});await click('[data-action="frequency"][data-value="5"]');await click('[data-action="minutes"][data-value="20"]');await action('save-schedule');assert.equal((await state()).courses.en.days.length,5);assert.equal((await state()).courses.en.minutes,20);
  await action('courses');await action('add-course');await click('[data-action="target"][data-lang="zh"]');await action('flow-next');await action('skip-test');await action('flow-next');await action('finish-onboarding');assert.equal(Object.keys((await state()).courses).length,2);await action('courses');await click('[data-action="switch-course"][data-lang="en"]');assert.equal((await state()).target,'en');
  await action('next-lesson');await action('begin-exercises');for(let i=0;i<8;i++){await action('skip-answer');await action('next-question');}assert.equal((await state()).courses.en.completed.length,0);await screenshot('lesson-failed-mobile',390,844);await action('lesson-home');
  await action('next-lesson');await action('begin-exercises');await action('exit-exercise');await action('confirm-exit');assert.equal(await evaluate("!!document.querySelector('.dashboard-page')"),true);
  const content=await evaluate("({phrases:LingoData.phrases.length,units:LingoData.units.length,missing:LingoData.phrases.flatMap(p=>LingoData.order.filter(l=>!p[l]))})");assert.equal(content.phrases,60);assert.equal(content.units,10);assert.deepEqual(content.missing,[]);
  await reload(true);await click('[data-action="welcome-language"][data-lang="ru"]');await action('flow-next');await input('#name-input','?????');await evaluate("document.querySelector('#name-form').requestSubmit()");assert.equal(await evaluate("document.querySelector('[data-action=\"flow-next\"]').disabled"),true,'Native and target language must differ');assert.deepEqual(errors,[],'Browser runtime errors');console.log('PASS fallback speech, test resume, wrong answers, dictionary, schedule, multiple courses, locked progression, escaping and responsive layouts.');console.log('Screenshots: '+qa);
}catch(error){console.error(error);process.exitCode=1;}finally{try{if(ws?.readyState===1)await Promise.race([call('Browser.close'),sleep(1000)]);}catch{}ws?.close();browser.kill();server.kill();}})().catch(error=>{console.error(error);process.exitCode=1;});
