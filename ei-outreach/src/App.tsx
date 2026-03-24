import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

const PROSPECT_STATUSES=["Not Contacted","No Answer","Left Voicemail","Gatekeeper","Connected","Interested","Call Back Later","Send Info Requested","Reply Detected","Meeting Booked","Not Interested","Do Not Contact","Converted to Customer","Wrong Number"];
const CRM_STATUSES=["New","Contacted","Meaningful Convo","Demo Scheduled","Proposal","Closed Won","Not Interested"];
const CRM_STATUS_COLORS={"New":"#60a5fa","Contacted":"#a78bfa","Meaningful Convo":"#fbbf24","Demo Scheduled":"#f97316","Proposal":"#4ade80","Closed Won":"#10b981","Not Interested":"#64748b"};
const AGENCY_TYPES=["EI","CPSE","ABA","Home Care","Service Coord"];
const COMPETITOR_LIST=["Swalby","McGuinness","Myeline","Manual","Unknown"];
const CRM_KEYS={crm:"ei_crm_v1"};
const SUPABASE_URL="https://ehsfbiqdfeglviwcllxm.supabase.co";
const SUPABASE_KEY="sb_publishable_0ULP0QlthCn5LasXNgw_CQ_Yzi7_85v";
const sbFetch=async(path:string,opts:RequestInit={})=>{
  const res=await fetch(SUPABASE_URL+"/rest/v1/"+path,{...opts,headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY,"Content-Type":"application/json","Prefer":"return=representation",...(opts.headers||{})}});
  if(!res.ok){const e=await res.text();throw new Error(e);}
  const txt=await res.text();return txt?JSON.parse(txt):[];
};
// Map camelCase <-> snake_case for Supabase
const toRow=(r:any)=>({id:r.id,agency_name:r.agencyName||"",contact_name:r.contactName||"",contact_title:r.contactTitle||"",phone:r.phone||"",email:r.email||"",agency_type:r.agencyType||"",competitor:r.competitor||"",competitor_custom:r.competitorCustom||"",crm_status:r.crmStatus||"New",last_contact:r.lastContact||null,next_followup:r.nextFollowup||null,notes:r.notes||"",created_at:r.createdAt||null});
const fromRow=(r:any)=>({id:r.id,agencyName:r.agency_name||"",contactName:r.contact_name||"",contactTitle:r.contact_title||"",phone:r.phone||"",email:r.email||"",agencyType:r.agency_type||"",competitor:r.competitor||"",competitorCustom:r.competitor_custom||"",crmStatus:r.crm_status||"New",lastContact:r.last_contact||"",nextFollowup:r.next_followup||"",notes:r.notes||"",createdAt:r.created_at||""});
const STEP_TYPES=[{key:"call",label:"Call",icon:"📞",color:"#f97316"},{key:"email",label:"Email",icon:"✉️",color:"#38bdf8"},{key:"linkedin",label:"LinkedIn",icon:"🔗",color:"#60a5fa"},{key:"research",label:"Research",icon:"🔍",color:"#fbbf24"},{key:"task",label:"Manual Task",icon:"✅",color:"#4ade80"},{key:"wait",label:"Wait",icon:"⏳",color:"#64748b"},{key:"sms",label:"SMS",icon:"💬",color:"#a78bfa"}];
const STM=Object.fromEntries(STEP_TYPES.map(t=>[t.key,t]));
const SEQ_COLORS=["#3b82f6","#8b5cf6","#ef4444","#10b981","#f59e0b","#06b6d4","#f97316","#64748b"];
const ENR_STATUSES=["pending","active","paused","failed","finished","removed"];
const STOP_STATUSES=new Set(["Not Interested","Do Not Contact","Reply Detected","Meeting Booked","Converted to Customer"]);
const DEFAULT_WH={days:[1,2,3,4,5],startHour:9,endHour:17};
const ACT_ICON={task_created:"📋",task_completed:"✅",task_skipped:"⏭",task_retried:"↺",step_advanced:"➡️",disposition_logged:"🎯",sequence_started:"🚀",sequence_paused:"⏸",sequence_resumed:"▶️",sequence_failed:"❌",sequence_finished:"🏁",sequence_removed:"🚫",rule_triggered:"⚡",bulk_enrolled:"📦",enrolled:"🚀",note:"📝",status_change:"🔄",retried:"🔄",call_logged:"📞"};
const RULE_TRIGGERS=[{key:"reply",label:"Reply Detected",icon:"💬"},{key:"meeting",label:"Meeting Booked",icon:"📅"},{key:"overdue",label:"Task Overdue (days)",icon:"⏰",hasValue:true},{key:"finished",label:"Sequence Finished",icon:"🏁"}];
const RULE_ACTIONS=[{key:"stop",label:"Stop Sequence"},{key:"pause",label:"Pause Enrollment"},{key:"move_seq",label:"Enroll in Sequence",hasTarget:true},{key:"mark_status",label:"Set Prospect Status",hasTarget:true}];

const DISPOSITIONS=[
  {key:"connected",label:"Connected",icon:"✅",color:"#4ade80",action:"advance"},
  {key:"left_vm",label:"Left Voicemail",icon:"📞",color:"#94a3b8",action:"advance"},
  {key:"no_answer",label:"No Answer",icon:"📵",color:"#64748b",action:"advance"},
  {key:"callback",label:"Callback Requested",icon:"🔁",color:"#60a5fa",action:"retry"},
  {key:"try_later",label:"Try Again Later",icon:"⏰",color:"#fbbf24",action:"retry"},
  {key:"sent_info",label:"Sent Info",icon:"📨",color:"#38bdf8",action:"advance"},
  {key:"meeting_booked",label:"Meeting Booked",icon:"📅",color:"#a78bfa",action:"finish"},
  {key:"not_interested",label:"Not Interested",icon:"🚫",color:"#f87171",action:"finish"},
  {key:"bad_contact",label:"Bad Contact",icon:"❌",color:"#ef4444",action:"finish"},
  {key:"converted",label:"Converted",icon:"🏆",color:"#fbbf24",action:"advance"},
  {key:"gatekeeper",label:"Gatekeeper",icon:"🔐",color:"#fb923c",action:"advance"},
  {key:"email_replied",label:"Email Replied",icon:"💬",color:"#4ade80",action:"advance"},
  {key:"email_sent",label:"Email Sent",icon:"✉️",color:"#38bdf8",action:"advance"},
  {key:"other",label:"Other / Note",icon:"📝",color:"#94a3b8",action:"advance"},
];
const DISP_MAP=Object.fromEntries(DISPOSITIONS.map(d=>[d.key,d]));
const DISP_GROUPS=[
  {label:"Advances sequence",keys:["connected","left_vm","no_answer","gatekeeper","sent_info","email_sent","email_replied","converted","other"]},
  {label:"Retries same step 1d",keys:["callback","try_later"]},
  {label:"Finishes sequence",keys:["meeting_booked","not_interested","bad_contact"]},
];
const ACTION_LABELS={advance:{label:"Advances sequence",color:"#4ade80",icon:">"},retry:{label:"Retries step in 1d",color:"#fbbf24",icon:"↺"},finish:{label:"Finishes sequence",color:"#a78bfa",icon:"🏁"}};
const DISP_TO_STATUS={meeting_booked:"Meeting Booked",not_interested:"Not Interested",bad_contact:"Wrong Number",converted:"Converted to Customer",connected:"Connected"};

const BUILTIN=[
  {name:"High Priority",color:"#ef4444",reengageDelay:21,steps:[
    {day:1,type:"call",label:"Intro Call",script:"I saw your program came up as a strong fit - quick question, how are you currently handling session notes and billing documentation for your EI caseload?"},
    {day:1,type:"email",label:"Same-Day Email",script:"Sending a quick note after our call - ProviderSoft was built specifically for EI programs handling session notes, IFSP docs, and state reporting."},
    {day:2,type:"call",label:"Follow-Up Call",script:"Wanted to follow up while it was still fresh - do you have 15 minutes this week to walk through how we've helped programs like yours cut documentation time?"},
    {day:2,type:"linkedin",label:"LinkedIn Connect",script:"Connecting here as well - I work specifically with EI programs on documentation and billing workflow."},
    {day:3,type:"call",label:"Pain-Point Call",script:"I've been hearing from a lot of EI directors that session note backlogs and billing delays are getting worse - is that something you're running into right now?"},
    {day:3,type:"email",label:"Case Study Email",script:"One program we work with reduced documentation time by over 30% after switching - wanted to share that in case it's useful context for your team."},
    {day:5,type:"call",label:"Decision Maker Call",script:"Wanted to make sure I'm talking to the right person - is the decision around clinical documentation software something you own, or would your clinical director be involved?"},
    {day:6,type:"email",label:"Compliance Email",script:"With regulation changes hitting EI programs this year, a lot of agencies are looking at whether their current system can keep up - happy to walk through how ProviderSoft handles that."},
    {day:8,type:"call",label:"IFSP Workflow Call",script:"Specifically wanted to ask about IFSP documentation - is that something your coordinators are managing manually right now, or do you have a system handling it?"},
    {day:9,type:"email",label:"ROI Email",script:"For a program your size, the time savings usually show up in billing turnaround and coordinator hours - I can put together a quick estimate if that would help."},
    {day:11,type:"call",label:"Final Push Call",script:"Last attempt before I give you some space - if timing isn't right I totally understand, just didn't want to disappear without checking one more time."},
    {day:12,type:"email",label:"Breakup Email",script:"I'll stop reaching out for now, but if session notes, billing, or state reporting ever becomes a priority I'd love to reconnect - no pressure at all."},
  ]},
  {name:"Standard Balanced",color:"#3b82f6",reengageDelay:30,steps:[
    {day:1,type:"call",label:"Intro Call",script:"Hi, I work with EI programs on documentation and billing software - quick question, how are you currently managing session notes and state reporting for your caseload?"},
    {day:2,type:"email",label:"Intro Email",script:"Thanks for your time - ProviderSoft helps EI agencies streamline session notes, IFSP docs, billing, and compliance tracking in one place."},
    {day:4,type:"call",label:"Session Note Call",script:"I've been hearing from programs that session note documentation has been taking more time with caseload increases - curious how your team is handling that."},
    {day:6,type:"linkedin",label:"LinkedIn Connect",script:"Reaching out here as well - I focus specifically on EI program documentation workflow and would enjoy connecting."},
    {day:8,type:"email",label:"Value Email",script:"One thing I hear a lot from EI coordinators is that billing and documentation are eating into direct service time - wanted to share how a few programs have fixed that."},
    {day:10,type:"call",label:"Caseload Follow-Up",script:"Wanted to check in on the caseload side - are staffing or documentation pressures something you're navigating right now?"},
    {day:12,type:"email",label:"Documentation Email",script:"Happy to send over a quick overview of how ProviderSoft handles IFSP documentation, progress notes, and state reporting if that would be helpful."},
    {day:15,type:"call",label:"Director Follow-Up",script:"Wanted to make sure this got to the right person - is program documentation something you oversee directly or would someone else be the right contact?"},
    {day:17,type:"email",label:"Case Study Email",script:"A program similar to yours recently cut their documentation backlog significantly after switching to ProviderSoft - thought it might be worth sharing."},
    {day:20,type:"call",label:"Billing Question",script:"Quick question on the billing side - are you currently using a separate system for billing, or is that tied into your documentation workflow?"},
    {day:23,type:"email",label:"Regulation Email",script:"With EI regulation updates this year, a few programs have reached out around compliance tracking - wanted to flag that in case it's relevant."},
    {day:26,type:"call",label:"Check-In Call",script:"Last check-in from me for now - if there's a better time to revisit this later in the year I'm happy to do that, just let me know."},
    {day:28,type:"email",label:"Breakup Email",script:"I'll give you some space for now - if documentation, billing, or compliance tracking ever becomes a bigger priority, I'd love to reconnect whenever the timing is right."},
  ]},
  {name:"Soft Touch",color:"#10b981",reengageDelay:45,steps:[
    {day:1,type:"email",label:"Intro Email",script:"Hi, I work with EI programs on documentation and billing workflow software - not sure if the timing is right, but wanted to introduce myself and ProviderSoft in case it's ever useful."},
    {day:4,type:"linkedin",label:"LinkedIn Connect",script:"Connecting here as well - I focus on EI program operations and documentation, happy to be a resource whenever it makes sense."},
    {day:7,type:"email",label:"Value Email",script:"One thing that comes up a lot with EI programs is the gap between session documentation and billing timelines - wanted to share how a few agencies have simplified that."},
    {day:12,type:"call",label:"Soft Intro Call",script:"I sent a note a couple weeks back - no urgency at all, just wanted to put a voice to the email and see if documentation or billing workflow is something on your radar."},
    {day:16,type:"email",label:"Staffing Email",script:"With staffing shortages in EI right now, I know a lot of programs are leaning harder on whoever is left - ProviderSoft was designed to reduce the admin load on coordinators and therapists."},
    {day:21,type:"call",label:"Regulation Check-In",script:"Wanted to check in around regulation changes this year - are any of the recent EI documentation updates creating extra work for your team?"},
    {day:26,type:"email",label:"Case Study Email",script:"Happy to share a quick example of how a program similar to yours used ProviderSoft to get ahead of compliance changes - no pressure, just wanted to leave it available if helpful."},
    {day:32,type:"call",label:"Caseload Call",script:"Quick check-in - caseloads have been growing for a lot of EI programs this year, just wanted to see how things are going on your end."},
    {day:38,type:"email",label:"IFSP Email",script:"One area where programs tend to see the biggest time savings is IFSP documentation - wanted to share a quick overview if that's a pain point for your coordinators."},
    {day:45,type:"call",label:"Value Touch Call",script:"Just a light check-in - not trying to push anything, genuinely wanted to see if anything has changed on the documentation or billing side since we last connected."},
    {day:52,type:"email",label:"Send Overview",script:"Sending a short overview of ProviderSoft in case it's useful for a future conversation - happy to walk through it live whenever the timing works for you."},
    {day:60,type:"call",label:"Final Check-In",script:"Last check-in from me - if now isn't the right time I completely understand, just didn't want to disappear without saying so."},
    {day:62,type:"email",label:"Breakup Email",script:"I'll stop reaching out for now - if session notes, billing, or compliance ever becomes a bigger priority, please don't hesitate to reach back out."},
  ]},
  {name:"Re-Engagement",color:"#f59e0b",reengageDelay:60,steps:[
    {day:1,type:"email",label:"Re-Touch Email",script:"It's been a little while since we connected - wanted to check back in and see if anything has changed on the documentation or billing side for your program."},
    {day:5,type:"call",label:"Re-Engagement Call",script:"I know we spoke a while back and the timing wasn't right - just wanted to see if anything has shifted since then, no pressure either way."},
    {day:10,type:"email",label:"Regulation Update",script:"There have been a few EI regulation updates since we last talked - wanted to flag that in case any of them have created extra work for your team."},
    {day:18,type:"call",label:"Caseload Check-In",script:"Quick question - have caseloads or staffing changed for your program since we last connected? A lot of agencies have been navigating that this year."},
    {day:25,type:"email",label:"Case Study Email",script:"Wanted to share a quick story from a program we've been working with - they came back after a year and said the timing finally made sense."},
    {day:35,type:"call",label:"Value Touch Call",script:"Just a light check-in - I've been working with a few more EI programs in your area and wanted to stay on your radar without being a nuisance."},
    {day:45,type:"email",label:"IFSP Reminder",script:"If IFSP documentation or state reporting is something that's come up recently, I'd love to show you how ProviderSoft handles that - takes about 20 minutes to walk through."},
    {day:55,type:"call",label:"Billing Follow-Up",script:"Wanted to ask specifically about billing - are you still managing that in a separate system, or has anything changed on that side?"},
    {day:65,type:"email",label:"Staffing Email",script:"Staffing has been a recurring theme for EI programs this year - ProviderSoft tends to help most on the admin side so coordinators can focus more on service delivery."},
    {day:78,type:"call",label:"Last Attempt Call",script:"This is my last check-in for a while - if the timing has been off, I get it completely, just wanted to give it one more try before I give you some space."},
    {day:80,type:"email",label:"Breakup Email",script:"I'll stop reaching out after this one - if ProviderSoft ever becomes relevant for your program's documentation, billing, or compliance needs, I hope you'll think of us."},
  ]},
  {name:"Future Follow-Up",color:"#64748b",reengageDelay:90,steps:[
    {day:1,type:"email",label:"Holding Pattern Note",script:"No action needed - just wanted to send a quick note so I'm easy to find when the time is right."},
    {day:30,type:"call",label:"30-Day Check-In",script:"Checking back in as promised - just wanted to see if anything has changed on your end, no pressure at all."},
    {day:35,type:"email",label:"Regulation Update",script:"There have been a couple EI documentation and compliance updates I thought might be worth flagging."},
    {day:60,type:"call",label:"60-Day Call",script:"Just a light check-in around the timeline we discussed - are things starting to line up, or would a little more time be helpful?"},
    {day:65,type:"email",label:"Case Study Email",script:"Wanted to share a quick example from a program that was in a similar holding pattern - when the timing opened up, the switch was pretty smooth."},
    {day:90,type:"call",label:"Quarterly Check-In",script:"Checking back in at the quarterly mark - is the timing starting to feel more realistic, or are there still things that need to settle first?"},
    {day:95,type:"email",label:"Value Email",script:"Still happy to be a resource whenever it makes sense - ProviderSoft handles session notes, IFSP docs, billing, and state reporting for EI programs."},
    {day:120,type:"call",label:"120-Day Call",script:"Another light check-in - I know these things move on their own timeline, just want to make sure I'm easy to reach when it makes sense to revisit."},
    {day:130,type:"email",label:"Send Overview",script:"Sending a short overview so you have it on file - no need to do anything with it now, just wanted it to be there when the timing is right."},
    {day:150,type:"call",label:"Final Check-In",script:"Last check-in from me before I give you more space - if the timeline has shifted or things are starting to open up, I'd love to reconnect."},
    {day:155,type:"email",label:"Breakup Email",script:"I'll step back for now and leave the door open - whenever documentation, billing, or compliance becomes a priority, I hope you'll reach out."},
  ]},
];

const uid=()=>Math.random().toString(36).slice(2,9);
const nowISO=()=>new Date().toISOString();
const today=()=>new Date().toISOString().split("T")[0];
const fmtDT=iso=>iso?new Date(iso).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"-";
const fmtD=iso=>iso?new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"-";
const dayDiff=(a,b=today())=>Math.round((new Date(b)-new Date(a))/864e5);
const sortAZ=arr=>[...arr].sort((a,b)=>(a.name||"").localeCompare(b.name||""));
const pct=(n,d)=>d?Math.round(n/d*100):0;

// -- SCHEDULING HELPERS --------------------------------------------------------

// Default scheduled datetime: tomorrow at 9:00 AM local
function defaultScheduledISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

// Resolve the first-step nextRunAt from a scheduledStartISO (or now)
// scheduledStartISO: full ISO string (or null = start now)
// stepDelayDays: the first step's delayDays (0 = same moment as start, >0 = offset)
function resolveFirstNextRunAt(scheduledStartISO, stepDelayDays) {
  const base = scheduledStartISO ? new Date(scheduledStartISO) : new Date();
  if ((stepDelayDays || 0) > 0) {
    base.setDate(base.getDate() + stepDelayDays);
    base.setSeconds(0, 0);
  }
  return base.toISOString();
}

function nextWorkingTime(date,wh=DEFAULT_WH){
  const d=new Date(date);
  for(let i=0;i<14;i++){const dow=d.getDay(),h=d.getHours();if(wh.days.includes(dow)){if(h<wh.startHour){d.setHours(wh.startHour,0,0,0);return d;}if(h<wh.endHour)return d;}d.setDate(d.getDate()+1);d.setHours(wh.startHour,0,0,0);}return d;
}
function calcNextStepDate(fromISO,delayDays,wh=DEFAULT_WH){
  // delayDays=0 means "immediately" - return the from time as-is so tickEnrollment fires right away
  if((delayDays??1)===0)return fromISO||nowISO();
  const base=new Date(fromISO||nowISO());base.setDate(base.getDate()+Math.max(1,delayDays??1));base.setHours(wh.startHour,0,0,0);return nextWorkingTime(base,wh).toISOString();
}
function bsToSteps(s){return s.map((x,i,a)=>({...x,id:"s"+uid(),delayDays:i===0?0:Math.max(0,(x.day||1)-(a[i-1]?.day||0))}));}
function computeDays(steps){let c=0;return steps.map(s=>({...s,day:(c+=s.delayDays||1)}));}
const seqToStore=bi=>({id:bi.name,name:bi.name,color:bi.color,reengageDelay:bi.reengageDelay,active:true,builtIn:true,createdAt:today(),version:1,steps:bsToSteps(bi.steps),rulesets:[]});
const mkStep=(type="call",delayDays=1)=>({id:"s"+uid(),type,delayDays,label:STM[type]?.label||"Step",script:""});
const mkSeq=(name="New Sequence")=>({id:uid(),name,color:SEQ_COLORS[Math.floor(Math.random()*SEQ_COLORS.length)],reengageDelay:30,active:true,builtIn:false,createdAt:today(),version:1,steps:[mkStep("call",1)],rulesets:[]});
const mkP=f=>({id:uid(),...f,prospectStatus:"Not Contacted",priority:"Normal",tags:[],notes:"",callLog:[],createdAt:today()});
const BLANK={name:"",city:"",state:"PA",contact:"",title:"",phone:"",email:"",sequenceName:""};

// -- ENROLLMENT FACTORY --------------------------------------------------------
// scheduledStartISO: ISO string for scheduled start, null = start now
function createEnrollment(prospectId, seqId, seqVersion, seqSteps, wh, source="single", startStep=0, scheduledStartISO=null) {
  if (!seqSteps?.length) return null;
  const now = nowISO();
  const firstStep = seqSteps[startStep || 0];
  const firstDelay = firstStep?.delayDays || 0;

  // KEY CHANGE: nextRunAt is driven by scheduledStartISO + first step delay
  const nextRunAt = resolveFirstNextRunAt(scheduledStartISO, firstDelay);

  return {
    id: uid(),
    prospectId,
    sequenceId: seqId,
    sequenceVersion: seqVersion || 1,
    stepIndex: startStep || 0,
    lastCompletedAt: now,
    nextRunAt,                          // < datetime-precise eligibility
    scheduledStartAt: scheduledStartISO || null,  // null = started immediately, no schedule
    status: "active",
    pendingTask: null,
    exitReason: null,
    retryCount: 0,
    enrolledAt: now,
    finishedAt: null,
    source,
    pausedAt: null,
    lastTouchStepId: null,
    lastTouchStepLabel: null,
    lastTouchAt: null,
    lastDisposition: null,
    lastDispositionAt: null,
    lastDispositionNote: null,
  };
}

function tickEnrollment(enr,prospectStatus,seqSteps,wh){
  if(enr.status==="paused"||enr.status!=="active")return null;
  if(STOP_STATUSES.has(prospectStatus))return{updatedEnrollment:{...enr,status:"removed",exitReason:"Status: "+prospectStatus,finishedAt:nowISO(),pendingTask:null},activity:{type:"sequence_removed",text:"Stopped - "+prospectStatus,meta:{seqId:enr.sequenceId}}};
  const step=seqSteps[enr.stepIndex];
  if(!step)return{updatedEnrollment:{...enr,status:"finished",exitReason:"Sequence complete",finishedAt:nowISO()},activity:{type:"sequence_finished",text:"Sequence completed",meta:{seqId:enr.sequenceId}}};
  if(new Date(enr.nextRunAt)>new Date())return null;  // datetime gate - unchanged
  const task={id:uid(),enrollmentId:enr.id,prospectId:enr.prospectId,sequenceId:enr.sequenceId,sequenceVersion:enr.sequenceVersion,stepIndex:enr.stepIndex,stepId:step.id,stepType:step.type,stepLabel:step.label,script:step.script||"",dueAt:enr.nextRunAt,createdAt:nowISO(),completedAt:null,status:"pending",retryCount:0};
  return{updatedEnrollment:{...enr,status:"paused",pendingTask:task,lastTouchStepId:step.id,lastTouchStepLabel:step.label,lastTouchAt:nowISO()},activity:{type:"task_created",text:"Task created: "+step.label,meta:{seqId:enr.sequenceId,stepIndex:enr.stepIndex,stepType:step.type,stepId:step.id}}};
}

