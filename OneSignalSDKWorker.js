importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD7q67flMcZpQf1R9BhyHUTiRKLBR5gesQ",
  authDomain: "first-try-1448d.firebaseapp.com",
  databaseURL: "https://first-try-1448d-default-rtdb.firebaseio.com",
  projectId: "first-try-1448d",
  storageBucket: "first-try-1448d.firebasestorage.app",
  messagingSenderId: "198036076919",
  appId: "1:198036076919:web:9a259a5a7c3e6534618972"
});

const db = firebase.database();

// PWA Shell Cache
const CACHE_NAME = 'piupiu-shell-v5';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
    ])
  );
});

// Network-first fetch strategy with offline cache fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});

// পুশ নোটিফিকেশন ইন্টারসেপ্ট করে স্টাইল ও অ্যাকশন বাটন নিশ্চিত করা
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    return;
  }

  const custom = payload.custom ? payload.custom.a : (payload.data || {});
  const senderName = custom.senderName || payload.title || "Partner";
  const senderPhoto = custom.senderPhoto || "https://api.dicebear.com/7.x/bottts/svg?seed=Partner";
  const isAudio = custom.isAudio === true || custom.isAudio === "true";
  
  let bodyText = payload.alert || payload.body || "New message";
  if (isAudio) bodyText = "🎤 Sent an audio message to you";
  else if (payload.subTitle && payload.subTitle.includes("GIF")) bodyText = "Sent a GIF";

  event.stopImmediatePropagation();

  const notificationOptions = {
    body: bodyText,
    icon: senderPhoto,
    badge: "https://api.dicebear.com/7.x/bottts/svg?seed=ForeverSpace",
    tag: custom.senderUid ? `chat_${custom.senderUid}` : "direct_chat",
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      senderUid: custom.senderUid,
      targetUid: custom.targetUid,
      chatId: custom.chatId
    },
    actions: [
      {
        action: 'action_like',
        title: 'Like'
      },
      {
        action: 'action_reply',
        title: 'Reply',
        type: 'text',
        placeholder: 'Type a reply...'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(senderName, notificationOptions)
  );
}, true);

// অ্যাকশন বাটন ক্লিক বা ইনলাইন রিপ্লাই হ্যান্ডলার
self.addEventListener('notificationclick', (event) => {
  const notif = event.notification;
  const data = notif.data || {};
  const action = event.action;

  if (action === 'action_like') {
    notif.close();
    event.waitUntil(sendQuickReplyToFirebase(data, '👍'));
    return;
  }

  if (action === 'action_reply') {
    notif.close();
    const replyText = event.reply;
    if (replyText && replyText.trim()) {
      event.waitUntil(sendQuickReplyToFirebase(data, replyText.trim()));
    }
    return;
  }

  notif.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

async function sendQuickReplyToFirebase(data, text) {
  // ১. কোনো ওপেন উইন্ডো থাকলে মেসেজ ফরোয়ার্ড করা (authenticated write)
  const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (let client of windowClients) {
    if (client.url.includes(self.location.origin)) {
      client.postMessage({
        type: 'SEND_QUICK_REPLY',
        data: data,
        text: text
      });
      return;
    }
  }

  // ২. উইন্ডো না থাকলে সরাসরি ডাটাবেসে লেখার চেষ্টা করা
  try {
    const targetUid = data.targetUid;
    const senderUid = data.senderUid;
    if (!senderUid || !targetUid) return;

    const chatId = data.chatId || [targetUid, senderUid].sort().join("_");
    const timeObj = new Date();
    let hours = timeObj.getHours();
    const minutes = timeObj.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const timeStr = `${hours}:${minutes < 10 ? '0' + minutes : minutes} ${ampm}`;

    const msgObj = {
      senderId: targetUid,
      senderName: "You",
      text: text,
      time: timeStr,
      seen: false,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    await db.ref(`direct_chats/${chatId}/messages`).push(msgObj);
    await db.ref(`user_chats/${targetUid}/${senderUid}`).update({
      lastMessage: text,
      time: timeStr,
      timestamp: Date.now(),
      unread: false
    });
    await db.ref(`user_chats/${senderUid}/${targetUid}`).update({
      lastMessage: text,
      time: timeStr,
      timestamp: Date.now(),
      unread: true
    });
  } catch (err) {
    console.warn("Direct notification quick reply fallback:", err);
  }
}