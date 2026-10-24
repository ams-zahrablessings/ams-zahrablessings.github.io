/* AMS: Firebase connection, phone + PIN login, and a small adapter so the app code is unchanged. */
import {initializeApp} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {getAuth,signInWithEmailAndPassword,createUserWithEmailAndPassword,updateProfile,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,addDoc,onSnapshot,query,where,orderBy,limit} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const firebaseConfig={
  apiKey:"AIzaSyBfpjKyzMLYVxdn8AkiH0H9V4s2528liZg",
  authDomain:"ams-zahrablessings.firebaseapp.com",
  projectId:"ams-zahrablessings",
  storageBucket:"ams-zahrablessings.firebasestorage.app",
  messagingSenderId:"935643680722",
  appId:"1:935643680722:web:f075e9accdcfa88993820b"
};
const DEFAULT_CC="92";
const STAFF=["super","committee","finance"];

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
let fs;
try{fs=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}
catch(e){fs=initializeFirestore(app,{})}

/* ---- adapter: same small API the app already uses ---- */
function mapErr(e){
  const c=(e&&e.code)||"";
  if(c==="permission-denied"||c==="unauthenticated")return {code:"invalid_argument",message:"permission"};
  if(c==="resource-exhausted")return {code:"resource_exhausted",message:"quota"};
  return {code:c||"unknown",message:(e&&e.message)||""};
}
const rethrow=e=>{throw mapErr(e)};
const wrapDoc=s=>({id:s.id,exists:s.exists(),data:()=>s.exists()?s.data():undefined});
const wrapQ=s=>{const d=s.docs.map(x=>({id:x.id,exists:true,data:()=>x.data()}));return {docs:d,size:d.length,empty:!d.length}};
function docRef(path){
  const r=doc(fs,path);
  return {id:r.id,path,
    get:()=>getDoc(r).then(wrapDoc).catch(rethrow),
    set:d=>setDoc(r,d).catch(rethrow),
    update:d=>updateDoc(r,d).catch(rethrow),
    delete:()=>deleteDoc(r).catch(rethrow),
    onSnapshot:(cb,err)=>onSnapshot(r,s=>cb(wrapDoc(s)),e=>err&&err(mapErr(e))),
    collection:c=>colRef(path+"/"+c)};
}
function colRef(path,cons){
  cons=cons||[];
  const c=collection(fs,path);
  const q=()=>cons.length?query(c,...cons):c;
  return {path,
    doc:id=>docRef(path+"/"+(id||doc(c).id)),
    add:async d=>{const r=await addDoc(c,d).catch(rethrow);return docRef(path+"/"+r.id)},
    where:(f,op,v)=>colRef(path,cons.concat(where(f,op,v))),
    orderBy:(f,dir)=>colRef(path,cons.concat(orderBy(f,dir||"asc"))),
    limit:n=>colRef(path,cons.concat(limit(n))),
    get:()=>getDocs(q()).then(wrapQ).catch(rethrow),
    onSnapshot:(cb,err)=>onSnapshot(q(),s=>cb(wrapQ(s)),e=>err&&err(mapErr(e)))};
}
const db={doc:docRef,collection:colRef};