function resolveWithDisposition(enr,task,seqSteps,wh,dispKey,note){
  const disp=DISP_MAP[dispKey];const now=nowISO();const step=seqSteps[enr.stepIndex];
  if(!disp||!step)return null;
  const dispAct={type:"disposition_logged",text:disp.icon+" "+disp.label+" →",meta:{seqId:enr.sequenceId,stepIndex:enr.stepIndex,stepId:step.id,stepType:step.type,dispKey,dispAction:disp.action,note}};
  if(disp.action==="retry"){
    const retryTask={...task,id:uid(),status:"pending",dueAt:calcNextStepDate(now,1,wh),createdAt:now,completedAt:null,retryCount:(task.retryCount||0)+1};
    return{action:"retry",updatedEnrollment:{...enr,status:"paused",pendingTask:retryTask,lastDisposition:dispKey,lastDispositionAt:now,lastDispositionNote:note},events:[dispAct,{type:"task_retried",text:`[retry] Retry: ${step.label} in 1d`,meta:{seqId:enr.sequenceId,stepIndex:enr.stepIndex,stepType:step.type,dispKey}}],prospectStatusUpdate:null};
  }
  if(disp.action==="finish"){
    return{action:"finish",updatedEnrollment:{...enr,status:"finished",pendingTask:null,finishedAt:now,exitReason:`Disposition: ${disp.label}`,lastDisposition:dispKey,lastDispositionAt:now,lastDispositionNote:note,lastTouchStepId:step.id,lastTouchStepLabel:step.label,lastTouchAt:now},events:[dispAct,{type:"sequence_finished",text:`[end] Finished - ${disp.label}`,meta:{seqId:enr.sequenceId,dispKey}}],prospectStatusUpdate:DISP_TO_STATUS[dispKey]||null};
  }
  const nextIdx=enr.stepIndex+1;const nextStep=seqSteps[nextIdx];
  const base={...enr,stepIndex:nextIdx,lastCompletedAt:now,pendingTask:null,lastDisposition:dispKey,lastDispositionAt:now,lastDispositionNote:note,lastTouchStepId:step.id,lastTouchStepLabel:step.label,lastTouchAt:now};
  const advAct={type:"step_advanced",text:`[->] Advanced: ${step.label}`,meta:{seqId:enr.sequenceId,stepIndex:enr.stepIndex,stepType:step.type,stepId:step.id,dispKey}};
  if(!nextStep)return{action:"advance_finish",updatedEnrollment:{...base,status:"finished",exitReason:"Sequence complete",finishedAt:now},events:[dispAct,advAct,{type:"sequence_finished",text:"[end] Sequence completed",meta:{seqId:enr.sequenceId}}],prospectStatusUpdate:DISP_TO_STATUS[dispKey]||null};
  return{action:"advance",updatedEnrollment:{...base,status:"active",nextRunAt:calcNextStepDate(now,nextStep.delayDays??1,wh)},events:[dispAct,advAct],prospectStatusUpdate:DISP_TO_STATUS[dispKey]||null};
}

function retryEnrollment(enr,seqSteps,wh){const step=seqSteps[enr.stepIndex];return{...enr,status:"active",pendingTask:null,nextRunAt:calcNextStepDate(nowISO(),step?.delayDays||1,wh),retryCount:(enr.retryCount||0)+1,exitReason:null};}

function evalRulesets(rulesets,enr,prospectStatus){
  if(!rulesets?.length)return null;
  for(const r of rulesets){let t=false;if(r.trigger==="reply"&&prospectStatus==="Reply Detected")t=true;if(r.trigger==="meeting"&&prospectStatus==="Meeting Booked")t=true;if(r.trigger==="finished"&&enr.status==="finished")t=true;if(r.trigger==="overdue"&&enr.pendingTask&&dayDiff(enr.pendingTask.dueAt?.split("T")[0])>=(r.triggerValue||3))t=true;if(t)return r;}return null;
}

// Legacy S/KEYS kept only for cfg and savedViews (settings, not shared)
const S={
  save:async(k:string,v:any)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){console.warn(e);}},
  load:async(k:string)=>{try{const r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch{return null;}}
};
const KEYS={cfg:"ei_cfg_v16",sv:"ei_sv_v16"};

// Prospect mappers
const prospectToRow=(p:any)=>({id:p.id,name:p.name||"",contact:p.contact||"",title:p.title||"",phone:p.phone||"",email:p.email||"",city:p.city||"",state:p.state||"",prospect_status:p.prospectStatus||"Not Contacted",priority:p.priority||"Normal",tags:p.tags||[],notes:p.notes||"",call_log:p.callLog||[],created_at:p.createdAt||""});
const prospectFromRow=(r:any)=>({id:r.id,name:r.name||"",contact:r.contact||"",title:r.title||"",phone:r.phone||"",email:r.email||"",city:r.city||"",state:r.state||"",prospectStatus:r.prospect_status||"Not Contacted",priority:r.priority||"Normal",tags:r.tags||[],notes:r.notes||"",callLog:r.call_log||[],createdAt:r.created_at||""});

// Sequence mappers
const seqToRow=(s:any)=>({id:s.id,name:s.name||"",color:s.color||"",reengage_delay:s.reengageDelay||30,active:s.active!==false,built_in:s.builtIn||false,created_at:s.createdAt||"",version:s.version||1,steps:s.steps||[],rulesets:s.rulesets||[]});
const seqFromRow=(r:any)=>({id:r.id,name:r.name||"",color:r.color||"",reengageDelay:r.reengage_delay||30,active:r.active!==false,builtIn:r.built_in||false,createdAt:r.created_at||"",version:r.version||1,steps:r.steps||[],rulesets:r.rulesets||[]});

// Enrollment mappers
const enrToRow=(e:any)=>({id:e.id,prospect_id:e.prospectId,sequence_id:e.sequenceId,sequence_version:e.sequenceVersion||1,step_index:e.stepIndex||0,last_completed_at:e.lastCompletedAt||null,next_run_at:e.nextRunAt||null,scheduled_start_at:e.scheduledStartAt||null,status:e.status||"active",pending_task:e.pendingTask||null,exit_reason:e.exitReason||null,retry_count:e.retryCount||0,enrolled_at:e.enrolledAt||null,finished_at:e.finishedAt||null,source:e.source||"single",paused_at:e.pausedAt||null,last_touch_step_id:e.lastTouchStepId||null,last_touch_step_label:e.lastTouchStepLabel||null,last_touch_at:e.lastTouchAt||null,last_disposition:e.lastDisposition||null,last_disposition_at:e.lastDispositionAt||null,last_disposition_note:e.lastDispositionNote||null});
const enrFromRow=(r:any)=>({id:r.id,prospectId:r.prospect_id,sequenceId:r.sequence_id,sequenceVersion:r.sequence_version||1,stepIndex:r.step_index||0,lastCompletedAt:r.last_completed_at||null,nextRunAt:r.next_run_at||null,scheduledStartAt:r.scheduled_start_at||null,status:r.status||"active",pendingTask:r.pending_task||null,exitReason:r.exit_reason||null,retryCount:r.retry_count||0,enrolledAt:r.enrolled_at||null,finishedAt:r.finished_at||null,source:r.source||"single",pausedAt:r.paused_at||null,lastTouchStepId:r.last_touch_step_id||null,lastTouchStepLabel:r.last_touch_step_label||null,lastTouchAt:r.last_touch_at||null,lastDisposition:r.last_disposition||null,lastDispositionAt:r.last_disposition_at||null,lastDispositionNote:r.last_disposition_note||null});

// Activity mappers
const actToRow=(a:any)=>({id:a.id,prospect_id:a.prospectId,ts:a.ts||null,user_name:a.userName||"",type:a.type||"",text:a.text||"",meta:a.meta||{}});
const actFromRow=(r:any)=>({id:r.id,prospectId:r.prospect_id,ts:r.ts||null,userName:r.user_name||"",type:r.type||"",text:r.text||"",meta:r.meta||{}});

