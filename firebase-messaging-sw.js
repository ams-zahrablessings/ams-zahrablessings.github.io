importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey:"AIzaSyBfpjKyzMLYVxdn8AkiH0H9V4s2528liZg",
  authDomain:"ams-zahrablessings.firebaseapp.com",
  projectId:"ams-zahrablessings",
  storageBucket:"ams-zahrablessings.firebasestorage.app",
  messagingSenderId:"935643680722",
  appId:"1:935643680722:web:f075e9accdcfa88993820b"
});
firebase.messaging();
self.addEventListener("notificationclick",function(e){
  e.notification.close();
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){if("focus" in list[i])return list[i].focus()}
    return clients.openWindow(self.registration.scope);
  }));
});