/* ---- downloads (browser) ---- */
const downloads={save:async({filename,data})=>{
  const blob=data instanceof Blob?data:new Blob([data],{type:"text/plain;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)}};

/* ---- login screen ---- */
const digits=s=>String(s||"").replace(/\D/g,"");
function normPhone(p){let d=digits(p);if(d.startsWith("00"))d=d.slice(2);else if(d.startsWith("0"))d=DEFAULT_CC+d.slice(1);return d}
const emailOf=p=>"p"+normPhone(p)+"@ams.invalid";
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css=`#auth{position:fixed;inset:0;z-index:100;background:var(--bg);overflow:auto;display:flex;justify-content:center;padding:max(24px,env(safe-area-inset-top)) 16px 24px}
#auth .ac{width:100%;max-width:420px;display:flex;flex-direction:column;gap:14px}
#auth .ah{border-radius:18px;padding:22px 18px;color:#fff;background:linear-gradient(135deg,var(--h1,#0B6B63),var(--h2,#2C8C7B) 60%,var(--h3,#4AA59A))}
#auth .ah h1{font-size:26px;margin:0}#auth .ah p{margin:6px 0 0;opacity:.9;font-size:14px}
#auth form{display:flex;flex-direction:column;gap:12px}
#auth .err{background:var(--bad-bg);color:var(--bad);border-radius:10px;padding:9px 12px;font-size:14px;font-weight:600}
#auth .note{color:var(--muted);font-size:13px}
#auth .linkb{border:0;background:none;color:var(--accent);font-weight:600;padding:6px}`;
function authUI(){let el=document.getElementById("auth");if(!el){const st=document.createElement("style");st.textContent=css;document.head.appendChild(st);el=document.createElement("div");el.id="auth";document.body.appendChild(el)}return el}
function fld(id,label,type,extra){return `<label class="f" for="${id}"><span>${label}</span><input id="${id}" name="${id}" type="${type}" ${extra||""}></label>`}
function friendly(e){
  const c=(e&&e.code)||"";
  if(c.includes("invalid-credential")||c.includes("wrong-password")||c.includes("user-not-found"))return "The phone number or PIN is not correct.";
  if(c.includes("email-already-in-use"))return "This phone number already has an account. Please sign in.";
  if(c.includes("too-many-requests"))return "Too many tries. Please wait a few minutes and try again.";
  if(c.includes("network"))return "No internet connection. Please check and try again.";
  if(c.includes("weak-password"))return "The PIN must be exactly 6 digits.";
  return "Something went wrong. Please try again.";
}
let bname="Apartment Management";let started=false;
async function loadInfo(){try{const s=await getDoc(doc(fs,"public/info"));if(s.exists()&&s.data().name)bname=s.data().name}catch(e){}}
function showLogin(mode){
  const el=authUI();el.hidden=false;
  const up=mode==="up";
  el.innerHTML=`<div class="ac"><div class="ah"><h1>${esc(bname)}</h1><p>${up?"Create your account":"Welcome. Sign in with your phone number and PIN."}</p></div>
  <form id="af" novalidate>${up?fld("an","Your full name","text",'autocomplete="name" maxlength="80"'):""}
  ${fld("ap","Mobile number","tel",'inputmode="tel" autocomplete="tel" placeholder="03xx xxxxxxx"')}
  ${fld("apin",up?"Choose a 6-digit PIN":"Your 6-digit PIN","password",'inputmode="numeric" maxlength="6" autocomplete="'+(up?"new-password":"current-password")+'"')}
  ${up?fld("apin2","Repeat the PIN","password",'inputmode="numeric" maxlength="6" autocomplete="new-password"'):""}
  <div id="aerr" class="err" hidden></div>
  <button class="btn" type="submit">${up?"Create account":"Sign in"}</button></form>
  <button class="linkb" id="aswitch">${up?"I already have an account. Sign in":"New here? Create an account"}</button>
  ${up?"":'<div class="note">Forgot your PIN? Ask the building committee to reset it.</div>'}</div>`;
  document.getElementById("aswitch").onclick=()=>showLogin(up?"in":"up");
  document.getElementById("af").onsubmit=async ev=>{
    ev.preventDefault();const g=i=>(document.getElementById(i)||{}).value||"";const err=document.getElementById("aerr");const btn=ev.target.querySelector("button[type=submit]");
    const bad=m=>{err.textContent=m;err.hidden=false};err.hidden=true;
    const ph=normPhone(g("ap")),pin=g("apin").trim();
    if(ph.length<10)return bad("Please enter your full mobile number.");
    if(!/^\d{6}$/.test(pin))return bad("The PIN must be exactly 6 digits.");
    if(up){if(g("an").trim().length<2)return bad("Please enter your full name.");if(pin!==g("apin2").trim())return bad("The two PINs do not match.")}
    btn.disabled=true;
    try{
      if(up){started=true;const c=await createUserWithEmailAndPassword(auth,emailOf(ph),pin);await updateProfile(c.user,{displayName:g("an").trim()});afterLogin(c.user)}
      else await signInWithEmailAndPassword(auth,emailOf(ph),pin);
    }catch(e){started=false;btn.disabled=false;bad(friendly(e))}
  };
}
function showMsg(html){const el=authUI();el.hidden=false;el.innerHTML=`<div class="ac"><div class="ah"><h1>${esc(bname)}</h1></div>${html}</div>`}

/* ---- after sign-in ---- */
async function afterLogin(u){
  let role=null;
  try{const rs=await getDoc(doc(fs,"roles/"+u.uid));if(rs.exists())role=rs.data().role}catch(e){}
  if(!role){
    let exists=true;try{const p=await getDoc(doc(fs,"public/info"));exists=p.exists()}catch(e){}
    if(!exists){
      showMsg(`<div class="card"><div class="title">Set up this building</div><div class="meta">No building has been set up yet. If you are the first administrator, continue. You will then enter the building name and flats.</div><div class="actions"><button class="btn" id="boot">Set up as administrator</button><button class="btn ghost" id="bout">Sign out</button></div></div>`);
      document.getElementById("bout").onclick=()=>signOut(auth).then(()=>location.reload());
      document.getElementById("boot").onclick=async()=>{try{await setDoc(doc(fs,"roles/"+u.uid),{role:"super",name:(auth.currentUser&&auth.currentUser.displayName)||u.displayName||"Administrator",phone:"",ts:Date.now()});location.reload()}catch(e){alert("Could not set up. Check your connection and try again.")}};
      return;
    }
  }
  const mk=r=>({
    isOwner:async()=>r==="super",
    canEdit:async()=>STAFF.includes(r),
    can:async()=>true,
    id:async()=>u.uid,
    me:async()=>({id:u.uid,name:u.displayName||""}),
    profiles:async ids=>{const o={};if(r!=="super"&&r!=="committee")return o;
      await Promise.all(ids.map(async i=>{try{const s=await getDoc(doc(fs,"roles/"+i));if(s.exists())o[i]={name:s.data().name||""}}catch(e){}}));return o}
  });
  window.claude={use:async n=>n==="db"?db:(n==="user"?mk(role):(n==="downloads"?downloads:null))};
  window.__signOut=()=>signOut(auth).then(()=>location.reload());
  window.__fbApp=app;window.__idToken=()=>auth.currentUser.getIdToken();
  const a=document.getElementById("auth");if(a)a.hidden=true;
  window.__start();
}
(async()=>{
  await loadInfo();
  onAuthStateChanged(auth,u=>{
    if(!u){started=false;showLogin("in");return}
    if(started)return;started=true;afterLogin(u);
  });
})();