// Supabase DB helpers
const sbSaveProspects=async(prospects:any[])=>{
  if(!prospects.length)return;
  await sbFetch("prospects",{method:"DELETE",headers:{"Prefer":""}});
  for(let i=0;i<prospects.length;i+=50){
    const batch=prospects.slice(i,i+50);
    await sbFetch("prospects",{method:"POST",body:JSON.stringify(batch.map(prospectToRow))});
  }
};
const sbSaveEnrollments=async(enrs:any[])=>{
  await sbFetch("enrollments",{method:"DELETE",headers:{"Prefer":""}});
  if(!enrs.length)return;
  for(let i=0;i<enrs.length;i+=50){
    const batch=enrs.slice(i,i+50);
    await sbFetch("enrollments",{method:"POST",body:JSON.stringify(batch.map(enrToRow))});
  }
};
const sbSaveSequences=async(seqs:any[])=>{
  await sbFetch("sequences",{method:"DELETE",headers:{"Prefer":""}});
  if(!seqs.length)return;
  await sbFetch("sequences",{method:"POST",body:JSON.stringify(seqs.map(seqToRow))});
};
const sbLogActivity=async(act:any)=>{
  try{await sbFetch("activities",{method:"POST",body:JSON.stringify(actToRow(act))});}catch(e){console.warn("act log failed",e);}
};
const toCSV=(rows,cols)=>[cols.join(","),...rows.map(r=>cols.map(c=>'"'+String(r[c]??"").replace(/"/g,"'")+'"').join(","))].join("\n");
const dlCSV=(c,n)=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([c],{type:"text/csv"}));a.download=n;a.click();};
const enrStatusColor=s=>({active:"#4ade80",paused:"#fbbf24",failed:"#f87171",finished:"#2dd4bf",removed:"#64748b",pending:"#818cf8"}[s]||"#4b6280");
const enrStatusBg=s=>({active:"#0a2018",paused:"#1a1000",failed:"#280a0a",finished:"#0a1a1a",removed:"#0f0f14",pending:"#0c0c28"}[s]||"#0b1220");
const urgency=nextISO=>{if(!nextISO)return{label:"Scheduled",col:"#4b6280",bg:"#0b1220"};const diff=dayDiff(nextISO.split("T")[0]);if(diff<0)return{label:"Overdue "+Math.abs(diff)+"d",col:"#f87171",bg:"#280a0a"};if(diff===0)return{label:"Due today",col:"#4ade80",bg:"#0a2018"};if(diff<=2)return{label:"In "+diff+"d",col:"#fbbf24",bg:"#1a1000"};return{label:"In "+diff+"d",col:"#60a5fa",bg:"#0a1a35"};};

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e2d45;border-radius:2px}
.card{background:#0b1220;border:1px solid #192035;border-radius:8px}
.btn{padding:5px 11px;border-radius:6px;border:none;cursor:pointer;font-family:inherit;font-size:11px;font-weight:500;transition:all .15s;white-space:nowrap;display:inline-flex;align-items:center;gap:4px}
.bp{background:#1d4ed8;color:#fff}
.bg{background:transparent;color:#64748b;border:1px solid #1e2d45}.bg:hover{color:#dde4ef;border-color:#334155}
.bGr{background:#14532d;color:#4ade80;border:1px solid #166534}
.bR{background:#7f1d1d;color:#f87171;border:1px solid #991b1b}
.bDel{background:#450a0a;color:#f87171;border:1px solid #7f1d1d}
.bAct{background:#14532d;color:#4ade80;border:1px solid #166534}
.bPu{background:#3b0764;color:#c084fc;border:1px solid #6b21a8}
.bOr{background:#7c2d12;color:#fb923c;border:1px solid #c2410c}
.bAI{background:#0c0c28;color:#818cf8;border:1px solid #3730a3}
.row{background:#0b1220;border:1px solid #192035;border-radius:6px;padding:8px 12px;margin-bottom:3px;cursor:pointer;transition:border-color .13s}.row:hover{border-color:#2563eb;background:#0d1628}
.badge{padding:2px 8px;border-radius:10px;font-size:9px;white-space:nowrap}
.navtab{padding:6px 12px;border-radius:6px;cursor:pointer;font-size:10px;font-weight:500;letter-spacing:1px;text-transform:uppercase;transition:all .13s;background:transparent;color:#3d5070;border:1px solid transparent}.navtab.on{background:#0f1c30;color:#dde4ef;border-color:#1e2d45}
.ctab{padding:4px 10px;border-radius:5px;cursor:pointer;font-size:9px;letter-spacing:.5px;text-transform:uppercase;background:transparent;color:#3d5070;border:1px solid transparent}.ctab.on{background:#0f1c30;color:#dde4ef;border-color:#1e2d45}
input,select,textarea{background:#0b1220;border:1px solid #253352;color:#dde4ef;border-radius:6px;padding:5px 9px;font-family:inherit;font-size:11px;outline:none}
input:focus,select:focus,textarea:focus{border-color:#2563eb}
.mBg{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:100;display:flex;align-items:center;justify-content:center;padding:16px}
.modal{background:#0b1220;border:1px solid #253352;border-radius:12px;padding:20px;max-width:600px;width:100%;max-height:92vh;overflow-y:auto}
.pb{background:#192035;border-radius:3px;height:3px;overflow:hidden}.pf{height:100%;border-radius:3px;background:linear-gradient(90deg,#2563eb,#7c3aed);transition:width .4s}
.sc{border-radius:6px;padding:8px 11px;margin-bottom:3px;border-left:3px solid #0f1828;background:#080e1a}.sc.curr{border-left-color:#f97316!important;background:#120c00}.sc.done{opacity:.25}
.toast{position:fixed;bottom:18px;right:18px;padding:8px 14px;border-radius:7px;font-size:11px;z-index:300;animation:su .15s ease;border:1px solid}
@keyframes su{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}
.fl{font-size:8px;color:#3d5070;letter-spacing:.8px;text-transform:uppercase;margin-bottom:2px}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:7px}
.sdot{width:6px;height:6px;border-radius:50%;background:#4ade80;display:inline-block;animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.bulk-bar{background:#0b1a2e;border:1px solid #1e2d45;border-radius:7px;padding:8px 12px;margin-bottom:9px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.sh-row{padding:8px 10px;border-radius:6px;margin-bottom:4px;border:1px solid #101928;background:#07090f}.sh-row.open{border-color:#253352}
.shdr{font-size:9px;color:#3d5070;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;font-weight:500}
.mc{background:#0b1220;border:1px solid #192035;border-radius:8px;padding:12px 14px}
.rr{padding:8px 10px;border-bottom:1px solid #0a0f1a;font-size:11px;display:grid;align-items:center}.rr:hover{background:#080f1c}
.bw{background:#192035;border-radius:3px;height:6px;overflow:hidden;min-width:60px}.bf{height:100%;border-radius:3px;transition:width .4s}
.tile{background:#0b1220;border:1px solid #192035;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:3px}
.tc{border-radius:8px;padding:11px 13px;margin-bottom:5px;border:1px solid #192035;transition:border-color .13s}.tc:hover{border-color:#334155}
.tc.overdue{border-color:#7f1d1d;background:#0e0808}.tc.today{border-color:#1a4d1a;background:#070f07}.tc.upcoming{background:#07090f}.tc.selected{border-color:#8b5cf6!important;background:#0f0a1e}
.tc.scheduled{border-color:#1e3a5f;background:#050d1a}
.view-pill{padding:3px 10px;border-radius:12px;font-size:9px;cursor:pointer;border:1px solid #192035;background:#07090f;color:#4b6280}.view-pill.on{background:#0f1c30;border-color:#2563eb;color:#60a5fa}
.start-toggle{display:flex;gap:6px;margin-bottom:10px}
.start-btn{padding:7px 14px;border-radius:7px;border:1px solid #1e2d45;background:transparent;color:#4b6280;cursor:pointer;font-family:inherit;font-size:10px;flex:1;text-align:center;transition:all .15s}
.start-btn.on{border-color:#2563eb;background:#0f1c30;color:#dde4ef}
`;

// -- SHARED SCHEDULE PICKER ----------------------------------------------------
// Used by both single-enroll and bulk-enroll modals
function SchedulePicker({ startMode, setStartMode, schedDT, setSchedDT }) {
  return (
    <div>
      <div className="fl" style={{ marginBottom: 6 }}>When to start</div>
      <div className="start-toggle">
        <button
          className={"start-btn" + (startMode === "now" ? " on" : "")}
          onClick={() => setStartMode("now")}
        >
          [!] Start Now
        </button>
        <button
          className={"start-btn" + (startMode === "scheduled" ? " on" : "")}
          onClick={() => setStartMode("scheduled")}
        >
          [date] Schedule Start
        </button>
      </div>
      {startMode === "scheduled" && (
        <div style={{ background: "#070d1a", border: "1px solid #1e3a5f", borderRadius: 7, padding: "10px 12px" }}>
          <div className="fl" style={{ marginBottom: 5, color: "#60a5fa" }}>Start date &amp; time</div>
          <input
            type="datetime-local"
            value={schedDT}
            onChange={e => setSchedDT(e.target.value)}
            style={{ width: "100%", fontSize: 11 }}
          />
          <div style={{ fontSize: 8, color: "#3d5070", marginTop: 6, lineHeight: 1.6 }}>
            Step 1 becomes eligible at this exact time.<br />
            Subsequent steps roll forward from completion time + delay.
          </div>
        </div>
      )}
    </div>
  );
}

// -- COMPONENTS ----------------------------------------------------------------

function DispositionPicker({selected,onSelect}){
  return(
    <div>
      {DISP_GROUPS.map(grp=>(
        <div key={grp.label} style={{marginBottom:10}}>
          <div style={{fontSize:8,color:"#3d5070",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:6}}>{grp.label}</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {DISPOSITIONS.filter(d=>grp.keys.includes(d.key)).map(d=>{
              const sel=selected===d.key;
              return(
                <button key={d.key} onClick={()=>onSelect(d.key)} style={{padding:"6px 10px",borderRadius:7,border:"1px solid "+(sel?d.color:"#1e2d45"),background:sel?d.color+"22":"#080f1c",color:sel?d.color:"#64748b",cursor:"pointer",fontSize:10,fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:76}}>
                  <span style={{fontSize:15}}>{d.icon}</span>
                  <span style={{fontWeight:sel?"600":"400",fontSize:9,textAlign:"center",lineHeight:1.2}}>{d.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskOutcomeModal({taskModal,onClose,onSubmit,onSkip}){
  const [dispKey,setDispKey]=useState("");
  const [note,setNote]=useState("");
  const disp=dispKey?DISP_MAP[dispKey]:null;
  const aInfo=disp?ACTION_LABELS[disp.action]:null;
  return(
    <div className="mBg" onClick={onClose}>
      <div className="modal" style={{maxWidth:580}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,alignItems:"flex-start"}}>
          <div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:2,color:STM[taskModal.task.stepType]?.color||"#dde4ef"}}>{STM[taskModal.task.stepType]?.icon||"📋"} {taskModal.task.stepLabel}</div>
            <div style={{fontSize:9,color:"#4b6280"}}>{taskModal.p.name+(taskModal.p.phone?" · "+taskModal.p.phone:"")+" · Step "+((taskModal.e.stepIndex||0)+1)+" / "+(taskModal.seq?.steps?.length||"?")}</div>
          </div>
          <button className="btn bg" onClick={onClose}>✕</button>
        </div>
        {taskModal.task.script&&<div style={{background:"#080f1c",borderRadius:6,padding:10,fontSize:10,lineHeight:"1.8",color:"#b8c5d8",border:"1px solid #101928",whiteSpace:"pre-line",marginBottom:14}}>{taskModal.task.script}</div>}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:8,color:"#3d5070",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>Log Outcome <span style={{color:"#f87171",fontSize:8}}>(required)</span></div>
          <DispositionPicker selected={dispKey} onSelect={setDispKey}/>
        </div>
        {disp&&aInfo&&(
          <div style={{background:"#080f1c",border:"1px solid "+disp.color+"44",borderRadius:7,padding:"10px 12px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>{disp.icon}</span>
            <div>
              <div style={{fontSize:11,color:disp.color,fontWeight:"500"}}>{disp.label}</div>
              <div style={{fontSize:9,color:aInfo.color}}>{aInfo.icon+" "+aInfo.label}</div>
            </div>
          </div>
        )}
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Notes (optional)…" rows={2} style={{width:"100%",resize:"vertical",fontSize:10,marginBottom:14}}/>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end",alignItems:"center"}}>
          <button className="btn bg" onClick={onClose}>Cancel</button>
          <button className="btn bg" style={{color:"#64748b"}} onClick={onSkip}>Skip Step</button>
          <button className="btn bAct" style={{fontSize:10,opacity:dispKey?1:.4,cursor:dispKey?"pointer":"not-allowed"}} disabled={!dispKey} onClick={()=>onSubmit(dispKey,note)}>
            {disp?disp.icon+" "+disp.label+" →"+" >":"Select outcome first"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkOutcomeModal({count,onClose,onSubmit}){
  const [dispKey,setDispKey]=useState("");
  const [note,setNote]=useState("");
  return(
    <div className="mBg" onClick={onClose}>
      <div className="modal" style={{maxWidth:560}} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,marginBottom:4,color:"#4ade80"}}>Log Outcome — {count} Tasks</div>
        <div style={{fontSize:9,color:"#4b6280",marginBottom:14}}>Same disposition applied to all selected tasks.</div>
        <DispositionPicker selected={dispKey} onSelect={setDispKey}/>
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Shared note…" rows={2} style={{width:"100%",resize:"vertical",fontSize:10,margin:"12px 0"}}/>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}>
          <button className="btn bg" onClick={onClose}>Cancel</button>
          <button className="btn bAct" disabled={!dispKey} style={{opacity:dispKey?1:.4}} onClick={()=>onSubmit(dispKey,note)}>Apply to All</button>
        </div>
      </div>
    </div>
  );
}

// -- BULK START MODAL (wired up) ------------------------------------------------
function BulkStartSeqModal({selProspects,enrollments,sequences,onClose,onConfirm}){
  const [seqId,setSeqId]=useState(sequences.find(s=>s.active)?.id||"");
  const [startStep,setStartStep]=useState(0);
  const [startMode,setStartMode]=useState("now");
  const [schedDT,setSchedDT]=useState(defaultScheduledISO);
  const seq=sequences.find(s=>s.id===seqId);
  const rows=selProspects.map(p=>{const ae=enrollments.find(e=>e.prospectId===p.id&&(e.status==="active"||e.status==="paused"||e.status==="failed"));return{p,ae,alreadyIn:ae?.sequenceId===seqId};});
  const willEnroll=rows.filter(r=>!r.alreadyIn).length;
  const willSkip=rows.filter(r=>r.alreadyIn).length;
  // resolve the ISO to pass down (null = now)
  const scheduledStartISO = startMode === "scheduled" ? new Date(schedDT).toISOString() : null;

  return(
    <div className="mBg" onClick={onClose}>
      <div className="modal" style={{maxWidth:500}} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:17,letterSpacing:2,marginBottom:4,color:"#4ade80"}}>START SEQUENCE</div>
        <div style={{fontSize:9,color:"#4b6280",marginBottom:14}}>{selProspects.length} prospects selected</div>
        <div style={{marginBottom:12}}>
          <div className="fl" style={{marginBottom:5}}>Sequence</div>
          <select value={seqId} onChange={e=>{setSeqId(e.target.value);setStartStep(0);}} style={{width:"100%",fontSize:11}}>
            <option value="">— Select sequence —</option>
            {sequences.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name} v{s.version||1}</option>)}
          </select>
        </div>
        {seq&&<div style={{marginBottom:12}}>
          <div className="fl" style={{marginBottom:5}}>Start at step</div>
          <select value={startStep} onChange={e=>setStartStep(parseInt(e.target.value))} style={{width:"100%",fontSize:11}}>
            {seq.steps.map((s,i)=><option key={i} value={i}>Step {i+1} - {s.label}</option>)}
          </select>
        </div>}
        <div style={{marginBottom:14}}>
          <SchedulePicker
            startMode={startMode} setStartMode={setStartMode}
            schedDT={schedDT} setSchedDT={setSchedDT}
          />
        </div>
        {startMode==="scheduled"&&(
          <div style={{background:"#050d1a",border:"1px solid #1e3a5f",borderRadius:7,padding:"8px 12px",marginBottom:14,fontSize:9,color:"#60a5fa"}}>
            [date] Step 1 eligible: <strong>{fmtDT(new Date(schedDT).toISOString())}</strong>
          </div>
        )}
        <div style={{background:"#080f1c",border:"1px solid #101928",borderRadius:7,padding:12,marginBottom:14,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[["Will enroll",willEnroll,"#4ade80"],["Already in seq (skip)",willSkip,"#fbbf24"]].map(([l,v,c])=>(
            <div key={l} style={{textAlign:"center"}}><div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:c,lineHeight:1}}>{v}</div><div style={{fontSize:8,color:"#3d5070",marginTop:2,textTransform:"uppercase"}}>{l}</div></div>
          ))}
        </div>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}>
          <button className="btn bg" onClick={onClose}>Cancel</button>
          <button className="btn bAct" disabled={!seqId||willEnroll===0} style={{opacity:seqId&&willEnroll>0?1:.4}} onClick={()=>onConfirm(seqId,startStep,rows,scheduledStartISO)}>Enroll {willEnroll}</button>
        </div>
      </div>
    </div>
  );
}

// -- SINGLE ENROLL MODAL --------------------------------------------------------
// New: used from ProspectDetail overview tab when clicking a sequence button
function SingleEnrollModal({ prospect, sequences, currentEnrSeqId, onClose, onConfirm }) {
  const [seqId, setSeqId] = useState(currentEnrSeqId || sequences.find(s => s.active)?.id || "");
  const [startMode, setStartMode] = useState("now");
  const [schedDT, setSchedDT] = useState(defaultScheduledISO);
  const seq = sequences.find(s => s.id === seqId);
  const scheduledStartISO = startMode === "scheduled" ? new Date(schedDT).toISOString() : null;

  return (
    <div className="mBg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Bebas Neue'", fontSize: 17, letterSpacing: 2, marginBottom: 4, color: "#4ade80" }}>ENROLL PROSPECT</div>
        <div style={{ fontSize: 9, color: "#4b6280", marginBottom: 14 }}>{prospect.name}</div>
        <div style={{ marginBottom: 12 }}>
          <div className="fl" style={{ marginBottom: 5 }}>Sequence</div>
          <select value={seqId} onChange={e => setSeqId(e.target.value)} style={{ width: "100%", fontSize: 11 }}>
            <option value="">— Select sequence —</option>
            {sequences.filter(s => s.active).map(s => (
              <option key={s.id} value={s.id}>{s.name} v{s.version || 1}{currentEnrSeqId === s.id ? " (current)" : ""}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <SchedulePicker
            startMode={startMode} setStartMode={setStartMode}
            schedDT={schedDT} setSchedDT={setSchedDT}
          />
        </div>
        {startMode === "scheduled" && (
          <div style={{ background: "#050d1a", border: "1px solid #1e3a5f", borderRadius: 7, padding: "8px 12px", marginBottom: 14, fontSize: 9, color: "#60a5fa" }}>
            [date] Step 1 eligible: <strong>{fmtDT(new Date(schedDT).toISOString())}</strong>
          </div>
        )}
        {seq && (
          <div style={{ background: "#080f1c", border: "1px solid #101928", borderRadius: 7, padding: "8px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 8, color: "#3d5070", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Sequence preview</div>
            {seq.steps.slice(0, 4).map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, fontSize: 9 }}>
                <span style={{ color: STM[s.type]?.color || "#4b6280" }}>{STM[s.type]?.icon || "."}</span>
                <span style={{ color: "#64748b" }}>Step {i + 1} - {s.label}</span>
                <span style={{ color: "#253352", marginLeft: "auto" }}>+{s.delayDays || 0}d</span>
              </div>
            ))}
            {seq.steps.length > 4 && <div style={{ fontSize: 8, color: "#253352" }}>+{seq.steps.length - 4} more steps</div>}
          </div>
        )}
        <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
          <button className="btn bg" onClick={onClose}>Cancel</button>
          <button className="btn bAct" disabled={!seqId} style={{ opacity: seqId ? 1 : .4 }} onClick={() => onConfirm(seqId, scheduledStartISO)}>
            {startMode === "scheduled" ? "Schedule Enrollment" : "Enroll Now"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkSwitchSeqModal({selProspects,sequences,onClose,onConfirm}){
  const [seqId,setSeqId]=useState(sequences.find(s=>s.active)?.id||"");
  const [startStep,setStartStep]=useState(0);
  const [startMode,setStartMode]=useState("now");
  const [schedDT,setSchedDT]=useState(defaultScheduledISO);
  const seq=sequences.find(s=>s.id===seqId);
  const scheduledStartISO = startMode === "scheduled" ? new Date(schedDT).toISOString() : null;
  return(
    <div className="mBg" onClick={onClose}>
      <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:17,letterSpacing:2,marginBottom:4,color:"#60a5fa"}}>SWITCH SEQUENCE</div>
        <div style={{fontSize:9,color:"#4b6280",marginBottom:14}}>{selProspects.length} prospects</div>
        <div style={{marginBottom:12}}>
          <div className="fl" style={{marginBottom:5}}>New Sequence</div>
          <select value={seqId} onChange={e=>{setSeqId(e.target.value);setStartStep(0);}} style={{width:"100%",fontSize:11}}>
            <option value="">— Select sequence —</option>
            {sequences.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name} v{s.version||1}</option>)}
          </select>
        </div>
        {seq&&<div style={{marginBottom:12}}>
          <div className="fl" style={{marginBottom:5}}>Start at step</div>
          <select value={startStep} onChange={e=>setStartStep(parseInt(e.target.value))} style={{width:"100%",fontSize:11}}>
            {seq.steps.map((s,i)=><option key={i} value={i}>Step {i+1} - {s.label}</option>)}
          </select>
        </div>}
        <div style={{marginBottom:14}}>
          <SchedulePicker startMode={startMode} setStartMode={setStartMode} schedDT={schedDT} setSchedDT={setSchedDT}/>
        </div>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}>
          <button className="btn bg" onClick={onClose}>Cancel</button>
          <button className="btn bp" disabled={!seqId} style={{opacity:seqId?1:.4}} onClick={()=>onConfirm(seqId,startStep,scheduledStartISO)}>Switch {selProspects.length}</button>
        </div>
      </div>
    </div>
  );
}

function BulkRemoveSeqModal({selProspects,enrollments,onClose,onConfirm}){
  const [newStatus,setNewStatus]=useState("");
  const enrolled=selProspects.filter(p=>enrollments.find(e=>e.prospectId===p.id&&(e.status==="active"||e.status==="paused"||e.status==="failed")));
  return(
    <div className="mBg" onClick={onClose}>
      <div className="modal" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:17,letterSpacing:2,marginBottom:4,color:"#f87171"}}>REMOVE FROM SEQUENCE</div>
        <div style={{fontSize:9,color:"#4b6280",marginBottom:14}}>{selProspects.length} selected - {enrolled.length} in a sequence</div>
        <div style={{marginBottom:12}}>
          <div className="fl" style={{marginBottom:5}}>Also set status (optional)</div>
          <select value={newStatus} onChange={e=>setNewStatus(e.target.value)} style={{width:"100%",fontSize:11}}>
            <option value="">- Keep current status -</option>
            {PROSPECT_STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}>
          <button className="btn bg" onClick={onClose}>Cancel</button>
          <button className="btn bR" disabled={enrolled.length===0} style={{opacity:enrolled.length>0?1:.4}} onClick={()=>onConfirm(enrolled.map(p=>p.id),newStatus)}>Remove {enrolled.length}</button>
        </div>
      </div>
    </div>
  );
}

function BulkChangeStatusModal({selProspects,onClose,onConfirm}){
  const [status,setStatus]=useState("");
  return(
    <div className="mBg" onClick={onClose}>
      <div className="modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:17,letterSpacing:2,marginBottom:4,color:"#c084fc"}}>CHANGE STATUS</div>
        <div style={{fontSize:9,color:"#4b6280",marginBottom:14}}>{selProspects.length} prospect{selProspects.length!==1?"s":""}</div>
        <div className="fl" style={{marginBottom:5}}>New Status</div>
        <select value={status} onChange={e=>setStatus(e.target.value)} style={{width:"100%",fontSize:11,marginBottom:14}}>
          <option value="">— Select status —</option>
          {PROSPECT_STATUSES.map(s=><option key={s}>{s}</option>)}
        </select>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}>
          <button className="btn bg" onClick={onClose}>Cancel</button>
          <button className="btn bPu" disabled={!status} style={{opacity:status?1:.4}} onClick={()=>onConfirm(status)}>Apply to {selProspects.length}</button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({settings,onClose,onSave}){
  const [wh,setWh]=useState({...settings});
  return(
    <div className="mBg" onClick={onClose}>
      <div className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,marginBottom:14}}>SETTINGS</div>
        <div style={{fontSize:9,color:"#3d5070",textTransform:"uppercase",letterSpacing:"1px",marginBottom:8}}>Working Days</div>
        <div style={{display:"flex",gap:5,marginBottom:14}}>
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,i)=>(
            <button key={i} onClick={()=>setWh(w=>{const ds=w.days.includes(i)?w.days.filter(x=>x!==i):[...w.days,i].sort();return{...w,days:ds};})} style={{padding:"5px 8px",borderRadius:6,border:"1px solid "+(wh.days.includes(i)?"#2563eb":"#1e2d45"),background:wh.days.includes(i)?"#0f1c30":"transparent",color:wh.days.includes(i)?"#dde4ef":"#4b6280",cursor:"pointer",fontSize:10,fontFamily:"inherit"}}>{d}</button>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <div><div className="fl">Start Hour</div><select value={wh.startHour} onChange={e=>setWh(w=>({...w,startHour:parseInt(e.target.value)}))} style={{width:"100%"}}>{Array.from({length:12},(_,i)=>i+6).map(h=><option key={h} value={h}>{h<12?h+":00 am":h+":00 pm"}</option>)}</select></div>
          <div><div className="fl">End Hour</div><select value={wh.endHour} onChange={e=>setWh(w=>({...w,endHour:parseInt(e.target.value)}))} style={{width:"100%"}}>{Array.from({length:12},(_,i)=>i+12).map(h=><option key={h} value={h}>{h+":00 pm"}</option>)}</select></div>
        </div>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}>
          <button className="btn bg" onClick={onClose}>Cancel</button>
          <button className="btn bp" onClick={()=>onSave(wh)}>Save</button>
        </div>
      </div>
    </div>
  );
}

function RulesetEditor({rulesets,sequences,onChange}){
  const add=()=>onChange([...rulesets,{id:uid(),trigger:"reply",triggerValue:3,action:"stop",actionTarget:"",active:true}]);
  const upd=(id,patch)=>onChange(rulesets.map(r=>r.id===id?{...r,...patch}:r));
  const del=id=>onChange(rulesets.filter(r=>r.id!==id));
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:8,color:"#3d5070",textTransform:"uppercase",letterSpacing:"2px"}}>Automation Rules</span>
        <button className="btn bg" style={{fontSize:9,color:"#4ade80"}} onClick={add}>+ Rule</button>
      </div>
      {rulesets.map(r=>{
        const tDef=RULE_TRIGGERS.find(x=>x.key===r.trigger)||RULE_TRIGGERS[0];
        const aDef=RULE_ACTIONS.find(x=>x.key===r.action)||RULE_ACTIONS[0];
        return(
          <div key={r.id} style={{background:"#080f1c",border:"1px solid #101928",borderRadius:7,padding:10,marginBottom:5}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <span style={{fontSize:9,color:"#64748b"}}>When</span>
              <select value={r.trigger} onChange={e=>upd(r.id,{trigger:e.target.value})} style={{fontSize:9,padding:"3px 6px"}}>{RULE_TRIGGERS.map(t=><option key={t.key} value={t.key}>{t.icon+" "+t.label}</option>)}</select>
              {tDef.hasValue&&<input type="number" min="1" max="30" value={r.triggerValue||3} onChange={e=>upd(r.id,{triggerValue:parseInt(e.target.value)||3})} style={{width:44,fontSize:9,padding:"3px 6px"}}/>}
              {tDef.hasValue&&<span style={{fontSize:9,color:"#64748b"}}>days</span>}
              <span style={{fontSize:9,color:"#64748b"}}>→</span>
              <select value={r.action} onChange={e=>upd(r.id,{action:e.target.value})} style={{fontSize:9,padding:"3px 6px"}}>{RULE_ACTIONS.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}</select>
              {aDef.hasTarget&&r.action==="move_seq"&&<select value={r.actionTarget} onChange={e=>upd(r.id,{actionTarget:e.target.value})} style={{fontSize:9,padding:"3px 6px"}}><option value="">Pick sequence…</option>{sequences.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}
              {aDef.hasTarget&&r.action==="mark_status"&&<select value={r.actionTarget} onChange={e=>upd(r.id,{actionTarget:e.target.value})} style={{fontSize:9,padding:"3px 6px"}}><option value="">Pick status…</option>{PROSPECT_STATUSES.map(s=><option key={s}>{s}</option>)}</select>}
              <button onClick={()=>del(r.id)} style={{marginLeft:"auto",padding:"2px 7px",borderRadius:5,border:"1px solid #7f1d1d",background:"#450a0a",color:"#f87171",cursor:"pointer",fontSize:9,fontFamily:"inherit"}}>✕</button>
            </div>
          </div>
        );
      })}
      {!rulesets.length&&<div style={{fontSize:9,color:"#253352",padding:"4px 0"}}>No rules.</div>}
    </div>
  );
}

function SequenceEditor({seq,onSave,onDiscard,sequences}){
  const [editing,setEditing]=useState(()=>({...seq,steps:computeDays(seq.steps.map(s=>({...s}))),rulesets:seq.rulesets||[]}));
  const [isDraft,setIsDraft]=useState(false);
  const upd=patch=>{setEditing(p=>({...p,...patch}));setIsDraft(true);};
  const updStep=(id,patch)=>{setEditing(p=>({...p,steps:computeDays(p.steps.map(s=>s.id===id?{...s,...patch}:s))}));setIsDraft(true);};
  const delStep=id=>{setEditing(p=>({...p,steps:computeDays(p.steps.filter(s=>s.id!==id))}));setIsDraft(true);};
  const moveStep=(id,dir)=>{setEditing(p=>{const st=[...p.steps];const i=st.findIndex(s=>s.id===id);if(i<0)return p;const ni=i+dir;if(ni<0||ni>=st.length)return p;[st[i],st[ni]]=[st[ni],st[i]];return{...p,steps:computeDays(st)};});setIsDraft(true);};
  const addStep=()=>{setEditing(p=>({...p,steps:computeDays([...p.steps,mkStep("call",1)])}));setIsDraft(true);};
  const totalDays=editing.steps.length?computeDays(editing.steps).slice(-1)[0].day:0;
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap",position:"sticky",top:46,zIndex:15,background:"#05080f",paddingBottom:8,borderBottom:"1px solid #0d1525"}}>
        <button onClick={()=>{if(isDraft&&!window.confirm("Discard?"))return;onDiscard();}} className="btn bg" style={{fontSize:9}}>← Back</button>
        <span style={{fontFamily:"'Bebas Neue'",fontSize:17,letterSpacing:2,flex:1,color:editing.color}}>{editing.name||"Untitled"}</span>
        {isDraft&&<span style={{fontSize:9,color:"#fbbf24",background:"#1a1000",border:"1px solid #92400e",padding:"2px 8px",borderRadius:4}}>Draft</span>}
        <button onClick={()=>onSave(editing)} className="btn bp">Publish</button>
      </div>
      <div style={{background:"#0b1220",border:"1px solid #192035",borderRadius:8,padding:13,marginBottom:10}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:10,alignItems:"end"}}>
          <div><div className="fl">Name</div><input value={editing.name} onChange={e=>upd({name:e.target.value})} style={{width:"100%",fontSize:12}}/></div>
          <div><div className="fl" style={{marginBottom:4}}>Color</div><div style={{display:"flex",gap:4,flexWrap:"wrap",maxWidth:130}}>{SEQ_COLORS.map(c=><div key={c} onClick={()=>upd({color:c})} style={{width:16,height:16,borderRadius:"50%",background:c,cursor:"pointer",border:editing.color===c?"2px solid #fff":"2px solid transparent",flexShrink:0}}/>)}</div></div>
          <div><div className="fl">Status</div><button onClick={()=>upd({active:!editing.active})} className="btn" style={{border:"1px solid "+(editing.active?"#166534":"#3730a3"),background:editing.active?"#14532d":"#0a0a28",color:editing.active?"#4ade80":"#818cf8"}}>{editing.active?"Active":"Inactive"}</button></div>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:8,color:"#3d5070",letterSpacing:"2px",textTransform:"uppercase"}}>{editing.steps.length+" steps · Day 1–"+totalDays}</span>
        <button onClick={addStep} className="btn bg" style={{fontSize:9,color:"#4ade80"}}>+ Add Step</button>
      </div>
      {editing.steps.map((step,idx)=>{
        const st=STM[step.type]||STEP_TYPES[0];
        return(
          <div key={step.id} style={{background:"#0b1220",border:"1px solid #192035",borderLeft:"3px solid "+st.color,borderRadius:7,padding:"10px 13px",marginBottom:4}}>
            <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto auto auto",gap:6,alignItems:"center",marginBottom:8}}>
              <span style={{fontFamily:"'Bebas Neue'",fontSize:16,color:"#253352",width:20,textAlign:"center"}}>{idx+1}</span>
              <select value={step.type} onChange={e=>{const t=STM[e.target.value];updStep(step.id,{type:e.target.value,label:t?.label||e.target.value});}} style={{fontSize:10,background:"#080f1c",border:"1px solid "+st.color,color:st.color,borderRadius:6,padding:"4px 6px",fontFamily:"inherit"}}>{STEP_TYPES.map(t=><option key={t.key} value={t.key}>{t.icon+" "+t.label}</option>)}</select>
              <input value={step.label} onChange={e=>updStep(step.id,{label:e.target.value})} style={{fontSize:11}}/>
              <div style={{display:"flex",alignItems:"center",gap:4,background:"#080f1c",padding:"4px 8px",borderRadius:5,border:"1px solid #192035",flexShrink:0}}>
                <span style={{fontSize:8,color:"#3d5070"}}>+</span>
                <input type="number" min="0" max="365" value={step.delayDays??1} onChange={e=>updStep(step.id,{delayDays:Math.max(0,parseInt(e.target.value)||0)})} style={{width:38,textAlign:"center",fontSize:11,background:"transparent",border:"none",color:"#dde4ef",padding:0}}/>
                <span style={{fontSize:8,color:"#3d5070"}}>d</span>
                <span style={{fontSize:9,color:st.color,marginLeft:4,minWidth:36,fontWeight:"500"}}>{"D"+step.day}</span>
              </div>
              <div style={{display:"flex",gap:2,flexShrink:0}}>
                <button disabled={idx===0} onClick={()=>moveStep(step.id,-1)} className="btn bg" style={{fontSize:9,padding:"2px 6px",color:idx===0?"#253352":"#64748b"}}>↑</button>
                <button disabled={idx===editing.steps.length-1} onClick={()=>moveStep(step.id,1)} className="btn bg" style={{fontSize:9,padding:"2px 6px"}}>↓</button>
                <button onClick={()=>delStep(step.id)} className="btn bDel" style={{fontSize:9,padding:"2px 6px"}}>✕</button>
              </div>
            </div>
          </div>
        );
      })}
      <div style={{background:"#0b1220",border:"1px solid #192035",borderRadius:8,padding:13,marginTop:10}}>
        <RulesetEditor rulesets={editing.rulesets||[]} sequences={sequences} onChange={rs=>upd({rulesets:rs})}/>
      </div>
    </div>
  );
}

function ProspectDetail({sel,selEnr,selSeq,selSteps,enrollments,sequences,activities,settings,onBack,onEnroll,onPause,onResume,onRetry,onStop,onStatus,onStartTask,onLogOutcome,onSkipTask,onDelete,saveEnr,logAct,runTick}){
  const [cardTab,setCardTab]=useState("overview");
  const [showDone,setShowDone]=useState(false);
  const [enrollModal, setEnrollModal] = useState(false);
  const [aiIntel,setAiIntel]=useState(null);
  const [aiLoading,setAiLoading]=useState(false);
  const [aiError,setAiError]=useState(null);
  const runAiIntel=async()=>{
    setAiLoading(true);setAiError(null);setAiIntel(null);
    const agencyLine="Agency: "+sel.name+(sel.city?", "+sel.city:"")+(sel.state?", "+sel.state:"");
    const contactLine="Contact: "+(sel.contact||"Unknown")+(sel.title?", "+sel.title:"");
    const dispLine="Last disposition: "+(selEnr?.lastDisposition?DISP_MAP[selEnr.lastDisposition]?.label||selEnr.lastDisposition:"None yet");
    const stepLine="Sequence step: "+(selEnr?((selEnr.stepIndex||0)+1)+" of "+(selSteps?.length||"?"):"Not enrolled");
    const prompt=[
      "You are a sales assistant for ProviderSoft, a practice management and billing platform built for Pennsylvania EI agencies.",
      "",
      "CONTEXT:",
      "- PA is phasing out NCR paper session note forms (EITA notice Nov 2025).",
      "- The state replacement is a blank PDF. Therapists must manually re-enter child name, DOB, auth number every session.",
      "- Admin re-enters it all into Promise (PA Medicaid billing). ProviderSoft maps everything automatically. Zero re-entry. HIPAA-compliant. Audit-ready.",
      "",
      "KEY PAIN POINTS PROVIDERSOFT SOLVES:",
      "1. Manual re-entry of child data on every session note",
      "2. Broken PDF to admin to Promise workflow (5 steps, multiple people)",
      "3. HIPAA compliance risk from unsecured document transmission",
      "4. Audit scrambles from disorganized PDF filing",
      "5. Admin burnout from re-entry on top of billing and scheduling",
      "6. Billing delays from documentation backlogs",
      "",
      "PROSPECT:",
      agencyLine,
      contactLine,
      dispLine,
      stepLine,
      "",
      "Return ONLY valid JSON, no markdown, no backticks, no extra text:",
      '{"painPoints":["Label: sentence","Label: sentence","Label: sentence"],"talkingPoint":"One sharp sentence for this prospect","openingQuestion":"One question for first 30 seconds","emails":[{"label":"NCR Urgency","body":"3 sentences. NCR hook, re-entry pain, soft ask for 10 min."},{"label":"Billing Bottleneck","body":"3 sentences. Promise re-entry problem, ProviderSoft fix, quick call CTA."},{"label":"Audit Risk","body":"3 sentences. Audit scramble, one-click records, soft close."}]}'
    ].join("\n");
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      const data=await res.json();
      const text=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const clean=text.replace(/```json|```/g,"").trim();
      setAiIntel(JSON.parse(clean));
    }catch(e){setAiError("Intel generation failed — try again.");}
    finally{setAiLoading(false);}
  };
  const steps=selSteps;
  const stepsDays=computeDays(steps);
  const p3=steps.length?Math.round((selEnr?.stepIndex||0)/steps.length*100):0;
  const urg=selEnr?urgency(selEnr.nextRunAt):null;
  const currStep=selEnr?steps[selEnr.stepIndex]:null;
  const enrHistory=[...enrollments].filter(e=>e.prospectId===sel.id).sort((a,b)=>new Date(b.enrolledAt)-new Date(a.enrolledAt));
  const doneSteps=stepsDays.filter((_,i)=>selEnr&&i<selEnr.stepIndex);
  const upcoming=stepsDays.filter((_,i)=>selEnr&&i>=selEnr.stepIndex);
  const hasTask=selEnr?.status==="paused"&&selEnr.pendingTask;
  const lastDisp=selEnr?.lastDisposition?DISP_MAP[selEnr.lastDisposition]:null;
  const acts=(activities[sel.id]||[]).slice(0,50);

  // show scheduled-not-yet-started badge
  const isScheduledFuture = selEnr?.status==="active" && !!selEnr.scheduledStartAt && new Date(selEnr.nextRunAt) > new Date();

  return(
    <div>
      <button className="btn bg" style={{marginBottom:10,fontSize:9}} onClick={onBack}>← Back</button>
      {selEnr&&currStep&&urg&&(
        <div style={{position:"sticky",top:46,zIndex:15,marginBottom:8}}>
          <div style={{background:urg.bg,border:"1px solid "+urg.col+"44",borderRadius:8,padding:"10px 13px"}}>
            <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:10,alignItems:"center"}}>
              <span style={{fontSize:22}}>{STM[currStep.type]?.icon||"📋"}</span>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:2,flexWrap:"wrap"}}>
                  <span style={{fontSize:9,background:urg.col+"22",color:urg.col,padding:"2px 8px",borderRadius:10}}>
                    {isScheduledFuture ? "SCHEDULED" : urg.label.toUpperCase()}
                  </span>
                  <span style={{fontSize:8,color:"#253352"}}>Step {((selEnr.stepIndex||0)+1)+"/"+(steps.length)}</span>
                  <span className="badge" style={{background:enrStatusBg(selEnr.status),color:enrStatusColor(selEnr.status)}}>{selEnr.status}</span>
                </div>
                <div style={{fontSize:13,fontWeight:"500",color:STM[currStep.type]?.color||"#dde4ef",marginBottom:3}}>{currStep.label}</div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:9,color:"#4b6280"}}>
                    {selSeq?.name||""} · {isScheduledFuture ? "Starts: " : "Due: "}{fmtDT(selEnr.nextRunAt)}
                  </span>
                  {lastDisp&&<span style={{padding:"2px 8px",borderRadius:8,fontSize:9,background:lastDisp.color+"18",color:lastDisp.color}}>{lastDisp.icon+" "+lastDisp.label}</span>}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                {hasTask
                  ?<button className="btn bAct" style={{fontSize:9}} onClick={()=>onLogOutcome(selEnr,sel,selSeq,selEnr.pendingTask)}>Log Outcome</button>
                  :selEnr.status==="paused"&&!selEnr.pendingTask
                    ?<button className="btn bGr" style={{fontSize:9}} onClick={()=>onResume(selEnr.id)}>▶ Resume</button>
                  :selEnr.status==="failed"
                    ?<button className="btn bAI" style={{fontSize:9}} onClick={()=>onRetry(selEnr.id)}>Retry</button>
                  :isScheduledFuture
                    ?<span style={{fontSize:9,color:"#60a5fa",padding:"4px 8px",border:"1px solid #1e3a5f",borderRadius:6,background:"#050d1a"}}>[date] Waiting</span>
                    :<span style={{fontSize:9,color:"#3d5070",padding:"4px 8px",border:"1px solid #192035",borderRadius:6}}>[wait] Pending</span>}
                {selEnr.status==="active"&&<button className="btn bOr" style={{fontSize:9}} onClick={()=>onPause(selEnr.id)}>Pause</button>}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="card" style={{padding:13,marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:7,marginBottom:10}}>
          <div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:17,letterSpacing:2}}>{sel.name}</div>
            <div style={{fontSize:9,color:"#4b6280"}}>{[sel.city&&(sel.city+(sel.state?", "+sel.state:"")),sel.contact,sel.title].filter(Boolean).join(" - ")}</div>
            <div style={{fontSize:9,color:"#253352"}}>{[sel.phone,sel.email].filter(Boolean).join(" - ")}</div>
          </div>
          <button className="btn bDel" style={{fontSize:10,padding:"6px 14px"}} onClick={()=>onDelete(sel.id,sel.name)}>Delete</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:9}}>
          <div>
            <div className="fl">Sequence Status</div>
            <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",marginBottom:4}}>
              <span className="badge" style={{background:enrStatusBg(selEnr?.status||""),color:enrStatusColor(selEnr?.status||""),fontSize:10,padding:"3px 10px"}}>{selEnr?.status||"not enrolled"}</span>
            </div>
            {selEnr&&steps.length>0&&<div><div className="pb"><div className="pf" style={{width:p3+"%"}}/></div><div style={{fontSize:8,color:"#3d5070",marginTop:2}}>Step {((selEnr.stepIndex||0)+1)+"/"+(steps.length)}</div></div>}
          </div>
          <div>
            <div className="fl">Sequence</div>
            <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
              {selSeq&&<><span style={{width:6,height:6,borderRadius:"50%",background:selSeq.color,flexShrink:0,display:"inline-block"}}/><span style={{fontSize:9,color:selSeq.color}}>{selSeq.name}</span></>}
              {!selSeq&&<span style={{fontSize:9,color:"#3d5070"}}>-</span>}
            </div>
            {selEnr?.lastDisposition&&<div style={{marginTop:4}}><span style={{padding:"2px 8px",borderRadius:8,fontSize:8,background:(DISP_MAP[selEnr.lastDisposition]?.color||"#4b6280")+"18",color:DISP_MAP[selEnr.lastDisposition]?.color||"#4b6280"}}>{(DISP_MAP[selEnr.lastDisposition]?.icon||"")+" "+(DISP_MAP[selEnr.lastDisposition]?.label||selEnr.lastDisposition)}</span></div>}
          </div>
        </div>
        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
          {selEnr?.status==="active"&&<button className="btn bOr" style={{fontSize:9}} onClick={()=>onPause(selEnr.id)}>⏸ Pause</button>}
          {selEnr?.status==="paused"&&!selEnr.pendingTask&&<button className="btn bGr" style={{fontSize:9}} onClick={()=>onResume(selEnr.id)}>▶ Resume</button>}
          {selEnr?.status==="failed"&&<button className="btn bAI" style={{fontSize:9}} onClick={()=>onRetry(selEnr.id)}>[retry] Retry</button>}
          {selEnr&&(selEnr.status==="active"||selEnr.status==="paused"||selEnr.status==="failed")&&<button className="btn bR" style={{fontSize:9}} onClick={()=>onStop(sel.id,"Manual stop")}>x Stop</button>}
          {selEnr?.status==="paused"&&selEnr.pendingTask&&<button className="btn bAct" style={{fontSize:9}} onClick={()=>onLogOutcome(selEnr,sel,selSeq,selEnr.pendingTask)}>[log] Log Outcome</button>}
        </div>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
        {[["overview","Overview"],["timeline","Sequence"],["activity","Activity"],["history","History"]].map(([v,l])=>(
          <button key={v} className={"ctab"+(cardTab===v?" on":"")} onClick={()=>setCardTab(v)}>{l}</button>
        ))}
      </div>
      {cardTab==="overview"&&(
        <><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
          <div className="card" style={{padding:13}}>
            <div style={{fontSize:8,color:"#3d5070",letterSpacing:"2px",textTransform:"uppercase",marginBottom:9}}>Current Task</div>
            {hasTask?(
              <div style={{background:"#080f1c",border:"1px solid #1a1000",borderRadius:7,padding:10}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
                  <span style={{fontSize:20}}>{STM[selEnr.pendingTask.stepType]?.icon||"📋"}</span>
                  <div><div style={{fontSize:11,color:STM[selEnr.pendingTask.stepType]?.color||"#dde4ef"}}>{selEnr.pendingTask.stepLabel}</div><div style={{fontSize:8,color:"#3d5070"}}>Due: {fmtDT(selEnr.pendingTask.dueAt)}</div></div>
                </div>
                <button className="btn bAct" style={{fontSize:9,width:"100%",justifyContent:"center"}} onClick={()=>onLogOutcome(selEnr,sel,selSeq,selEnr.pendingTask)}>[log] Log Outcome</button>
              </div>
            ):selEnr?(
              <div style={{fontSize:10,color:"#3d5070",padding:"12px 0",textAlign:"center"}}>
                {isScheduledFuture
                  ?<><div style={{fontSize:12,color:"#60a5fa",marginBottom:4}}>[date] Scheduled</div><div style={{fontSize:9}}>Starts {fmtDT(selEnr.nextRunAt)}</div></>
                  :<><div style={{fontSize:12,color:"#4b6280",marginBottom:4}}>[wait] Processing</div><div style={{fontSize:9}}>{selEnr.status==="finished"?"Sequence complete":"Next task generating…"}</div></>}
              </div>
            ):<div style={{color:"#3d5070",fontSize:10,textAlign:"center",padding:"12px 0"}}>Not enrolled</div>}
          </div>
          <div className="card" style={{padding:13}}>
            <div style={{fontSize:8,color:"#3d5070",letterSpacing:"2px",textTransform:"uppercase",marginBottom:9}}>Enroll / Switch</div>
            <button className="btn bAct" style={{width:"100%",justifyContent:"center",marginBottom:8,fontSize:10}} onClick={()=>setEnrollModal(true)}>
              {selEnr ? "Switch / Re-enroll..." : "Enroll in Sequence..."}
            </button>
            <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap"}}>
              {selEnr?.status==="active"&&<button className="btn bOr" style={{fontSize:9}} onClick={()=>onPause(selEnr.id)}>Pause</button>}
              {selEnr?.status==="paused"&&!selEnr.pendingTask&&<button className="btn bGr" style={{fontSize:9}} onClick={()=>onResume(selEnr.id)}>▶ Resume</button>}
              {selEnr?.status==="failed"&&<button className="btn bAI" style={{fontSize:9}} onClick={()=>onRetry(selEnr.id)}>Retry</button>}
              {selEnr&&(selEnr.status==="active"||selEnr.status==="paused"||selEnr.status==="failed")&&<button className="btn bR" style={{fontSize:9}} onClick={()=>onStop(sel.id,"Manual stop")}>Stop</button>}
            </div>
          </div>
        </div>
        <div className="card" style={{padding:13,marginTop:11}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:aiIntel?10:0}}>
            <div style={{fontSize:8,color:"#818cf8",letterSpacing:"2px",textTransform:"uppercase"}}>✦ AI Intel</div>
            <button className="btn bAI" style={{fontSize:9,padding:"3px 10px"}} onClick={runAiIntel} disabled={aiLoading}>
              {aiLoading?"Generating…":"Generate Intel"}
            </button>
          </div>
          {aiError&&<div style={{fontSize:9,color:"#f87171",marginTop:6}}>{aiError}</div>}
          {aiLoading&&<div style={{padding:"18px 0",textAlign:"center",fontSize:10,color:"#3d5070"}}>
            <div style={{marginBottom:6,fontSize:18}}>✦</div>Researching {sel.name}...
          </div>}
          {aiIntel&&!aiLoading&&(
            <div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:8,color:"#3d5070",textTransform:"uppercase",letterSpacing:"1px",marginBottom:6}}>Pain Points</div>
                {aiIntel.painPoints?.map((pp,i)=>{
                  const [label,...rest]=pp.split(":");
                  return(
                    <div key={i} style={{display:"flex",gap:7,alignItems:"flex-start",marginBottom:5}}>
                      <span style={{fontSize:8,color:"#818cf8",background:"#0c0c28",border:"1px solid #3730a3",padding:"1px 6px",borderRadius:5,whiteSpace:"nowrap",marginTop:1}}>{label?.trim()}</span>
                      <span style={{fontSize:9,color:"#94a3b8",lineHeight:1.5}}>{rest.join(":").trim()}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                <div style={{background:"#080f1c",border:"1px solid #1e3a5f",borderRadius:7,padding:"9px 11px"}}>
                  <div style={{fontSize:8,color:"#60a5fa",textTransform:"uppercase",letterSpacing:"1px",marginBottom:4}}>Best Angle</div>
                  <div style={{fontSize:9,color:"#dde4ef",lineHeight:1.5}}>{aiIntel.talkingPoint}</div>
                </div>
                <div style={{background:"#080f1c",border:"1px solid #1e3a5f",borderRadius:7,padding:"9px 11px"}}>
                  <div style={{fontSize:8,color:"#60a5fa",textTransform:"uppercase",letterSpacing:"1px",marginBottom:4}}>Opening Question</div>
                  <div style={{fontSize:9,color:"#dde4ef",lineHeight:1.5,fontStyle:"italic"}}>"{aiIntel.openingQuestion}"</div>
                </div>
              </div>
              <div style={{fontSize:8,color:"#3d5070",textTransform:"uppercase",letterSpacing:"1px",marginBottom:7}}>Email Ideas</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {aiIntel.emails?.map((em,i)=>(
                  <div key={i} style={{background:"#07090f",border:"1px solid #101928",borderRadius:7,padding:"9px 12px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                      <span style={{fontSize:8,color:"#818cf8",background:"#0c0c28",border:"1px solid #3730a3",padding:"1px 7px",borderRadius:5}}>{em.label}</span>
                      <button onClick={()=>navigator.clipboard?.writeText(em.body)} style={{padding:"1px 7px",borderRadius:4,border:"1px solid #1e2d45",background:"transparent",color:"#3d5070",cursor:"pointer",fontSize:8,fontFamily:"inherit"}}>Copy</button>
                    </div>
                    <div style={{fontSize:9,color:"#94a3b8",lineHeight:1.7}}>{em.body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!aiIntel&&!aiLoading&&!aiError&&<div style={{fontSize:9,color:"#253352",padding:"8px 0"}}>Generate prospect-specific pain points, talking angles, and ready-to-send email ideas.</div>}
        </div>
      </>)}
      {cardTab==="timeline"&&(
        <div className="card" style={{padding:13}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:8,color:"#3d5070",letterSpacing:"2px",textTransform:"uppercase"}}>Timeline</div>
            {doneSteps.length>0&&<button className="btn bg" style={{fontSize:8,padding:"2px 7px"}} onClick={()=>setShowDone(v=>!v)}>{showDone?"Hide done":"Show "+doneSteps.length+" done"}</button>}
          </div>
          {!selEnr&&<div style={{textAlign:"center",padding:"20px 0",color:"#3d5070",fontSize:10}}>Not enrolled.</div>}
          {selEnr&&showDone&&doneSteps.map((step,i)=>(
            <div key={i} className="sc done"><div style={{display:"flex",alignItems:"center",gap:7}}><span style={{fontSize:11}}>[done]</span><div><div style={{fontSize:9,color:"#253352"}}>{step.label}</div><div style={{fontSize:8,color:"#1e2d45"}}>D{step.day}</div></div></div></div>
          ))}
          {selEnr&&upcoming.map((step,ii)=>{
            const isCurr=ii===0;const ti=STM[step.type]||{icon:"📋",color:"#4b6280"};
            const hasPending=isCurr&&selEnr.status==="paused"&&selEnr.pendingTask;
            // project due date: current nextRunAt for step 0, roll forward by delayDays for later steps
            const projectedDue=(()=>{
              if(isCurr)return selEnr.nextRunAt;
              let base=new Date(selEnr.nextRunAt||nowISO());
              for(let i=1;i<=ii;i++)base.setDate(base.getDate()+(upcoming[i]?.delayDays||1));
              return base.toISOString();
            })();
            return(
              <div key={ii} className={"sc"+(isCurr?" curr":"")}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:7}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,flex:1,minWidth:0}}>
                    <span style={{fontSize:13,flexShrink:0}}>{ti.icon}</span>
                    <div>
                      <div style={{fontSize:10,color:ti.color,display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                        {step.label}
                        {isCurr&&<span style={{fontSize:7,background:"#f97316",color:"#fff",padding:"1px 5px",borderRadius:5}}>NOW</span>}
                        {hasPending&&<span style={{fontSize:7,background:"#fbbf24",color:"#000",padding:"1px 5px",borderRadius:5}}>TASK</span>}
                        {isCurr&&isScheduledFuture&&<span style={{fontSize:7,background:"#1e3a5f",color:"#60a5fa",padding:"1px 5px",borderRadius:5}}>SCHEDULED</span>}
                      </div>
                      <div style={{fontSize:8,color:"#253352",display:"flex",gap:8}}>
                        <span>D{step.day} - +{step.delayDays}d</span>
                        <span style={{color:"#334155"}}>[date] {fmtDT(projectedDue)}</span>
                      </div>
                    </div>
                  </div>
                  {isCurr&&hasPending&&<button className="btn bAct" style={{fontSize:9,flexShrink:0}} onClick={()=>onLogOutcome(selEnr,sel,selSeq,selEnr.pendingTask)}>Log</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {cardTab==="activity"&&(
        <div className="card" style={{padding:13}}>
          <div style={{fontSize:8,color:"#3d5070",letterSpacing:"2px",textTransform:"uppercase",marginBottom:10}}>Activity</div>
          {acts.length===0&&<div style={{color:"#3d5070",fontSize:11,padding:"10px 0"}}>No activity yet.</div>}
          {acts.map(a=>{
            const dk=a.meta?.dispKey;const disp=dk?DISP_MAP[dk]:null;
            return(
              <div key={a.id} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"5px 0",borderBottom:"1px solid #0a0f1a"}}>
                <span style={{fontSize:14,flexShrink:0}}>{ACT_ICON[a.type]||"."}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,color:"#b8c5d8",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    {a.text}
                    {disp&&<span style={{padding:"2px 8px",borderRadius:8,fontSize:9,background:disp.color+"18",color:disp.color}}>{disp.icon+" "+disp.label+" →"}</span>}
                  </div>
                  <div style={{fontSize:9,color:"#3d5070",marginTop:1}}>{fmtDT(a.ts)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {cardTab==="history"&&(
        <div className="card" style={{padding:13}}>
          <div style={{fontSize:8,color:"#3d5070",letterSpacing:"2px",textTransform:"uppercase",marginBottom:10}}>Enrollment History</div>
          {enrHistory.length===0?<div style={{color:"#3d5070",fontSize:10,textAlign:"center",padding:"20px 0"}}>No history.</div>:enrHistory.map(enr=>{
            const sq=sequences.find(s=>s.id===enr.sequenceId);const isOpen=enr.status==="active"||enr.status==="paused"||enr.status==="failed";const ld=enr.lastDisposition?DISP_MAP[enr.lastDisposition]:null;
            return(
              <div key={enr.id} className={"sh-row"+(isOpen?" open":"")}>
                <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                  <span style={{width:7,height:7,borderRadius:"50%",background:sq?.color||"#334155",flexShrink:0,marginTop:3,display:"inline-block"}}/>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
                      <span style={{fontSize:11,color:isOpen?"#dde4ef":"#4b6280",fontWeight:"500"}}>{sq?.name||enr.sequenceId}</span>
                      <span className="badge" style={{background:enrStatusBg(enr.status),color:enrStatusColor(enr.status)}}>{enr.status}</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,fontSize:9,marginBottom:4}}>
                      <div><span style={{color:"#3d5070"}}>Enrolled: </span><span style={{color:"#64748b"}}>{fmtD(enr.enrolledAt)}</span></div>
                      <div><span style={{color:"#3d5070"}}>Starts: </span><span style={{color:"#60a5fa"}}>{enr.scheduledStartAt?fmtDT(enr.scheduledStartAt):"Immediately"}</span></div>
                      <div><span style={{color:"#3d5070"}}>Exit: </span><span style={{color:"#64748b"}}>{enr.exitReason||"-"}</span></div>
                    </div>
                    {ld&&<span style={{padding:"2px 8px",borderRadius:8,fontSize:8,background:ld.color+"18",color:ld.color}}>{ld.icon+" "+ld.label}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {enrollModal && (
        <SingleEnrollModal
          prospect={sel}
          sequences={sequences}
          currentEnrSeqId={selEnr?.sequenceId}
          onClose={() => setEnrollModal(false)}
          onConfirm={(seqId, scheduledStartISO) => {
            onEnroll(sel.id, seqId, "single", 0, scheduledStartISO);
            setEnrollModal(false);
          }}
        />
      )}
    </div>
  );
}

function TaskCard({item,selectable,queueBulkSel,setQueueBulkSel,setSelId,setTab,skipTask,setTaskModal}){
  const{e,p,seq,task,bucket}=item;
  const ti=STM[task.stepType]||{icon:"📋",color:"#4b6280",label:task.stepType};
  const urg=urgency(task.dueAt||e.nextRunAt);
  const overdueDays=task.dueAt?Math.max(0,-dayDiff(task.dueAt.split("T")[0])):0;
  const isSel=queueBulkSel.has(e.id);
  const lastDisp=e.lastDisposition?DISP_MAP[e.lastDisposition]:null;
  const retryCount=task.retryCount||0;
  return(
    <div className={"tc "+bucket+(isSel?" selected":"")} style={{borderLeft:"3px solid "+ti.color}}>
      <div style={{display:"grid",gridTemplateColumns:selectable?"auto auto 1fr auto":"auto 1fr auto",gap:10,alignItems:"center"}}>
        {selectable&&<input type="checkbox" style={{width:13,height:13,accentColor:"#8b5cf6",cursor:"pointer",flexShrink:0}} checked={isSel} onChange={()=>setQueueBulkSel(prev=>{const n=new Set(prev);n.has(e.id)?n.delete(e.id):n.add(e.id);return n;})}/>}
        <span style={{fontSize:22}}>{ti.icon}</span>
        <div style={{minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:2}}>
            <span style={{fontSize:12,fontWeight:"500",cursor:"pointer",color:"#dde4ef"}} onClick={()=>{setSelId(p.id);setTab("prospects");}}>{p.name}</span>
            <span style={{fontSize:8,background:ti.color+"22",color:ti.color,padding:"1px 6px",borderRadius:8}}>{ti.label}</span>
            {bucket==="overdue"&&<span style={{fontSize:8,background:"#7f1d1d",color:"#f87171",padding:"1px 6px",borderRadius:8}}>[time] {overdueDays}d overdue</span>}
            {retryCount>0&&<span style={{fontSize:8,background:"#1a1000",color:"#fbbf24",padding:"1px 6px",borderRadius:8}}>[retry] retry {retryCount}</span>}
          </div>
          <div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>{task.stepLabel}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            {seq&&<span style={{fontSize:9,color:seq.color,display:"flex",alignItems:"center",gap:3}}><span style={{width:5,height:5,borderRadius:"50%",background:seq.color,display:"inline-block"}}/>{seq.name}</span>}
            <span style={{fontSize:9,color:"#3d5070"}}>Step {(e.stepIndex||0)+1}/{seq?.steps?.length||"?"}</span>
            <span style={{fontSize:9,color:urg.col}}>{urg.label}</span>
            <span style={{fontSize:9,color:"#253352"}}>- {fmtDT(task.dueAt||e.nextRunAt)}</span>
          </div>
          {lastDisp&&<div style={{marginTop:4,display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:8,color:"#3d5070"}}>Last:</span><span style={{padding:"2px 8px",borderRadius:8,fontSize:8,background:lastDisp.color+"18",color:lastDisp.color}}>{lastDisp.icon+" "+lastDisp.label}</span></div>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end",flexShrink:0}}>
          <button className="btn bAct" style={{fontSize:9}} onClick={()=>setTaskModal({e,p,seq,task})}>Log Outcome</button>
          <button className="btn bg" style={{fontSize:9,color:"#64748b"}} onClick={()=>skipTask(e.id)}>Skip</button>
        </div>
      </div>
      {task.script&&<div style={{marginTop:8,padding:"7px 10px",background:"#080f1c",borderRadius:6,border:"1px solid #101928",fontSize:9,color:"#64748b",lineHeight:1.7}}>{task.script.slice(0,140)}{task.script.length>140?"...":""}</div>}
    </div>
  );
}

// -- MAIN APP ------------------------------------------------------------------
export default function App(){
  const [prospects,setProspects]=useState([]);
  const [sequences,setSequences]=useState([]);
  const [enrollments,setEnrollments]=useState([]);
  const [activities,setActivities]=useState({});
  const [settings,setSettings]=useState(DEFAULT_WH);
  const [savedViews,setSavedViews]=useState([]);
  const [loaded,setLoaded]=useState(false);
  const [tab,setTab]=useState("queue");
  const [selId,setSelId]=useState(null);
  const [seqEditor,setSeqEditor]=useState(null);
  const [queueBucket,setQueueBucket]=useState("today_overdue");
  const [queueSeqF,setQueueSeqF]=useState("All");
  const [queueTypeF,setQueueTypeF]=useState("All");
  const [queueSearch,setQueueSearch]=useState("");
  const [queueBulkSel,setQueueBulkSel]=useState(new Set());
  const [bulkOutModal,setBulkOutModal]=useState(false);
  const [bulkSkipConf,setBulkSkipConf]=useState(false);
  const [search,setSearch]=useState("");
  const [stF,setStF]=useState("All");
  const [sqF,setSqF]=useState("All");
  const [enrF,setEnrF]=useState("All");
  const [activeView,setActiveView]=useState(null);
  const [bulkMode,setBulkMode]=useState(false);
  const [bulkSel,setBulkSel]=useState(new Set());
  const [bulkStartModal,setBulkStartModal]=useState(false);
  const [bulkSwitchModal,setBulkSwitchModal]=useState(false);
  const [bulkRemoveModal,setBulkRemoveModal]=useState(false);
  const [bulkStatusModal,setBulkStatusModal]=useState(false);
  const [addModal,setAddModal]=useState(false);
  const [addForm,setAddForm]=useState(BLANK);
  const [pushModal,setPushModal]=useState(null);
  const [taskModal,setTaskModal]=useState(null);
  const [saveViewModal,setSaveViewModal]=useState(false);
  const [newViewName,setNewViewName]=useState("");
  const [rptView,setRptView]=useState("sequences");
  const [rptDrilldown,setRptDrilldown]=useState(null);
  const [crmRecords,setCrmRecords]=useState([]);
  const [crmModal,setCrmModal]=useState(null);
  const [crmEditId,setCrmEditId]=useState(null);
  const [crmSearch,setCrmSearch]=useState("");
  const [crmStatusF,setCrmStatusF]=useState("All");
  const [crmTypeF,setCrmTypeF]=useState("All");
  const [crmCompF,setCrmCompF]=useState("All");
  const [crmSort,setCrmSort]=useState("followup");
  const [crmLoading,setCrmLoading]=useState(false);
  const [crmError,setCrmError]=useState<string|null>(null);
  const BLANK_CRM={agencyName:"",contactName:"",contactTitle:"",phone:"",email:"",agencyType:"EI",competitor:"Unknown",competitorCustom:"",crmStatus:"New",lastContact:"",nextFollowup:"",notes:""};
  const [toast,setToast]=useState(null);
  const [saving,setSaving]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [importPrev,setImportPrev]=useState(null);
  const [userName,setUserName]=useState("");
  const fileRef=useRef();const tickRef=useRef(false);const runTickRef=useRef(null);

  useEffect(()=>{
    Promise.all([
      sbFetch("prospects?order=created_at.asc"),
      sbFetch("sequences?order=created_at.asc"),
      sbFetch("enrollments?order=enrolled_at.asc"),
      sbFetch("activities?order=ts.asc"),
      sbFetch("crm_records?order=created_at.asc"),
      S.load(KEYS.cfg),
      S.load(KEYS.sv),
    ]).then(([pd,sd,ed,ad,crmd,cfg,sv])=>{
      // Prospects
      if(pd&&Array.isArray(pd)&&pd.length>0){
        setProspects(pd.map(prospectFromRow));
      }
      // Sequences
      if(sd&&Array.isArray(sd)&&sd.length>0){
        const loaded=sd.map(seqFromRow);
        const fixed=loaded.map(seq=>{
          const bi=BUILTIN.find(b=>b.name===seq.name);
          if(!bi||!seq.builtIn)return seq;
          const fresh=bsToSteps(bi.steps);
          const needsUpdate=seq.steps.some((s:any,i:number)=>s.delayDays!==fresh[i]?.delayDays);
          if(!needsUpdate)return seq;
          return{...seq,steps:fresh};
        });
        setSequences(fixed);
      } else {
        const s=BUILTIN.map(seqToStore);
        setSequences(s);
        sbSaveSequences(s).catch(console.warn);
      }
      // Enrollments
      if(ed&&Array.isArray(ed))setEnrollments(ed.map(enrFromRow));
      // Activities - rebuild object keyed by prospectId
      if(ad&&Array.isArray(ad)){
        const actMap:any={};
        ad.forEach((r:any)=>{
          const a=actFromRow(r);
          if(!actMap[a.prospectId])actMap[a.prospectId]=[];
          actMap[a.prospectId].unshift(a);
        });
        setActivities(actMap);
      }
      // CRM
      if(crmd&&Array.isArray(crmd))setCrmRecords(crmd.map(fromRow));
      // Local-only settings
      if(cfg)setSettings(cfg);
      if(sv&&Array.isArray(sv))setSavedViews(sv);
      setLoaded(true);
    }).catch(e=>{console.error("Load failed",e);setLoaded(true);});
  },[]);

  const flash=(m:any,t="ok")=>{setToast({m,t});setTimeout(()=>setToast(null),3000);};
  const upd=useCallback((id:string,patch:any)=>{
    setProspects(prev=>{
      const next=prev.map((p:any)=>p.id===id?{...p,...patch}:p);
      setSaving(true);
      const updated=next.find((p:any)=>p.id===id);
      if(updated)sbFetch("prospects?id=eq."+id,{method:"PATCH",body:JSON.stringify(prospectToRow(updated))}).finally(()=>setSaving(false));
      return next;
    });
  },[]);
  const setP=useCallback((fn:any)=>{
    setProspects(prev=>{
      const next=typeof fn==="function"?fn(prev):fn;
      setSaving(true);
      sbSaveProspects(next).finally(()=>setSaving(false));
      return next;
    });
  },[]);
  const saveEnr=useCallback(async(arr:any[])=>{
    setEnrollments(arr);
    await sbSaveEnrollments(arr);
  },[]);
  const logAct=useCallback((pid:string,obj:any)=>{
    const entry={id:uid(),prospectId:pid,ts:nowISO(),userName,meta:{},...obj};
    setActivities((prev:any)=>{
      const next={...prev,[pid]:[entry,...(prev[pid]||[]).slice(0,99)]};
      return next;
    });
    sbLogActivity(entry);
  },[userName]);

  const runTick=useCallback(async(enrOverride)=>{
    if(tickRef.current&&!enrOverride)return;tickRef.current=true;
    try{
      let copy=[...(enrOverride||enrollments)];
      const pMap=Object.fromEntries(prospects.map(p=>[p.id,p]));
      const seqMap=Object.fromEntries(sequences.map(s=>[s.id,s]));
      let changed=false;const pUpdates={};
      copy=copy.map(enr=>{
        const p=pMap[enr.prospectId];const seq=seqMap[enr.sequenceId];if(!p||!seq)return enr;
        const rule=evalRulesets(seq.rulesets||[],enr,p.prospectStatus);
        if(rule){changed=true;logAct(enr.prospectId,{type:"rule_triggered",text:"Rule: "+rule.trigger+" > "+rule.action,meta:{seqId:enr.sequenceId}});
          if(rule.action==="stop")return{...enr,status:"removed",exitReason:"Rule: "+rule.trigger,finishedAt:nowISO(),pendingTask:null};
          if(rule.action==="pause")return{...enr,status:"paused",pausedAt:nowISO()};
          if(rule.action==="mark_status"&&rule.actionTarget)pUpdates[enr.prospectId]={prospectStatus:rule.actionTarget};
          if(rule.action==="move_seq"&&rule.actionTarget)return{...enr,status:"removed",exitReason:"Rule: move",finishedAt:nowISO(),pendingTask:null};
        }
        if(enr.status!=="active")return enr;
        const result=tickEnrollment(enr,p.prospectStatus,seq.steps,settings);
        if(!result)return enr;changed=true;logAct(enr.prospectId,{...result.activity});return result.updatedEnrollment;
      });
      if(Object.keys(pUpdates).length)setP(prev=>prev.map(p=>pUpdates[p.id]?{...p,...pUpdates[p.id]}:p));
      if(changed)await saveEnr(copy);
    }finally{tickRef.current=false;}
  },[enrollments,prospects,sequences,settings,saveEnr,logAct,setP]);

  useEffect(()=>{runTickRef.current=runTick;},[runTick]);

  useEffect(()=>{
    if(!loaded)return;
    runTickRef.current();
    const t1=setTimeout(()=>runTickRef.current(),1500);
    const t2=setInterval(()=>runTickRef.current(),30000);
    return()=>{clearTimeout(t1);clearInterval(t2);};
  },[loaded]);

  // -- ENROLL (single) - now accepts scheduledStartISO ----------------------
  const enrollProspect=useCallback(async(pid,seqId,source="single",startStep=0,scheduledStartISO=null)=>{
    const seq=sequences.find(s=>s.id===seqId||s.name===seqId);if(!seq){flash("Sequence not found","err");return;}
    const existing=enrollments.filter(e=>e.prospectId===pid&&(e.status==="active"||e.status==="paused"||e.status==="failed"));
    const closed=existing.map(e=>({...e,status:"removed",exitReason:"Moved",finishedAt:nowISO()}));
    existing.forEach(e=>logAct(pid,{type:"sequence_removed",text:"Closed - new enrollment",meta:{seqId:e.sequenceId}}));
    const newEnr=createEnrollment(pid,seq.id,seq.version||1,seq.steps,settings,source,startStep,scheduledStartISO);
    if(!newEnr)return;
    const updated=[...enrollments.filter(e=>!existing.find(x=>x.id===e.id)),...closed,newEnr];
    await saveEnr(updated);
    logAct(pid,{
      type:source==="bulk"?"bulk_enrolled":"enrolled",
      text:"Enrolled: "+seq.name+(scheduledStartISO?" (starts "+fmtDT(scheduledStartISO)+")":""),
      meta:{seqId:seq.id,source,scheduledStartAt:scheduledStartISO}
    });
    runTickRef.current(updated);
    setTimeout(()=>runTickRef.current(),800);
  },[sequences,enrollments,settings,saveEnr,logAct]);

  // -- BULK START - now passes scheduledStartISO into createEnrollment -------
  const handleBulkStart=useCallback(async(seqId,startStep,rows,scheduledStartISO)=>{
    const seq=sequences.find(s=>s.id===seqId);if(!seq){flash("Sequence not found","err");return;}
    const toEnroll=rows.filter(r=>!r.alreadyIn).map(r=>r.p.id);
    if(!toEnroll.length)return;
    let updatedEnr=[...enrollments];
    const now=nowISO();
    for(const pid of toEnroll){
      const existing=updatedEnr.filter(e=>e.prospectId===pid&&(e.status==="active"||e.status==="paused"||e.status==="failed"));
      existing.forEach(e=>logAct(pid,{type:"sequence_removed",text:"Closed - new enrollment",meta:{seqId:e.sequenceId}}));
      updatedEnr=updatedEnr.map(e=>existing.find(x=>x.id===e.id)?{...e,status:"removed",exitReason:"Moved",finishedAt:now}:e);
      // KEY CHANGE: use createEnrollment with scheduledStartISO instead of manual nextRunAt calc
      const newEnr=createEnrollment(pid,seq.id,seq.version||1,seq.steps,settings,"bulk",startStep||0,scheduledStartISO);
      if(newEnr)updatedEnr=[...updatedEnr,newEnr];
      logAct(pid,{
        type:"bulk_enrolled",
        text:"Enrolled: "+seq.name+(scheduledStartISO?" (starts "+fmtDT(scheduledStartISO)+")":""),
        meta:{seqId:seq.id,scheduledStartAt:scheduledStartISO}
      });
    }
    await saveEnr(updatedEnr);
    setBulkStartModal(false);setBulkSel(new Set());setBulkMode(false);
    flash("Enrolled "+toEnroll.length+(scheduledStartISO?" - scheduled for "+fmtDT(scheduledStartISO):""));
    runTickRef.current(updatedEnr);
    setTimeout(()=>runTickRef.current(),800);
  },[sequences,enrollments,settings,saveEnr,logAct]);

  // -- BULK SWITCH - also carries scheduledStartISO --------------------------
  const handleBulkSwitch=useCallback(async(seqId,startStep,scheduledStartISO)=>{
    const seq=sequences.find(s=>s.id===seqId);if(!seq){flash("Sequence not found","err");return;}
    const ids=[...bulkSel];
    let updatedEnr=[...enrollments];
    const now=nowISO();
    for(const pid of ids){
      const existing=updatedEnr.filter(e=>e.prospectId===pid&&(e.status==="active"||e.status==="paused"||e.status==="failed"));
      existing.forEach(e=>logAct(pid,{type:"sequence_removed",text:"Closed - switched",meta:{seqId:e.sequenceId}}));
      updatedEnr=updatedEnr.map(e=>existing.find(x=>x.id===e.id)?{...e,status:"removed",exitReason:"Switched",finishedAt:now}:e);
      const newEnr=createEnrollment(pid,seq.id,seq.version||1,seq.steps,settings,"bulk",startStep||0,scheduledStartISO);
      if(newEnr)updatedEnr=[...updatedEnr,newEnr];
      logAct(pid,{type:"bulk_enrolled",text:"Switched to: "+seq.name,meta:{seqId:seq.id}});
    }
    await saveEnr(updatedEnr);
    setBulkSwitchModal(false);setBulkSel(new Set());setBulkMode(false);
    flash("Switched "+ids.length+" to "+seq.name);
    runTickRef.current(updatedEnr);
  },[bulkSel,sequences,enrollments,settings,saveEnr,logAct]);

  const handleBulkRemove=useCallback(async(prospectIds,newStatus)=>{
    const updated=enrollments.map(e=>{if(!prospectIds.includes(e.prospectId))return e;if(e.status==="active"||e.status==="paused"||e.status==="failed")return{...e,status:"removed",exitReason:"Bulk removed",finishedAt:nowISO(),pendingTask:null};return e;});
    await saveEnr(updated);
    prospectIds.forEach(id=>logAct(id,{type:"sequence_removed",text:"Removed - bulk",meta:{}}));
    if(newStatus){setP(prev=>prev.map(p=>prospectIds.includes(p.id)?{...p,prospectStatus:newStatus}:p));}
    setBulkRemoveModal(false);setBulkSel(new Set());setBulkMode(false);flash("Removed "+prospectIds.length,"warn");
  },[enrollments,saveEnr,logAct,setP]);

  const handleBulkStatus=useCallback(status=>{
    const ids=[...bulkSel];
    setP(prev=>prev.map(p=>ids.includes(p.id)?{...p,prospectStatus:status}:p));
    ids.forEach(id=>logAct(id,{type:"status_change",text:"Status > "+status+" (bulk)",meta:{status}}));
    setBulkStatusModal(false);setBulkSel(new Set());setBulkMode(false);flash("Status > "+status);
  },[bulkSel,setP,logAct]);

  const logDisposition=useCallback(async(enrollmentId,dispKey,note)=>{
    const enr=enrollments.find(e=>e.id===enrollmentId);if(!enr||!enr.pendingTask)return;
    const seq=sequences.find(s=>s.id===enr.sequenceId);if(!seq)return;
    const result=resolveWithDisposition(enr,enr.pendingTask,seq.steps,settings,dispKey,note);if(!result)return;
    const freshEnr=enrollments.map(e=>e.id===enrollmentId?result.updatedEnrollment:e);
    await saveEnr(freshEnr);
    result.events.forEach(ev=>logAct(enr.prospectId,{...ev}));
    if(result.prospectStatusUpdate){upd(enr.prospectId,{prospectStatus:result.prospectStatusUpdate});logAct(enr.prospectId,{type:"status_change",text:"Status > "+result.prospectStatusUpdate,meta:{status:result.prospectStatusUpdate}});}
    setTaskModal(null);flash(`${DISP_MAP[dispKey]?.icon||""} ${DISP_MAP[dispKey]?.label||"Logged"}`);
    // Pass freshEnr as enrOverride - bypasses the tickRef mutex so the next task always materializes immediately
    runTickRef.current(freshEnr);
  },[enrollments,sequences,settings,saveEnr,logAct,upd]);

  const bulkLogDisposition=useCallback(async(dispKey,note)=>{
    const ids=[...queueBulkSel];for(const id of ids)await logDisposition(id,dispKey,note);
    setQueueBulkSel(new Set());setBulkOutModal(false);flash("Logged "+ids.length);
  },[queueBulkSel,logDisposition]);

  const skipTask=useCallback(async(enrollmentId)=>{
    const enr=enrollments.find(e=>e.id===enrollmentId);if(!enr||!enr.pendingTask)return;
    const seq=sequences.find(s=>s.id===enr.sequenceId);if(!seq)return;
    const step=seq.steps[enr.stepIndex];const nextIdx=enr.stepIndex+1;const nextStep=seq.steps[nextIdx];const now=nowISO();
    const base={...enr,stepIndex:nextIdx,lastCompletedAt:now,pendingTask:null};
    const updated=!nextStep?{...base,status:"finished",exitReason:"Sequence complete",finishedAt:now}:{...base,status:"active",nextRunAt:calcNextStepDate(now,nextStep.delayDays??1,settings)};
    const advanced=enrollments.map(e=>e.id===enrollmentId?updated:e);
    await saveEnr(advanced);
    logAct(enr.prospectId,{type:"task_skipped",text:"[skip] Skipped: "+(step?.label||"step"),meta:{seqId:enr.sequenceId,stepIndex:enr.stepIndex}});
    flash("Skipped");runTickRef.current(advanced);
  },[enrollments,sequences,settings,saveEnr,logAct]);

  const pauseEnrollment=useCallback(async(enrId)=>{
    const enr=enrollments.find(e=>e.id===enrId);if(!enr||enr.status!=="active")return;
    await saveEnr(enrollments.map(e=>e.id===enrId?{...e,status:"paused",pausedAt:nowISO()}:e));
    logAct(enr.prospectId,{type:"sequence_paused",text:"Paused",meta:{seqId:enr.sequenceId}});flash("Paused");
  },[enrollments,saveEnr,logAct]);

  const resumeEnrollment=useCallback(async(enrId)=>{
    const enr=enrollments.find(e=>e.id===enrId);if(!enr||enr.status!=="paused"||enr.pendingTask)return;
    const resumed=enrollments.map(e=>e.id===enrId?{...e,status:"active",pausedAt:null,exitReason:null}:e);
    await saveEnr(resumed);
    logAct(enr.prospectId,{type:"sequence_resumed",text:"Resumed",meta:{seqId:enr.sequenceId}});flash("Resumed");runTickRef.current(resumed);
  },[enrollments,saveEnr,logAct]);

  const retryFailed=useCallback(async(enrId)=>{
    const enr=enrollments.find(e=>e.id===enrId);if(!enr||enr.status!=="failed")return;
    const seq=sequences.find(s=>s.id===enr.sequenceId);if(!seq)return;
    const retried=enrollments.map(e=>e.id===enrId?retryEnrollment(enr,seq.steps,settings):e);
    await saveEnr(retried);
    logAct(enr.prospectId,{type:"retried",text:"Retried",meta:{seqId:enr.sequenceId}});flash("Retried");runTickRef.current(retried);
  },[enrollments,sequences,settings,saveEnr,logAct]);

  const stopEnrollments=useCallback(async(pid,reason)=>{
    const toStop=enrollments.filter(e=>e.prospectId===pid&&(e.status==="active"||e.status==="paused"||e.status==="failed"));if(!toStop.length)return;
    await saveEnr(enrollments.map(e=>toStop.find(x=>x.id===e.id)?{...e,status:"removed",exitReason:reason,finishedAt:nowISO(),pendingTask:null}:e));
    logAct(pid,{type:"sequence_removed",text:"Stopped - "+reason,meta:{reason}});
  },[enrollments,saveEnr,logAct]);

  const setStatus=useCallback(async(id,status)=>{
    upd(id,{prospectStatus:status});logAct(id,{type:"status_change",text:"Status > "+status,meta:{status}});
    if(STOP_STATUSES.has(status))await stopEnrollments(id,"Prospect status: "+status);flash("Status > "+status);
  },[upd,logAct,stopEnrollments]);

  const startTask=useCallback(async(enr,p,seq)=>{
    const step=seq?.steps?.[enr.stepIndex];if(!step)return;
    const task={id:uid(),enrollmentId:enr.id,prospectId:p.id,sequenceId:enr.sequenceId,sequenceVersion:enr.sequenceVersion,stepIndex:enr.stepIndex,stepId:step.id,stepType:step.type,stepLabel:step.label,script:step.script||"",dueAt:nowISO(),createdAt:nowISO(),completedAt:null,status:"pending",retryCount:0};
    await saveEnr(enrollments.map(e=>e.id===enr.id?{...e,status:"paused",pendingTask:task,nextRunAt:nowISO()}:e));
    logAct(p.id,{type:"task_created",text:"Task started: "+step.label,meta:{seqId:enr.sequenceId,stepIndex:enr.stepIndex,stepType:step.type}});
    setTaskModal({e:{...enr,status:"paused",pendingTask:task},p,seq,task});flash("Task ready");
  },[enrollments,saveEnr,logAct]);

  const publishSequence=useCallback(seq=>{
    const norm={...seq,steps:computeDays(seq.steps),version:(seq.version||1)+1};
    const isExisting=sequences.find(s=>s.id===seq.id);
    const activeCount=enrollments.filter(e=>(e.status==="active"||e.status==="paused")&&e.sequenceId===seq.id).length;
    if(isExisting&&activeCount>0)setPushModal({seq:norm,activeCount});else commitPublish(norm);
  },[sequences,enrollments]);

  const commitPublish=useCallback((seq:any)=>{
    setSequences(prev=>{const e=prev.find((s:any)=>s.id===seq.id);const next=e?prev.map((s:any)=>s.id===seq.id?seq:s):[...prev,seq];sbSaveSequences(next).catch(console.warn);return next;});
    setPushModal(null);setSeqEditor(null);flash("Published v"+seq.version+"!");
  },[]);

  const deleteSequence=useCallback((seqId:string)=>{
    if(enrollments.some((e:any)=>(e.status==="active"||e.status==="paused")&&e.sequenceId===seqId)){flash("Stop active enrollments first","err");return;}
    setSequences(prev=>{const next=prev.filter((s:any)=>s.id!==seqId);sbSaveSequences(next).catch(console.warn);return next;});flash("Deleted","warn");
  },[enrollments]);

  const saveCurrentView=useCallback(()=>{if(!newViewName.trim())return;const v={id:uid(),name:newViewName.trim(),filters:{stF,sqF,enrF,search}};const next=[...savedViews,v];setSavedViews(next);S.save(KEYS.sv,next);setSaveViewModal(false);setNewViewName("");setActiveView(v.id);flash("View saved");},[newViewName,stF,sqF,enrF,search,savedViews]);
  const loadView=useCallback((id:string)=>{const v=savedViews.find((x:any)=>x.id===id);if(!v)return;setStF(v.filters.stF||"All");setSqF(v.filters.sqF||"All");setEnrF(v.filters.enrF||"All");setSearch(v.filters.search||"");setActiveView(id);},[savedViews]);
  const deleteView=useCallback((id:string)=>{const next=savedViews.filter((v:any)=>v.id!==id);setSavedViews(next);S.save(KEYS.sv,next);if(activeView===id)setActiveView(null);},[savedViews,activeView]);

  const handleFile=async e=>{
    const file=e.target.files[0];if(!file)return;const text=await file.text();
    const lines=text.split("\n").filter(l=>l.trim());if(lines.length<2){flash("No rows","err");return;}
    const h=lines[0].split(",").map(x=>x.replace(/"/g,"").trim().toLowerCase());
    const fi=ks=>h.findIndex(x=>ks.some(k=>x.includes(k)));
    const c={name:fi(["agency","organization","name"]),city:fi(["city"]),state:fi(["state"]),contact:fi(["contact"]),title:fi(["title","position"]),phone:fi(["phone","tel"]),email:fi(["email"])};
    const rows=lines.slice(1).map(line=>{const v=line.match(/(".*?"|[^,]+)(?=,|$)/g)||[];const g=i=>i>=0?(v[i]||"").replace(/^"|"$/g,"").trim():"";return{name:g(c.name),city:g(c.city),state:g(c.state)||"PA",contact:g(c.contact),title:g(c.title),phone:g(c.phone),email:g(c.email)};}).filter(r=>r.name);
    if(!rows.length){flash("No data","err");return;}
    const existing=new Set(prospects.map(p=>p.name.toLowerCase().trim()));
    setImportPrev(rows.map(r=>({...r,isDupe:existing.has(r.name.toLowerCase().trim())})));e.target.value="";
  };
  const confirmImport=(rows:any[],skipDupes:boolean)=>{const toAdd=skipDupes?rows.filter((r:any)=>!r.isDupe):rows;setP((prev:any)=>[...prev,...toAdd.map((r:any)=>mkP(r))]);setImportPrev(null);flash("Imported "+toAdd.length);};

  const refreshCrm=useCallback(async()=>{
    setCrmLoading(true);setCrmError(null);
    try{const rows=await sbFetch("crm_records?order=created_at.asc");setCrmRecords(rows.map(fromRow));}
    catch(e:any){setCrmError("Could not load CRM: "+e.message);}
    finally{setCrmLoading(false);}
  },[]);

  useEffect(()=>{if(loaded)refreshCrm();},[loaded]);
  const getActiveEnr=useCallback((pid:string)=>enrollments.find((e:any)=>e.prospectId===pid&&(e.status==="active"||e.status==="paused"||e.status==="failed")),[enrollments]);

  const allTasks=useMemo(()=>{
    return enrollments.filter(e=>e.status==="paused"&&e.pendingTask).map(e=>{
      const p=prospects.find(x=>x.id===e.prospectId);if(!p)return null;
      const seq=sequences.find(s=>s.id===e.sequenceId);const task=e.pendingTask;
      const dueDate=new Date(task.dueAt||e.nextRunAt||new Date());
      const now=new Date();const todayEnd=new Date();todayEnd.setHours(23,59,59,999);const in7=new Date();in7.setDate(in7.getDate()+7);
      let bucket="future";
      if(dueDate<=now)bucket="overdue";else if(dueDate<=todayEnd)bucket="today";else if(dueDate<=in7)bucket="upcoming";
      return{e,p,seq,task,bucket,dueDate};
    }).filter(Boolean);
  },[enrollments,prospects,sequences]);

  const queueFiltered=useMemo(()=>{
    return allTasks.filter(item=>{
      if(queueBucket==="today_overdue"){if(item.bucket!=="today"&&item.bucket!=="overdue")return false;}
      else if(queueBucket==="upcoming"){if(item.bucket!=="upcoming")return false;}
      if(queueSeqF!=="All"&&item.seq?.id!==queueSeqF)return false;
      if(queueTypeF!=="All"&&item.task.stepType!==queueTypeF)return false;
      if(queueSearch){const q=queueSearch.toLowerCase();if(![item.p.name,item.p.contact,item.task.stepLabel].some(x=>(x||"").toLowerCase().includes(q)))return false;}
      return true;
    }).sort((a,b)=>a.dueDate-b.dueDate);
  },[allTasks,queueBucket,queueSeqF,queueTypeF,queueSearch]);

  const taskCounts=useMemo(()=>({overdue:allTasks.filter(t=>t.bucket==="overdue").length,today:allTasks.filter(t=>t.bucket==="today").length,upcoming:allTasks.filter(t=>t.bucket==="upcoming").length,total:allTasks.length,todayOverdue:allTasks.filter(t=>t.bucket==="today"||t.bucket==="overdue").length}),[allTasks]);
  const tiles=useMemo(()=>{const tod=allTasks.filter(t=>t.bucket==="today"||t.bucket==="overdue");return{active:enrollments.filter(e=>e.status==="active"||e.status==="paused").length,overdue:taskCounts.overdue,calls:tod.filter(t=>t.task.stepType==="call").length,emails:tod.filter(t=>t.task.stepType==="email").length,replies:prospects.filter(p=>p.prospectStatus==="Reply Detected").length,meetings:prospects.filter(p=>p.prospectStatus==="Meeting Booked").length,compRate:pct(enrollments.filter(e=>e.status==="finished").length,enrollments.filter(e=>e.enrolledAt).length)};},[allTasks,enrollments,prospects,taskCounts]);
  const allActs=useMemo(()=>Object.values(activities).flat(),[activities]);
  const dispStats=useMemo(()=>{const m={};DISPOSITIONS.forEach(d=>{m[d.key]={...d,count:0};});allActs.filter(a=>a.type==="disposition_logged").forEach(a=>{const dk=a.meta?.dispKey;if(dk&&m[dk])m[dk].count++;});return Object.values(m).sort((a,b)=>b.count-a.count);},[allActs]);
  const seqStats=useMemo(()=>sequences.map(seq=>{
    const enrs=enrollments.filter(e=>e.sequenceId===seq.id);const acts=allActs.filter(a=>a.meta?.seqId===seq.id);
    const active=enrs.filter(e=>e.status==="active"||e.status==="paused").length;const finished=enrs.filter(e=>e.status==="finished").length;const failed=enrs.filter(e=>e.status==="failed").length;const removed=enrs.filter(e=>e.status==="removed").length;
    const replies=prospects.filter(p=>enrs.find(e=>e.prospectId===p.id)&&["Reply Detected","Meeting Booked"].includes(p.prospectStatus)).length;
    const meetings=prospects.filter(p=>enrs.find(e=>e.prospectId===p.id)&&p.prospectStatus==="Meeting Booked").length;
    const calls=acts.filter(a=>a.type==="disposition_logged"&&a.meta?.stepType==="call").length;const skipped=acts.filter(a=>a.type==="task_skipped").length;
    const stepHits={};enrs.forEach(e=>{if(e.lastTouchStepLabel&&(["Reply Detected","Meeting Booked"].includes(prospects.find(p=>p.id===e.prospectId)?.prospectStatus)))stepHits[e.lastTouchStepLabel]=(stepHits[e.lastTouchStepLabel]||0)+1;});
    return{seq,total:enrs.length,active,finished,failed,removed,replies,meetings,calls,skipped,replyRate:pct(replies,enrs.length),completionRate:pct(finished,enrs.length),stepHits};
  }),[sequences,enrollments,allActs,prospects]);
  const stepFunnel=useMemo(()=>{const r={};sequences.forEach(seq=>{const enrs=enrollments.filter(e=>e.sequenceId===seq.id);r[seq.id]=seq.steps.map((_,i)=>enrs.filter(e=>e.stepIndex>=i).length);});return r;},[enrollments,sequences]);
  const filtered=useMemo(()=>{const q=search.toLowerCase();return sortAZ(prospects.filter(p=>{const mq=!q||[p.name,p.city,p.contact,p.prospectStatus].some(x=>(x||"").toLowerCase().includes(q));const enr=getActiveEnr(p.id);const sn=enr?sequences.find(s=>s.id===enr.sequenceId)?.name||"":"";const es=enr?.status||"not enrolled";return mq&&(stF==="All"||p.prospectStatus===stF)&&(sqF==="All"||sn===sqF)&&(enrF==="All"||es===enrF);}));},[prospects,search,stF,sqF,enrF,getActiveEnr,sequences]);
  const sel=useMemo(()=>selId?prospects.find(p=>p.id===selId):null,[prospects,selId]);
  const selEnr=useMemo(()=>sel?getActiveEnr(sel.id):null,[sel,getActiveEnr]);
  const selSeq=useMemo(()=>selEnr?sequences.find(s=>s.id===selEnr.sequenceId):null,[selEnr,sequences]);
  const selSteps=useMemo(()=>selSeq?selSeq.steps:[],[selSeq]);
  const selProspects=useMemo(()=>prospects.filter(p=>bulkSel.has(p.id)),[prospects,bulkSel]);
  const navTo=v=>{setTab(v);setSelId(null);setBulkMode(false);setBulkSel(new Set());setSeqEditor(null);};

  if(!loaded)return <div style={{background:"#05080f",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",color:"#253352",fontSize:11,letterSpacing:2}}>LOADING...</div>;

  return(
    <div style={{fontFamily:"'DM Mono','Courier New',monospace",background:"#05080f",minHeight:"100vh",color:"#dde4ef",fontSize:12}}>
      <style>{CSS}</style>
      <div style={{background:"#07090f",borderBottom:"1px solid #101928",padding:"9px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",position:"sticky",top:0,zIndex:50}}>
        <div><div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:4,color:"#2563eb",lineHeight:1}}>EI OUTREACH</div><div style={{fontSize:7,color:"#1e2d45",letterSpacing:2,display:"flex",alignItems:"center",gap:5}}>v6.3 {saving&&<span className="sdot"/>}</div></div>
        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
          {[["queue","Queue"+(taskCounts.todayOverdue>0?" ("+taskCounts.todayOverdue+")":"")],["prospects","Prospects"],["crm","CRM Pipeline"],["reporting","Analytics"],["library","Sequences"],["importexport","Import/Export"]].map(([v,l])=>(
            <button key={v} className={"navtab"+(tab===v?" on":"")} style={v==="queue"&&taskCounts.todayOverdue>0?{color:"#f97316"}:{}} onClick={()=>navTo(v)}>{l}</button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <input value={userName} onChange={e=>setUserName(e.target.value)} placeholder="Your name..." style={{width:110,fontSize:9,padding:"3px 7px",background:"#07090f",border:"1px solid #1e2d45"}}/>
          <button className="btn bg" style={{fontSize:9}} onClick={()=>setSettingsOpen(true)}>⚙</button>
        </div>
      </div>

      <div style={{padding:"14px 18px"}}>

        {tab==="queue"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:14}}>
              {[{l:"Overdue",v:tiles.overdue,c:"#f87171",icon:"⏰",action:()=>setQueueBucket("today_overdue")},{l:"Calls Today",v:tiles.calls,c:"#f97316",icon:"📞",action:()=>{setQueueBucket("today_overdue");setQueueTypeF("call");}},{l:"Emails Today",v:tiles.emails,c:"#38bdf8",icon:"✉️",action:()=>{setQueueBucket("today_overdue");setQueueTypeF("email");}},{l:"Meetings",v:tiles.meetings,c:"#fbbf24",icon:"📅",action:()=>{navTo("prospects");setStF("Meeting Booked");}}].map(({l,v,c,icon,action})=>(
                <div key={l} className="tile" onClick={action} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.borderColor=c+"88"} onMouseLeave={e=>e.currentTarget.style.borderColor=""}>
                  <div style={{fontSize:16}}>{icon}</div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:c,lineHeight:1}}>{v}</div>
                  <div style={{fontSize:8,color:"#3d5070",textTransform:"uppercase",letterSpacing:"1px"}}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
              {[["today_overdue","Today + Overdue",taskCounts.todayOverdue],["upcoming","Upcoming",taskCounts.upcoming],["all","All",taskCounts.total]].map(([v,l,ct])=>(
                <button key={v} className={"ctab"+(queueBucket===v?" on":"")} style={v==="today_overdue"&&taskCounts.overdue>0?{color:"#f97316"}:{}} onClick={()=>setQueueBucket(v)}>{l+" ("+ct+")"}</button>
              ))}
              <div style={{flex:1}}/>
              <input placeholder="Search…" value={queueSearch} onChange={e=>setQueueSearch(e.target.value)} style={{width:140}}/>
              <select value={queueSeqF} onChange={e=>setQueueSeqF(e.target.value)} style={{fontSize:10}}><option value="All">All Sequences</option>{sequences.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <select value={queueTypeF} onChange={e=>setQueueTypeF(e.target.value)} style={{fontSize:10}}><option value="All">All Types</option>{STEP_TYPES.map(t=><option key={t.key} value={t.key}>{t.icon+" "+t.label}</option>)}</select>
              <button className="btn bg" style={{fontSize:9}} onClick={runTick}>↻</button>
            </div>
            {queueBulkSel.size>0&&(
              <div className="bulk-bar">
                <span style={{fontSize:10,color:"#dde4ef"}}>{queueBulkSel.size+" selected"}</span>
                <button className="btn bAct" style={{fontSize:9}} onClick={()=>setBulkOutModal(true)}>Log Outcome for All...</button>
                <button className="btn bOr" style={{fontSize:9}} onClick={()=>setBulkSkipConf(true)}>Skip All</button>
                <button className="btn bg" style={{fontSize:9}} onClick={()=>setQueueBulkSel(new Set())}>Clear</button>
              </div>
            )}
            {queueBulkSel.size===0&&queueFiltered.length>0&&(
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
                <input type="checkbox" style={{width:12,height:12,accentColor:"#8b5cf6",cursor:"pointer"}} onChange={e=>{if(e.target.checked)setQueueBulkSel(new Set(queueFiltered.map(x=>x.e.id)));else setQueueBulkSel(new Set());}}/>
                <span style={{fontSize:9,color:"#3d5070"}}>Select all visible</span>
              </div>
            )}
            {queueFiltered.length===0&&(
              <div style={{textAlign:"center",padding:"50px 0",color:"#253352"}}>
                <div style={{fontSize:38,marginBottom:10}}>✓</div>
                <div style={{marginBottom:6}}>{allTasks.length===0?"No pending tasks.":"No tasks match the filter."}</div>
                <button className="btn bp" style={{marginTop:10}} onClick={()=>navTo("prospects")}>Go to Prospects</button>
              </div>
            )}
            {queueFiltered.map(item=>(
              <TaskCard key={item.e.id} item={item} selectable={true} queueBulkSel={queueBulkSel} setQueueBulkSel={setQueueBulkSel} setSelId={setSelId} setTab={setTab} skipTask={skipTask} setTaskModal={setTaskModal}/>
            ))}
          </div>
        )}

        {tab==="prospects"&&!selId&&(
          <div>
            {savedViews.length>0&&<div style={{display:"flex",gap:5,marginBottom:9,flexWrap:"wrap",alignItems:"center"}}><span style={{fontSize:8,color:"#3d5070",textTransform:"uppercase",letterSpacing:"1px"}}>Views:</span>{savedViews.map(v=><div key={v.id} style={{display:"flex",alignItems:"center",gap:2}}><button className={"view-pill"+(activeView===v.id?" on":"")} onClick={()=>loadView(v.id)}>{v.name}</button><button onClick={()=>deleteView(v.id)} style={{padding:"1px 4px",borderRadius:3,border:"none",background:"transparent",color:"#3d5070",cursor:"pointer",fontSize:9}}>✕</button></div>)}</div>}
            <div style={{display:"flex",gap:5,marginBottom:9,flexWrap:"wrap",alignItems:"center"}}>
              <input placeholder="Search…" value={search} onChange={e=>{setSearch(e.target.value);setActiveView(null);}} style={{flex:1,minWidth:110}}/>
              <select value={stF} onChange={e=>{setStF(e.target.value);setActiveView(null);}}><option>All</option>{PROSPECT_STATUSES.map(s=><option key={s}>{s}</option>)}</select>
              <select value={sqF} onChange={e=>{setSqF(e.target.value);setActiveView(null);}}><option>All</option>{sequences.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select>
              <select value={enrF} onChange={e=>{setEnrF(e.target.value);setActiveView(null);}}><option value="All">Sequence State</option>{ENR_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}<option value="not enrolled">Not Enrolled</option></select>
              <span style={{fontSize:9,color:"#3d5070"}}>{filtered.length}</span>
              <button className="btn bg" style={{fontSize:9,color:"#60a5fa"}} onClick={()=>setSaveViewModal(true)}>💾</button>
              <button className="btn bp" onClick={()=>setAddModal(true)}>+ Add</button>
              <button className={"btn "+(bulkMode?"bPu":"bg")} style={{fontSize:9}} onClick={()=>{setBulkMode(v=>!v);setBulkSel(new Set());}}>Bulk</button>
            </div>
            {bulkMode&&(
              <div className="bulk-bar">
                <input type="checkbox" style={{width:13,height:13,accentColor:"#2563eb",cursor:"pointer"}} checked={filtered.length>0&&filtered.every(p=>bulkSel.has(p.id))} onChange={()=>{const all=filtered.every(p=>bulkSel.has(p.id));setBulkSel(all?new Set():new Set(filtered.map(p=>p.id)));}}/>
                <span style={{fontSize:10,color:bulkSel.size>0?"#dde4ef":"#64748b",minWidth:80}}>{bulkSel.size>0?bulkSel.size+" selected":"Select rows"}</span>
                {bulkSel.size>0&&<>
                  <button className="btn bAct" style={{fontSize:9}} onClick={()=>setBulkStartModal(true)}>Start Sequence</button>
                  <button className="btn bp" style={{fontSize:9}} onClick={()=>setBulkSwitchModal(true)}>Switch Sequence</button>
                  <button className="btn bOr" style={{fontSize:9}} onClick={()=>setBulkRemoveModal(true)}>Remove from Seq</button>
                  <button className="btn bPu" style={{fontSize:9}} onClick={()=>setBulkStatusModal(true)}>Change Status</button>
                  <button className="btn bDel" style={{fontSize:9}} onClick={()=>{const ids=[...bulkSel];const updated=enrollments.map(e=>ids.includes(e.prospectId)&&(e.status==="active"||e.status==="paused"||e.status==="failed")?{...e,status:"removed",exitReason:"Deleted",finishedAt:nowISO(),pendingTask:null}:e);saveEnr(updated);setP(prev=>prev.filter(p=>!ids.includes(p.id)));setBulkSel(new Set());setBulkMode(false);flash("Deleted "+ids.length,"warn");}}>Delete</button>
                  <button className="btn bg" style={{fontSize:9}} onClick={()=>{setBulkSel(new Set());setBulkMode(false);}}>Cancel</button>
                </>}
              </div>
            )}
            {filtered.length===0
              ?<div style={{textAlign:"center",padding:"50px 0",color:"#253352"}}><div style={{fontSize:32,marginBottom:8}}>[task]</div><div style={{marginBottom:12}}>{prospects.length===0?"No prospects yet.":"No results."}</div>{prospects.length===0&&<button className="btn bp" onClick={()=>setAddModal(true)}>+ Add First Prospect</button>}</div>
              :filtered.map(p=>{
                const enr=getActiveEnr(p.id);const seq=enr?sequences.find(s=>s.id===enr.sequenceId):null;
                const steps=seq?seq.steps:[];const step=enr?steps[enr.stepIndex]:null;
                const urg=enr?urgency(enr.nextRunAt):null;const p2=steps.length?Math.round((enr?.stepIndex||0)/steps.length*100):0;
                const isSel=bulkSel.has(p.id);const hasTask=enr?.status==="paused"&&enr.pendingTask;
                const lastDisp=enr?.lastDisposition?DISP_MAP[enr.lastDisposition]:null;
                const isScheduledFuture=enr?.status==="active"&&!!enr.scheduledStartAt&&new Date(enr.nextRunAt)>new Date();
                return(
                  <div className="row" key={p.id} style={{borderColor:isSel?"#8b5cf6":""}} onClick={()=>bulkMode?setBulkSel(prev=>{const n=new Set(prev);n.has(p.id)?n.delete(p.id):n.add(p.id);return n;}):setSelId(p.id)}>
                    <div style={{display:"grid",gridTemplateColumns:bulkMode?"auto 2fr .8fr .8fr .5fr .5fr auto":"2fr .8fr .8fr .5fr .5fr auto",gap:8,alignItems:"center"}}>
                      {bulkMode&&<input type="checkbox" style={{width:12,height:12,accentColor:"#8b5cf6",cursor:"pointer"}} checked={isSel} onChange={()=>{}} onClick={e=>e.stopPropagation()}/>}
                      <div>
                        <div style={{fontSize:11,fontWeight:"500",display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                          {p.name}
                          {hasTask&&<span style={{fontSize:7,background:"#1a1000",color:"#fbbf24",padding:"1px 4px",borderRadius:3}}>TASK</span>}
                          {isScheduledFuture&&<span style={{fontSize:7,background:"#050d1a",color:"#60a5fa",padding:"1px 4px",borderRadius:3}}>[date] SCHED</span>}
                          {enr?.status==="paused"&&!enr.pendingTask&&!isScheduledFuture&&<span style={{fontSize:7,background:"#1a0000",color:"#f97316",padding:"1px 4px",borderRadius:3}}>PAUSED</span>}
                        </div>
                        <div style={{fontSize:9,color:"#3d5070"}}>{p.contact+(p.city?" - "+p.city:"")}</div>
                        {enr&&step&&urg&&<div style={{fontSize:9,color:isScheduledFuture?"#60a5fa":urg.col,marginTop:2}}>
                          {isScheduledFuture
                            ?"[date] Starts "+fmtDT(enr.nextRunAt)
                            :enr.status==="active"&&!enr.pendingTask
                              ?"[wait] "+step.label+" - due "+fmtDT(enr.nextRunAt)
                              :(STM[step.type]?.icon||"")+" "+step.label+" - "+urg.label}
                        </div>}
                      </div>
                      <div>
                        {seq&&<div style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:5,height:5,borderRadius:"50%",background:seq.color,flexShrink:0,display:"inline-block"}}/><span style={{fontSize:9,color:"#4b6280"}}>{seq.name}</span></div>}
                        {enr&&steps.length>0&&<div style={{marginTop:3}}><div className="pb"><div className="pf" style={{width:p2+"%"}}/></div></div>}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:2}}>
                        <span className="badge" style={{background:enrStatusBg(enr?.status||""),color:enrStatusColor(enr?.status||"")}}>{enr?.status||"-"}</span>
                        {lastDisp&&<span style={{padding:"1px 6px",borderRadius:8,fontSize:8,background:lastDisp.color+"18",color:lastDisp.color}}>{lastDisp.icon+" "+lastDisp.label}</span>}
                      </div>
                      <div onClick={e=>e.stopPropagation()}>
                        {hasTask?<button className="btn bAct" style={{fontSize:9}} onClick={()=>setTaskModal({e:enr,p,seq,task:enr.pendingTask})}>Log</button>
                          :!enr?<button className="btn bp" style={{fontSize:9}} onClick={()=>setSelId(p.id)}>Enroll</button>
                          :<button className="btn bg" style={{fontSize:9}} onClick={()=>setSelId(p.id)}>View</button>}
                      </div>
                    </div>
                  </div>
                );
              })
            }
          </div>
        )}

        {tab==="prospects"&&sel&&(
          <ProspectDetail
            sel={sel} selEnr={selEnr} selSeq={selSeq} selSteps={selSteps}
            enrollments={enrollments} sequences={sequences} activities={activities}
            settings={settings}
            onBack={()=>setSelId(null)}
            onEnroll={enrollProspect} onPause={pauseEnrollment}
            onResume={resumeEnrollment} onRetry={retryFailed}
            onStop={stopEnrollments} onStatus={setStatus}
            onStartTask={startTask}
            onLogOutcome={(enr,p,seq,task)=>setTaskModal({e:enr,p,seq,task})}
            onSkipTask={skipTask}
            onDelete={async(id,name)=>{
              const toStop=enrollments.filter(e=>e.prospectId===id&&(e.status==="active"||e.status==="paused"||e.status==="failed"));
              if(toStop.length){await saveEnr(enrollments.map(e=>toStop.find(x=>x.id===e.id)?{...e,status:"removed",exitReason:"Deleted",finishedAt:nowISO(),pendingTask:null}:e));}
              setP(prev=>prev.filter(x=>x.id!==id));setSelId(null);flash("Deleted "+name,"warn");
            }}
            saveEnr={saveEnr} logAct={logAct} runTick={runTick}
          />
        )}

        {tab==="crm"&&(()=>{
          const refreshCrm=async()=>{setCrmLoading(true);setCrmError(null);try{const rows=await sbFetch("crm_records?order=created_at.asc");setCrmRecords(rows.map(fromRow));}catch(e:any){setCrmError("Load failed: "+e.message);}finally{setCrmLoading(false);}};
          const saveCrm=async(record:any,isNew:boolean)=>{
            setCrmLoading(true);setCrmError(null);
            try{
              const row=toRow(record);
              if(isNew){await sbFetch("crm_records",{method:"POST",body:JSON.stringify(row)});}
              else{await sbFetch("crm_records?id=eq."+record.id,{method:"PATCH",body:JSON.stringify(row)});}
              await refreshCrm();
            }catch(e:any){setCrmError("Save failed: "+e.message);}
            finally{setCrmLoading(false);}
          };
          const deleteRecord=async(id:string)=>{
            setCrmLoading(true);
            try{await sbFetch("crm_records?id=eq."+id,{method:"DELETE",headers:{"Prefer":""}});await refreshCrm();flash("Deleted","warn");}
            catch(e:any){setCrmError("Delete failed: "+e.message);}
            finally{setCrmLoading(false);}
          };
          const crmFiltered=[...crmRecords].filter((r:any)=>{
            const q=crmSearch.toLowerCase();
            const mq=!q||[r.agencyName,r.contactName,r.contactTitle,r.notes].some(x=>(x||"").toLowerCase().includes(q));
            const comp=r.competitor==="Other"?r.competitorCustom:r.competitor;
            return mq&&(crmStatusF==="All"||r.crmStatus===crmStatusF)&&(crmTypeF==="All"||r.agencyType===crmTypeF)&&(crmCompF==="All"||comp===crmCompF);
          }).sort((a,b)=>{
            if(crmSort==="followup"){const da=a.nextFollowup||"9999";const db=b.nextFollowup||"9999";return da.localeCompare(db);}
            if(crmSort==="status"){return CRM_STATUSES.indexOf(a.crmStatus)-CRM_STATUSES.indexOf(b.crmStatus);}
            return (a.agencyName||"").localeCompare(b.agencyName||"");
          });
          const statusCounts={};CRM_STATUSES.forEach(s=>{statusCounts[s]=crmRecords.filter(r=>r.crmStatus===s).length;});
          const openEdit=(r)=>{setCrmEditId(r?r.id:null);setCrmModal(r?{...r}:{...BLANK_CRM,id:uid(),createdAt:today()});};
          const saveRecord=async()=>{
            if(!crmModal.agencyName?.trim()){flash("Agency name required","err");return;}
            const isNew=!crmRecords.find((r:any)=>r.id===crmModal.id);
            await saveCrm(crmModal,isNew);
            setCrmModal(null);setCrmEditId(null);
          };
          const today_overdue_followups=crmRecords.filter((r:any)=>r.nextFollowup&&r.nextFollowup<=today()&&!["Closed Won","Not Interested"].includes(r.crmStatus)).length;
          return(
            <div>
              {/* HEADER */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div><div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:2,color:"#34d399"}}>CRM PIPELINE</div><div style={{fontSize:8,color:"#3d5070"}}>{crmRecords.length} records{today_overdue_followups>0&&<span style={{color:"#f87171",marginLeft:8}}>⚠ {today_overdue_followups} follow-up{today_overdue_followups!==1?"s":""} due</span>}{crmLoading&&<span style={{color:"#60a5fa",marginLeft:8}}>syncing…</span>}{crmError&&<span style={{color:"#f87171",marginLeft:8}}>{crmError}</span>}</div></div>
                <div style={{display:"flex",gap:6}}>
                  <button className="btn bg" style={{fontSize:9}} onClick={refreshCrm}>↻ Refresh</button>
                  <button className="btn bg" style={{fontSize:9}} onClick={()=>{const cols=["agencyName","contactName","contactTitle","phone","email","agencyType","competitor","crmStatus","lastContact","nextFollowup","notes"];dlCSV(toCSV(crmRecords,cols),"crm-export-"+today()+".csv");flash("Exported!");}}>Export CSV</button>
                  <button className="btn bGr" style={{fontSize:10}} onClick={()=>openEdit(null)}>+ Add Record</button>
                </div>
              </div>

              {/* STATUS SUMMARY TILES */}
              <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
                {CRM_STATUSES.map(s=>(
                  <div key={s} onClick={()=>setCrmStatusF(crmStatusF===s?"All":s)} style={{background:crmStatusF===s?CRM_STATUS_COLORS[s]+"22":"#0b1220",border:"1px solid "+(crmStatusF===s?CRM_STATUS_COLORS[s]:"#192035"),borderRadius:8,padding:"9px 14px",cursor:"pointer",flex:1,minWidth:90,textAlign:"center"}}>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:CRM_STATUS_COLORS[s],lineHeight:1}}>{statusCounts[s]||0}</div>
                    <div style={{fontSize:8,color:"#64748b",marginTop:2,textTransform:"uppercase",letterSpacing:"0.5px"}}>{s}</div>
                  </div>
                ))}
              </div>

              {/* FILTERS */}
              <div style={{display:"flex",gap:5,marginBottom:9,flexWrap:"wrap",alignItems:"center"}}>
                <input placeholder="Search agency, contact, notes…" value={crmSearch} onChange={e=>setCrmSearch(e.target.value)} style={{flex:2,minWidth:160}}/>
                <select value={crmStatusF} onChange={e=>setCrmStatusF(e.target.value)}>
                  <option value="All">All Statuses</option>{CRM_STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
                <select value={crmTypeF} onChange={e=>setCrmTypeF(e.target.value)}>
                  <option value="All">All Types</option>{AGENCY_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
                <select value={crmCompF} onChange={e=>setCrmCompF(e.target.value)}>
                  <option value="All">All Competitors</option>{COMPETITOR_LIST.map(c=><option key={c}>{c}</option>)}<option value="Other">Other</option>
                </select>
                <select value={crmSort} onChange={e=>setCrmSort(e.target.value)}>
                  <option value="followup">Sort: Follow-up Date</option>
                  <option value="status">Sort: Status</option>
                  <option value="name">Sort: Name</option>
                </select>
                <span style={{fontSize:9,color:"#3d5070"}}>{crmFiltered.length}</span>
              </div>

              {/* RECORDS LIST */}
              {crmFiltered.length===0?(
                <div style={{textAlign:"center",padding:"60px 0",color:"#253352"}}>
                  <div style={{fontSize:32,marginBottom:10}}>📋</div>
                  <div style={{marginBottom:14}}>{crmRecords.length===0?"No CRM records yet. Add your first prospect.":"No records match the filter."}</div>
                  {crmRecords.length===0&&<button className="btn bGr" onClick={()=>openEdit(null)}>+ Add First Record</button>}
                </div>
              ):(
                <div>
                  {crmFiltered.map(r=>{
                    const comp=r.competitor==="Other"?r.competitorCustom||"Other":r.competitor;
                    const sc=CRM_STATUS_COLORS[r.crmStatus]||"#64748b";
                    const isOverdue=r.nextFollowup&&r.nextFollowup<today()&&!["Closed Won","Not Interested"].includes(r.crmStatus);
                    const isDueToday=r.nextFollowup===today()&&!["Closed Won","Not Interested"].includes(r.crmStatus);
                    return(
                      <div key={r.id} className="row" style={{borderColor:isOverdue?"#f87171":isDueToday?"#4ade80":""}} onClick={()=>openEdit(r)}>
                        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr auto",gap:8,alignItems:"center"}}>
                          <div>
                            <div style={{fontSize:11,fontWeight:"500",color:"#dde4ef",display:"flex",alignItems:"center",gap:5}}>
                              {r.agencyName}
                              {isOverdue&&<span style={{fontSize:7,background:"#280a0a",color:"#f87171",padding:"1px 4px",borderRadius:3}}>OVERDUE</span>}
                              {isDueToday&&<span style={{fontSize:7,background:"#0a2018",color:"#4ade80",padding:"1px 4px",borderRadius:3}}>TODAY</span>}
                            </div>
                            <div style={{fontSize:9,color:"#4b6280"}}>{r.contactName}{r.contactTitle?" · "+r.contactTitle:""}</div>
                            {r.notes&&<div style={{fontSize:8,color:"#334155",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:280}}>{r.notes}</div>}
                          </div>
                          <div>
                            <span style={{padding:"2px 8px",borderRadius:10,fontSize:9,background:sc+"18",color:sc,whiteSpace:"nowrap"}}>{r.crmStatus}</span>
                          </div>
                          <div>
                            <div style={{fontSize:9,color:"#64748b"}}>{r.agencyType||"-"}</div>
                            <div style={{fontSize:8,color:"#334155"}}>{comp||"-"}</div>
                          </div>
                          <div style={{fontSize:8,color:"#3d5070"}}>
                            {r.lastContact&&<div>Last: {fmtD(r.lastContact)}</div>}
                          </div>
                          <div style={{fontSize:8,color:isOverdue?"#f87171":isDueToday?"#4ade80":"#3d5070"}}>
                            {r.nextFollowup&&<div>Next: {fmtD(r.nextFollowup)}</div>}
                          </div>
                          <div onClick={e=>e.stopPropagation()} style={{display:"flex",gap:4}}>
                            <button className="btn bg" style={{fontSize:9}} onClick={()=>openEdit(r)}>Edit</button>
                            <button className="btn bDel" style={{fontSize:9}} onClick={()=>{if(window.confirm("Delete "+r.agencyName+"?"))deleteRecord(r.id);}}>✕</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ADD/EDIT MODAL */}
              {crmModal&&(
                <div className="mBg" onClick={()=>{setCrmModal(null);setCrmEditId(null);}}>
                  <div className="modal" style={{maxWidth:640}} onClick={e=>e.stopPropagation()}>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,marginBottom:14,color:"#34d399"}}>{crmEditId?"EDIT RECORD":"ADD CRM RECORD"}</div>

                    <div style={{fontSize:8,color:"#34d399",letterSpacing:"2px",textTransform:"uppercase",marginBottom:7,marginTop:4}}>Agency Info</div>
                    <div className="fr">
                      <div><div className="fl">Agency Name *</div><input value={crmModal.agencyName||""} onChange={e=>setCrmModal(m=>({...m,agencyName:e.target.value}))} placeholder="Sunrise EI Services" autoFocus/></div>
                      <div><div className="fl">Agency Type</div><select value={crmModal.agencyType||"EI"} onChange={e=>setCrmModal(m=>({...m,agencyType:e.target.value}))}>{AGENCY_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                    </div>
                    <div className="fr">
                      <div><div className="fl">Current Software</div>
                        <select value={crmModal.competitor||"Unknown"} onChange={e=>setCrmModal(m=>({...m,competitor:e.target.value}))}>
                          {COMPETITOR_LIST.map(c=><option key={c}>{c}</option>)}
                          <option value="Other">Other (specify)</option>
                        </select>
                      </div>
                      {crmModal.competitor==="Other"&&<div><div className="fl">Specify</div><input value={crmModal.competitorCustom||""} onChange={e=>setCrmModal(m=>({...m,competitorCustom:e.target.value}))} placeholder="e.g. HomeCare Plus"/></div>}
                    </div>

                    <div style={{fontSize:8,color:"#34d399",letterSpacing:"2px",textTransform:"uppercase",marginBottom:7,marginTop:10}}>Contact</div>
                    <div className="fr">
                      <div><div className="fl">Contact Name</div><input value={crmModal.contactName||""} onChange={e=>setCrmModal(m=>({...m,contactName:e.target.value}))} placeholder="Jane Smith"/></div>
                      <div><div className="fl">Title</div><input value={crmModal.contactTitle||""} onChange={e=>setCrmModal(m=>({...m,contactTitle:e.target.value}))} placeholder="Executive Director"/></div>
                    </div>
                    <div className="fr">
                      <div><div className="fl">Phone</div><input value={crmModal.phone||""} onChange={e=>setCrmModal(m=>({...m,phone:e.target.value}))} placeholder="516-555-0100"/></div>
                      <div><div className="fl">Email</div><input value={crmModal.email||""} onChange={e=>setCrmModal(m=>({...m,email:e.target.value}))} placeholder="jane@agency.org"/></div>
                    </div>

                    <div style={{fontSize:8,color:"#34d399",letterSpacing:"2px",textTransform:"uppercase",marginBottom:7,marginTop:10}}>Pipeline Status</div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                      {CRM_STATUSES.map(s=>(
                        <button key={s} onClick={()=>setCrmModal(m=>({...m,crmStatus:s}))} style={{padding:"5px 12px",borderRadius:7,border:"1px solid "+(crmModal.crmStatus===s?CRM_STATUS_COLORS[s]:"#1e2d45"),background:crmModal.crmStatus===s?CRM_STATUS_COLORS[s]+"22":"#080f1c",color:crmModal.crmStatus===s?CRM_STATUS_COLORS[s]:"#4b6280",cursor:"pointer",fontSize:10,fontFamily:"inherit"}}>
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="fr">
                      <div><div className="fl">Last Contact Date</div><input type="date" value={crmModal.lastContact||""} onChange={e=>setCrmModal(m=>({...m,lastContact:e.target.value}))}/></div>
                      <div><div className="fl">Next Follow-up Date</div><input type="date" value={crmModal.nextFollowup||""} onChange={e=>setCrmModal(m=>({...m,nextFollowup:e.target.value}))}/></div>
                    </div>

                    <div style={{marginBottom:14}}>
                      <div className="fl">Notes</div>
                      <textarea value={crmModal.notes||""} onChange={e=>setCrmModal(m=>({...m,notes:e.target.value}))} rows={3} style={{width:"100%",resize:"vertical",fontSize:10}} placeholder="Key context, objections, next steps…"/>
                    </div>

                    <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}>
                      <button className="btn bg" onClick={()=>{setCrmModal(null);setCrmEditId(null);}}>Cancel</button>
                      {crmEditId&&<button className="btn bDel" onClick={()=>{if(window.confirm("Delete this record?"))deleteRecord(crmEditId);setCrmModal(null);setCrmEditId(null);}}>Delete</button>}
                      <button className="btn bGr" onClick={saveRecord}>{crmEditId?"Save Changes":"Add Record"}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {tab==="reporting"&&(()=>{
          const totalEnr=enrollments.filter(e=>e.enrolledAt).length;
          const activeEnr=enrollments.filter(e=>e.status==="active"||e.status==="paused").length;
          const finishedEnr=enrollments.filter(e=>e.status==="finished").length;
          const totalDisps=allActs.filter(a=>a.type==="disposition_logged").length;
          const totalMeetings=prospects.filter(p=>p.prospectStatus==="Meeting Booked").length;
          const totalReplies=prospects.filter(p=>p.prospectStatus==="Reply Detected"||p.prospectStatus==="Meeting Booked").length;
          const totalCalls=allActs.filter(a=>a.type==="disposition_logged"&&a.meta?.stepType==="call").length;
          const totalEmails=allActs.filter(a=>a.type==="disposition_logged"&&a.meta?.stepType==="email").length;
          const totalSkips=allActs.filter(a=>a.type==="task_skipped").length;
          const contactRate=pct(allActs.filter(a=>a.meta?.dispKey==="connected").length,totalCalls||1);
          const meetingRate=pct(totalMeetings,totalEnr||1);
          const replyRate=pct(totalReplies,totalEnr||1);
          const completionRate=pct(finishedEnr,totalEnr||1);
          // Activity by day (last 14 days)
          const actByDay={};for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);actByDay[d.toISOString().split("T")[0]]=0;}
          allActs.forEach(a=>{const d=a.ts?.split("T")[0];if(d&&actByDay[d]!==undefined)actByDay[d]++;});
          const actDays=Object.entries(actByDay);
          const maxAct=Math.max(...actDays.map(([,v])=>v),1);
          // Disposition breakdown
          const topDisps=dispStats.filter(d=>d.count>0).slice(0,8);
          const maxDispCount=Math.max(...topDisps.map(d=>d.count),1);
          // Step-level performance across all sequences
          const stepPerf={};allActs.filter(a=>a.type==="disposition_logged"&&a.meta?.stepLabel).forEach(a=>{const k=a.meta.stepLabel;if(!stepPerf[k])stepPerf[k]={label:k,type:a.meta.stepType,total:0,connected:0,meetings:0};stepPerf[k].total++;if(a.meta.dispKey==="connected")stepPerf[k].connected++;if(a.meta.dispKey==="meeting_booked")stepPerf[k].meetings++;});
          const topSteps=Object.values(stepPerf).sort((a,b)=>b.total-a.total).slice(0,10);
          // Prospect status breakdown
          const statusBreakdown={};PROSPECT_STATUSES.forEach(s=>{statusBreakdown[s]=prospects.filter(p=>p.prospectStatus===s).length;});
          const statusRows=Object.entries(statusBreakdown).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
          const maxStatus=Math.max(...statusRows.map(([,v])=>v),1);
          return(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:2,color:"#c084fc"}}>ANALYTICS</div>
                <button className="btn bg" style={{fontSize:9}} onClick={()=>{const rows=seqStats.map(s=>({Sequence:s.seq.name,Enrolled:s.total,Active:s.active,Finished:s.finished,Replies:s.replies,Meetings:s.meetings,Calls:s.calls,Skipped:s.skipped,"Reply%":s.replyRate+"%","Done%":s.completionRate+"%"}));dlCSV(toCSV(rows,["Sequence","Enrolled","Active","Finished","Replies","Meetings","Calls","Skipped","Reply%","Done%"]),"analytics-"+today()+".csv");flash("Exported!");}}>Export CSV</button>
              </div>

              {/* KPI TILES */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:16}}>
                {[
                  {l:"Enrolled",v:totalEnr,c:"#3b82f6",sub:"total prospects"},
                  {l:"Active",v:activeEnr,c:"#4ade80",sub:pct(activeEnr,totalEnr||1)+"%  of enrolled"},
                  {l:"Completed",v:finishedEnr,c:"#2dd4bf",sub:completionRate+"% completion rate"},
                  {l:"Meetings Booked",v:totalMeetings,c:"#fbbf24",sub:meetingRate+"% of enrolled"},
                  {l:"Replies / Interest",v:totalReplies,c:"#a78bfa",sub:replyRate+"% reply rate"},
                  {l:"Total Activities",v:totalDisps,c:"#f97316",sub:"logged outcomes"},
                  {l:"Calls Made",v:totalCalls,c:"#f97316",sub:contactRate+"% contact rate"},
                  {l:"Emails Sent",v:totalEmails,c:"#38bdf8",sub:"email touchpoints"},
                ].map(({l,v,c,sub})=>(
                  <div key={l} className="tile">
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:28,color:c,lineHeight:1}}>{v}</div>
                    <div style={{fontSize:9,color:"#dde4ef",fontWeight:"500"}}>{l}</div>
                    <div style={{fontSize:8,color:"#3d5070"}}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* ACTIVITY VOLUME + DISPOSITION BREAKDOWN */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:14}}>
                <div className="card" style={{padding:13}}>
                  <div style={{fontSize:8,color:"#3d5070",letterSpacing:"2px",textTransform:"uppercase",marginBottom:10}}>Activity Volume — Last 14 Days</div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:3,height:60}}>
                    {actDays.map(([d,v])=>(
                      <div key={d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                        <div style={{width:"100%",background:v>0?"#3b82f6":"#192035",borderRadius:"2px 2px 0 0",height:Math.max(2,Math.round(v/maxAct*52))+"px",transition:"height .3s"}}/>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:7,color:"#253352"}}>
                    <span>{actDays[0]?new Date(actDays[0][0]).toLocaleDateString("en-US",{month:"short",day:"numeric"}):""}</span>
                    <span>Today</span>
                  </div>
                  <div style={{display:"flex",gap:10,marginTop:8,flexWrap:"wrap"}}>
                    {[["Calls",totalCalls,"#f97316"],["Emails",totalEmails,"#38bdf8"],["Skipped",totalSkips,"#64748b"]].map(([l,v,c])=>(
                      <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                        <span style={{width:6,height:6,borderRadius:"50%",background:c,display:"inline-block"}}/>
                        <span style={{fontSize:8,color:"#64748b"}}>{l}</span>
                        <span style={{fontSize:9,color:c,fontWeight:"600"}}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card" style={{padding:13}}>
                  <div style={{fontSize:8,color:"#3d5070",letterSpacing:"2px",textTransform:"uppercase",marginBottom:10}}>Disposition Breakdown</div>
                  {topDisps.length===0&&<div style={{color:"#3d5070",fontSize:10,padding:"16px 0",textAlign:"center"}}>No outcomes logged yet.</div>}
                  {topDisps.map(d=>(
                    <div key={d.key} style={{display:"grid",gridTemplateColumns:"1fr auto 80px",gap:8,alignItems:"center",marginBottom:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,minWidth:0}}>
                        <span style={{fontSize:11}}>{d.icon}</span>
                        <span style={{fontSize:9,color:d.color,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.label}</span>
                      </div>
                      <span style={{fontSize:10,fontWeight:"600",color:d.color,minWidth:20,textAlign:"right"}}>{d.count}</span>
                      <div style={{background:"#192035",borderRadius:3,height:5,overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:3,background:d.color+"bb",width:pct(d.count,maxDispCount)+"%",transition:"width .4s"}}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SEQUENCE PERFORMANCE TABLE (Outreach-style) */}
              <div className="card" style={{padding:13,marginBottom:14}}>
                <div style={{fontSize:8,color:"#3d5070",letterSpacing:"2px",textTransform:"uppercase",marginBottom:10}}>Sequence Performance</div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:9}}>
                    <thead>
                      <tr style={{borderBottom:"1px solid #192035"}}>
                        {["Sequence","Enrolled","Active","Finished","Calls","Replies","Meetings","Skip","Reply %","Done %","Engagement"].map(h=>(
                          <th key={h} style={{padding:"5px 8px",textAlign:"left",fontSize:7,color:"#3d5070",textTransform:"uppercase",letterSpacing:"1px",fontWeight:"500",whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {seqStats.filter(s=>s.total>0).map(s=>{
                        const engScore=Math.round((s.replyRate*0.4)+(s.completionRate*0.3)+(pct(s.meetings,s.total||1)*0.3));
                        return(
                          <tr key={s.seq.id} style={{borderBottom:"1px solid #0d1525"}} onMouseEnter={e=>e.currentTarget.style.background="#080f1c"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <td style={{padding:"7px 8px"}}>
                              <div style={{display:"flex",alignItems:"center",gap:6}}>
                                <span style={{width:5,height:5,borderRadius:"50%",background:s.seq.color,flexShrink:0,display:"inline-block"}}/>
                                <span style={{color:s.seq.color,fontWeight:"500"}}>{s.seq.name}</span>
                              </div>
                            </td>
                            <td style={{padding:"7px 8px",color:"#dde4ef",cursor:"pointer",textDecoration:"underline"}} onClick={()=>setRptDrilldown({title:s.seq.name+" — All Prospects",prospectIds:enrollments.filter(e=>e.sequenceId===s.seq.id).map(e=>e.prospectId)})}>{s.total}</td>
                            <td style={{padding:"7px 8px",color:"#4ade80"}}>{s.active}</td>
                            <td style={{padding:"7px 8px",color:"#2dd4bf"}}>{s.finished}</td>
                            <td style={{padding:"7px 8px",color:"#f97316"}}>{s.calls}</td>
                            <td style={{padding:"7px 8px",color:"#a78bfa"}}>{s.replies}</td>
                            <td style={{padding:"7px 8px",color:"#fbbf24"}}>{s.meetings}</td>
                            <td style={{padding:"7px 8px",color:"#64748b"}}>{s.skipped}</td>
                            <td style={{padding:"7px 8px"}}>
                              <span style={{color:s.replyRate>=10?"#4ade80":s.replyRate>=5?"#fbbf24":"#f87171"}}>{s.replyRate}%</span>
                            </td>
                            <td style={{padding:"7px 8px"}}>
                              <div style={{display:"flex",alignItems:"center",gap:5}}>
                                <div style={{background:"#192035",borderRadius:3,height:4,width:50,overflow:"hidden"}}>
                                  <div style={{height:"100%",borderRadius:3,background:s.seq.color,width:s.completionRate+"%"}}/>
                                </div>
                                <span style={{color:s.completionRate>=50?"#4ade80":"#4b6280"}}>{s.completionRate}%</span>
                              </div>
                            </td>
                            <td style={{padding:"7px 8px"}}>
                              <div style={{display:"flex",alignItems:"center",gap:5}}>
                                <div style={{background:"#192035",borderRadius:3,height:4,width:40,overflow:"hidden"}}>
                                  <div style={{height:"100%",borderRadius:3,background:engScore>=50?"#4ade80":engScore>=25?"#fbbf24":"#f87171",width:engScore+"%"}}/>
                                </div>
                                <span style={{fontSize:8,color:engScore>=50?"#4ade80":engScore>=25?"#fbbf24":"#f87171"}}>{engScore}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {seqStats.every(s=>s.total===0)&&<tr><td colSpan={11} style={{padding:"20px 8px",color:"#3d5070",textAlign:"center"}}>No enrollment data yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* STEP FUNNEL + PROSPECT STATUS */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:14}}>
                <div className="card" style={{padding:13}}>
                  <div style={{fontSize:8,color:"#3d5070",letterSpacing:"2px",textTransform:"uppercase",marginBottom:10}}>Top Steps by Activity</div>
                  {topSteps.length===0&&<div style={{color:"#3d5070",fontSize:10,padding:"16px 0",textAlign:"center"}}>No step data yet.</div>}
                  {topSteps.map((s,i)=>{
                    const ti=STM[s.type]||{icon:"📋",color:"#4b6280"};
                    const maxTotal=topSteps[0]?.total||1;
                    return(
                      <div key={i} style={{marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                          <span style={{fontSize:10}}>{ti.icon}</span>
                          <span style={{fontSize:9,color:"#94a3b8",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.label}</span>
                          <span style={{fontSize:9,color:ti.color,fontWeight:"600",minWidth:20,textAlign:"right"}}>{s.total}</span>
                        </div>
                        <div style={{background:"#192035",borderRadius:3,height:4,overflow:"hidden"}}>
                          <div style={{height:"100%",borderRadius:3,background:ti.color+"aa",width:pct(s.total,maxTotal)+"%",transition:"width .4s"}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="card" style={{padding:13}}>
                  <div style={{fontSize:8,color:"#3d5070",letterSpacing:"2px",textTransform:"uppercase",marginBottom:10}}>Prospect Status Breakdown</div>
                  {statusRows.length===0&&<div style={{color:"#3d5070",fontSize:10,padding:"16px 0",textAlign:"center"}}>No prospects yet.</div>}
                  {statusRows.map(([s,v])=>{
                    const statusColors={"Meeting Booked":"#fbbf24","Reply Detected":"#4ade80","Connected":"#60a5fa","Interested":"#34d399","Not Interested":"#f87171","Do Not Contact":"#ef4444","Converted to Customer":"#a78bfa","Left Voicemail":"#94a3b8","No Answer":"#64748b","Gatekeeper":"#fb923c","Call Back Later":"#38bdf8","Send Info Requested":"#818cf8","Wrong Number":"#475569","Not Contacted":"#334155"};
                    const col=statusColors[s]||"#4b6280";
                    return(
                      <div key={s} style={{display:"grid",gridTemplateColumns:"1fr auto 70px",gap:8,alignItems:"center",marginBottom:6}}>
                        <span style={{fontSize:9,color:col,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s}</span>
                        <span style={{fontSize:10,fontWeight:"600",color:col,minWidth:16,textAlign:"right"}}>{v}</span>
                        <div style={{background:"#192035",borderRadius:3,height:5,overflow:"hidden"}}>
                          <div style={{height:"100%",borderRadius:3,background:col+"bb",width:pct(v,maxStatus)+"%",transition:"width .4s"}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* STEP FUNNEL PER SEQUENCE */}
              <div className="card" style={{padding:13,marginBottom:14}}>
                <div style={{fontSize:8,color:"#3d5070",letterSpacing:"2px",textTransform:"uppercase",marginBottom:10}}>Step-by-Step Funnel</div>
                {seqStats.filter(s=>s.total>0).length===0&&<div style={{color:"#3d5070",fontSize:10,padding:"16px 0",textAlign:"center"}}>No funnel data yet.</div>}
                {seqStats.filter(s=>s.total>0).map(s=>{
                  const counts=stepFunnel[s.seq.id]||[];
                  const maxCount=counts[0]||1;
                  return(
                    <div key={s.seq.id} style={{marginBottom:16}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
                        <span style={{width:6,height:6,borderRadius:"50%",background:s.seq.color,display:"inline-block"}}/>
                        <span style={{fontSize:10,color:s.seq.color,fontWeight:"500"}}>{s.seq.name}</span>
                        <span style={{fontSize:8,color:"#3d5070"}}>{(counts[0]||0)+" enrolled"}</span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:5}}>
                        {s.seq.steps.map((step,i)=>{
                          const ct=counts[i]||0;const ti=STM[step.type]||{icon:"📋",color:"#4b6280"};
                          const dropPct=i>0&&counts[i-1]>0?100-pct(ct,counts[i-1]):0;
                          return(
                            <div key={i} style={{background:"#080f1c",border:"1px solid #101928",borderRadius:6,padding:"7px 9px"}}>
                              <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                                <span style={{fontSize:9}}>{ti.icon}</span>
                                <span style={{fontSize:7,color:"#3d5070",textTransform:"uppercase",letterSpacing:"1px"}}>Step {i+1}</span>
                              </div>
                              <div style={{fontSize:8,color:"#94a3b8",marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{step.label}</div>
                              <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:s.seq.color,lineHeight:1}}>{ct}</div>
                              <div style={{fontSize:7,color:"#3d5070",marginTop:2}}>{pct(ct,counts[0]||1)}% reached</div>
                              {i>0&&dropPct>0&&<div style={{fontSize:7,color:"#f87171",marginTop:1}}>-{dropPct}% drop</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* LAST-TOUCH ATTRIBUTION */}
              {seqStats.some(s=>Object.keys(s.stepHits).length>0)&&(
                <div className="card" style={{padding:13,marginBottom:14}}>
                  <div style={{fontSize:8,color:"#3d5070",letterSpacing:"2px",textTransform:"uppercase",marginBottom:10}}>Last-Touch Attribution — Meetings + Replies</div>
                  {seqStats.filter(s=>Object.keys(s.stepHits).length>0).map(s=>(
                    <div key={s.seq.id} style={{marginBottom:14}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
                        <span style={{width:6,height:6,borderRadius:"50%",background:s.seq.color,display:"inline-block"}}/>
                        <span style={{fontSize:10,color:s.seq.color}}>{s.seq.name}</span>
                      </div>
                      {Object.entries(s.stepHits).sort((a,b)=>b[1]-a[1]).map(([label,count])=>{
                        const maxHit=Math.max(...Object.values(s.stepHits),1);
                        return(
                          <div key={label} style={{display:"grid",gridTemplateColumns:"2fr auto 2fr",gap:8,alignItems:"center",marginBottom:5}}>
                            <span style={{fontSize:9,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
                            <span style={{fontSize:11,color:"#4ade80",fontWeight:"600",minWidth:20,textAlign:"center"}}>{count}</span>
                            <div style={{background:"#192035",borderRadius:3,height:5,overflow:"hidden"}}>
                              <div style={{height:"100%",borderRadius:3,background:"#4ade80",width:pct(count,maxHit)+"%"}}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}

            </div>
          );
        })()}


        {tab==="library"&&(seqEditor
          ?<SequenceEditor seq={seqEditor} onSave={publishSequence} onDiscard={()=>setSeqEditor(null)} sequences={sequences}/>
          :(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:2}}>SEQUENCE LIBRARY</div><button className="btn bg" style={{fontSize:9,color:"#4ade80"}} onClick={()=>setSeqEditor(mkSeq())}>+ New</button></div>
              {sequences.map(seq=>{
                const enrs=enrollments.filter(e=>e.sequenceId===seq.id);const active=enrs.filter(e=>e.status==="active"||e.status==="paused").length;const totalDays=computeDays(seq.steps).slice(-1)[0]?.day||0;
                return(
                  <div key={seq.id} style={{background:"#0b1220",border:"1px solid #192035",borderLeft:"3px solid "+seq.color,borderRadius:7,padding:"12px 14px",marginBottom:6,display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"center",cursor:"pointer"}} onClick={()=>setSeqEditor({...seq,steps:seq.steps.map(s=>({...s}))})} onMouseEnter={e=>e.currentTarget.style.borderColor="#2563eb"} onMouseLeave={e=>e.currentTarget.style.borderColor="#192035"}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,fontWeight:"500",color:seq.color}}>{seq.name}</span>
                        <span style={{fontSize:8,color:"#3d5070"}}>v{seq.version||1}</span>
                        <span className="badge" style={{background:seq.active?"#0a2018":"#1a1a2e",color:seq.active?"#4ade80":"#818cf8",fontSize:8}}>{seq.active?"Active":"Inactive"}</span>
                        {(seq.rulesets||[]).length>0&&<span style={{fontSize:8,color:"#f97316"}}>[!] {seq.rulesets.length} rules</span>}
                      </div>
                      <div style={{fontSize:9,color:"#4b6280"}}>{seq.steps.length+" steps · Day 1–"+totalDays}</div>
                    </div>
                    <div style={{display:"flex",gap:5,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                      <button className="btn bg" style={{fontSize:9}} onClick={()=>setSeqEditor({...seq,steps:seq.steps.map(s=>({...s}))})}>Edit</button>
                      <button className="btn bg" style={{fontSize:9,color:"#60a5fa"}} onClick={()=>setSeqEditor({...seq,id:uid(),name:"Copy of "+seq.name,builtIn:false,createdAt:today(),version:1,steps:seq.steps.map(s=>({...s,id:"s"+uid()}))})}>Copy</button>
                      <button className="btn bDel" style={{fontSize:9}} onClick={()=>deleteSequence(seq.id)}>Del</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab==="importexport"&&(
          <div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:2,marginBottom:14}}>IMPORT / EXPORT</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div className="card" style={{padding:14}}>
                <div style={{fontSize:9,color:"#3d5070",textTransform:"uppercase",letterSpacing:"2px",marginBottom:8}}>Import CSV</div>
                <div style={{border:"2px dashed #1e2d45",borderRadius:7,padding:20,textAlign:"center",cursor:"pointer"}} onClick={()=>fileRef.current.click()}>
                  <div style={{fontSize:26,marginBottom:6}}>📊</div>
                  <div style={{fontSize:11,color:"#4b6280"}}>Click to select CSV</div>
                </div>
                <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={handleFile}/>
              </div>
              <div className="card" style={{padding:14}}>
                <div style={{fontSize:9,color:"#3d5070",textTransform:"uppercase",letterSpacing:"2px",marginBottom:8}}>Export</div>
                <button className="btn bp" style={{width:"100%",justifyContent:"center",marginBottom:6}} onClick={()=>{dlCSV(toCSV(prospects,["name","city","state","contact","title","phone","email","prospectStatus"]),"ei-"+today()+".csv");flash("Exported!");}}>{"Export All ("+prospects.length+")"}</button>
                <button className="btn bg" style={{width:"100%",justifyContent:"center",fontSize:10,color:"#c084fc",borderColor:"#6b21a8",marginTop:4}} onClick={()=>{dlCSV(toCSV(dispStats.map(d=>({Disposition:d.label,Action:d.action,Count:d.count})),["Disposition","Action","Count"]),"dispositions-"+today()+".csv");flash("Exported!");}}>Export Dispositions</button>
              </div>
            </div>
            {importPrev&&(
              <div className="card" style={{padding:14}}>
                <div style={{fontSize:9,color:"#3d5070",textTransform:"uppercase",letterSpacing:"2px",marginBottom:8}}>{"Preview: "+importPrev.filter(r=>!r.isDupe).length+" new / "+importPrev.filter(r=>r.isDupe).length+" dupes"}</div>
                <div style={{maxHeight:220,overflowY:"auto",marginBottom:10}}>
                  {importPrev.map((r,i)=>(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,padding:"5px 8px",borderRadius:5,marginBottom:3,background:r.isDupe?"#280a0a":"#0a2018",border:"1px solid "+(r.isDupe?"#7f1d1d":"#166534")}}>
                      <div><div style={{fontSize:10,fontWeight:"500"}}>{r.name}{r.isDupe&&<span style={{fontSize:8,color:"#f87171",marginLeft:6}}>DUPE</span>}</div><div style={{fontSize:9,color:"#4b6280"}}>{[r.contact,r.city].filter(Boolean).join(" - ")}</div></div>
                      <span style={{fontSize:9,color:r.isDupe?"#f87171":"#4ade80"}}>{r.isDupe?"skip":"new"}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                  <button className="btn bg" style={{fontSize:9}} onClick={()=>setImportPrev(null)}>Cancel</button>
                  <button className="btn bp" style={{fontSize:9}} onClick={()=>confirmImport(importPrev,true)}>{"Import "+importPrev.filter(r=>!r.isDupe).length+" New"}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {taskModal&&<TaskOutcomeModal taskModal={taskModal} onClose={()=>setTaskModal(null)} onSubmit={(dk,note)=>logDisposition(taskModal.e.id,dk,note)} onSkip={()=>{skipTask(taskModal.e.id);setTaskModal(null);}}/>}
      {bulkOutModal&&<BulkOutcomeModal count={queueBulkSel.size} onClose={()=>setBulkOutModal(false)} onSubmit={bulkLogDisposition}/>}
      {bulkStartModal&&<BulkStartSeqModal selProspects={selProspects} enrollments={enrollments} sequences={sequences} onClose={()=>setBulkStartModal(false)} onConfirm={handleBulkStart}/>}
      {bulkSwitchModal&&<BulkSwitchSeqModal selProspects={selProspects} sequences={sequences} onClose={()=>setBulkSwitchModal(false)} onConfirm={handleBulkSwitch}/>}
      {bulkRemoveModal&&<BulkRemoveSeqModal selProspects={selProspects} enrollments={enrollments} onClose={()=>setBulkRemoveModal(false)} onConfirm={handleBulkRemove}/>}
      {bulkStatusModal&&<BulkChangeStatusModal selProspects={selProspects} onClose={()=>setBulkStatusModal(false)} onConfirm={handleBulkStatus}/>}

      {bulkSkipConf&&(
        <div className="mBg" onClick={()=>setBulkSkipConf(false)}>
          <div className="modal" style={{maxWidth:380}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,marginBottom:8,color:"#fbbf24"}}>Skip {queueBulkSel.size} Tasks?</div>
            <div style={{fontSize:10,color:"#64748b",marginBottom:14,lineHeight:1.7}}>Skipped steps advance the sequence without logging a disposition.</div>
            <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}>
              <button className="btn bg" onClick={()=>setBulkSkipConf(false)}>Cancel</button>
              <button className="btn bOr" onClick={()=>{[...queueBulkSel].forEach(id=>skipTask(id));setQueueBulkSel(new Set());setBulkSkipConf(false);flash("Skipped");}}>Skip All</button>
            </div>
          </div>
        </div>
      )}
      {pushModal&&(
        <div className="mBg" onClick={()=>setPushModal(null)}>
          <div className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,marginBottom:4,color:"#fbbf24"}}>Publish v{pushModal.seq.version}</div>
            <div style={{background:"#080f1c",border:"1px solid #1e3a22",borderRadius:8,padding:14,marginBottom:14}}>
              <div style={{fontSize:11,color:"#4ade80",fontWeight:"500",marginBottom:6}}>✓ Active enrollments are protected</div>
              <div style={{fontSize:10,color:"#64748b",lineHeight:1.7}}><strong style={{color:"#94a3b8"}}>{pushModal.activeCount} active prospect{pushModal.activeCount!==1?"s":""}</strong> continue on their current version.</div>
            </div>
            <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}>
              <button className="btn bg" onClick={()=>setPushModal(null)}>Cancel</button>
              <button className="btn bp" onClick={()=>commitPublish(pushModal.seq)}>Publish v{pushModal.seq.version}</button>
            </div>
          </div>
        </div>
      )}
      {rptDrilldown&&(
        <div className="mBg" onClick={()=>setRptDrilldown(null)}>
          <div className="modal" style={{maxWidth:500}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:12,alignItems:"flex-start"}}>
              <div><div style={{fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:2,color:"#c084fc"}}>{rptDrilldown.title}</div><div style={{fontSize:9,color:"#4b6280"}}>{rptDrilldown.prospectIds.length+" prospects"}</div></div>
              <button className="btn bg" onClick={()=>setRptDrilldown(null)}>✕</button>
            </div>
            <div style={{maxHeight:400,overflowY:"auto"}}>
              {rptDrilldown.prospectIds.map(id=>{
                const p=prospects.find(x=>x.id===id);if(!p)return null;
                const enr=getActiveEnr(p.id);const sq=enr?sequences.find(s=>s.id===enr.sequenceId):null;const ld=enr?.lastDisposition?DISP_MAP[enr.lastDisposition]:null;
                return(
                  <div key={id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",borderRadius:6,marginBottom:3,background:"#07090f",border:"1px solid #101928",cursor:"pointer"}} onClick={()=>{setSelId(p.id);setTab("prospects");setRptDrilldown(null);}}>
                    <div><div style={{fontSize:11,color:"#dde4ef"}}>{p.name}</div><div style={{fontSize:9,color:"#4b6280"}}>{p.prospectStatus}</div></div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      {ld&&<span style={{padding:"2px 8px",borderRadius:8,fontSize:8,background:ld.color+"18",color:ld.color}}>{ld.icon+" "+ld.label}</span>}
                      {sq&&<span style={{fontSize:8,color:sq.color}}>{sq.name.split(" ")[0]}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {saveViewModal&&(
        <div className="mBg" onClick={()=>setSaveViewModal(false)}>
          <div className="modal" style={{maxWidth:360}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,marginBottom:12}}>SAVE VIEW</div>
            <input value={newViewName} onChange={e=>setNewViewName(e.target.value)} placeholder="View name…" style={{width:"100%",marginBottom:12}} autoFocus/>
            <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}>
              <button className="btn bg" onClick={()=>setSaveViewModal(false)}>Cancel</button>
              <button className="btn bp" onClick={saveCurrentView}>Save</button>
            </div>
          </div>
        </div>
      )}
      {addModal&&(
        <div className="mBg" onClick={()=>setAddModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2,marginBottom:12}}>ADD PROSPECT</div>
            <div className="fr"><div><div className="fl">Agency Name</div><input value={addForm.name} onChange={e=>setAddForm(f=>({...f,name:e.target.value}))} placeholder="Sunrise EI Services"/></div><div><div className="fl">Contact Name</div><input value={addForm.contact} onChange={e=>setAddForm(f=>({...f,contact:e.target.value}))} placeholder="Jane Smith"/></div></div>
            <div className="fr"><div><div className="fl">Title</div><input value={addForm.title} onChange={e=>setAddForm(f=>({...f,title:e.target.value}))} placeholder="Executive Director"/></div><div><div className="fl">Phone</div><input value={addForm.phone} onChange={e=>setAddForm(f=>({...f,phone:e.target.value}))} placeholder="215-555-0100"/></div></div>
            <div style={{marginBottom:7}}><div className="fl">Email</div><input value={addForm.email} onChange={e=>setAddForm(f=>({...f,email:e.target.value}))} style={{width:"100%"}}/></div>
            <div className="fr"><div><div className="fl">City</div><input value={addForm.city} onChange={e=>setAddForm(f=>({...f,city:e.target.value}))}/></div><div><div className="fl">State</div><input value={addForm.state} onChange={e=>setAddForm(f=>({...f,state:e.target.value}))}/></div></div>
            <div style={{marginBottom:10}}><div className="fl">Enroll in Sequence</div><select value={addForm.sequenceName||""} onChange={e=>setAddForm(f=>({...f,sequenceName:e.target.value}))} style={{width:"100%"}}><option value="">- Don't enroll yet -</option>{sequences.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
              <button className="btn bg" onClick={()=>setAddModal(false)}>Cancel</button>
              <button className="btn bp" onClick={async()=>{if(!addForm.name.trim()){flash("Name required","err");return;}const p=mkP(addForm);setP(prev=>[...prev,p]);if(addForm.sequenceName)setTimeout(()=>enrollProspect(p.id,addForm.sequenceName),100);setAddForm(BLANK);setAddModal(false);flash("Added!");}}>Add</button>
            </div>
          </div>
        </div>
      )}
      {settingsOpen&&<SettingsModal settings={settings} onClose={()=>setSettingsOpen(false)} onSave={(wh:any)=>{setSettings(wh);S.save(KEYS.cfg,wh);setSettingsOpen(false);flash("Saved!");}}/>}
      {toast&&<div className="toast" style={{background:toast.t==="ok"?"#0a2018":toast.t==="err"?"#280a0a":"#1a1000",color:toast.t==="ok"?"#4ade80":toast.t==="err"?"#f87171":"#fbbf24",borderColor:toast.t==="ok"?"#166534":toast.t==="err"?"#7f1d1d":"#92400e"}}>{toast.m}</div>}
    </div>
  );
}
