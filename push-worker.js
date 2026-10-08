// ============================================================
// PiuPiu Push Notification Relay — Cloudflare Worker
// ============================================================
// কেন এটা দরকার:
// OneSignal-এ পুশ নোটিফিকেশন পাঠাতে হলে "REST API Key" ব্যবহার করতে হয়,
// কিন্তু এই কী কখনোই ব্রাউজারের (ক্লায়েন্ট-সাইড) কোডে রাখা নিরাপদ নয় —
// যে কেউ পেজ সোর্স দেখে সেটা চুরি করে যা খুশি নোটিফিকেশন পাঠাতে পারবে।
// তাই এই ছোট্ট Worker-টা মাঝখানে বসে থাকে: অ্যাপ এটাকে টার্গেট ইউজার +
// মেসেজ পাঠায়, আর এই Worker গোপন কী দিয়ে আসল OneSignal API কল করে।
//
// ডিপ্লয় করার ধাপ:
// 1. https://dash.cloudflare.com -> Workers & Pages -> Create -> "Create Worker"
// 2. এই পুরো ফাইলের কোড কপি করে ওয়ার্কারের এডিটরে পেস্ট করে Deploy করো।
// 3. OneSignal Dashboard -> Settings -> Keys & IDs -> "REST API Key" কপি করো।
// 4. Worker-এর Settings -> Variables and Secrets -> "Add" ->
//      Name:  ONESIGNAL_REST_API_KEY
//      Value: (তোমার OneSignal REST API Key)
//      Type:  Secret (এনক্রিপ্টেড রাখো, প্লেইন টেক্সট ভ্যারিয়েবল না)
// 5. Deploy হওয়ার পর যে URL পাবে (যেমন https://piupiu-push.yourname.workers.dev),
//    সেটা index.html ফাইলে CF_WORKER_URL = "..." লাইনে বসিয়ে দাও।
// ============================================================

export default {
  async fetch(request, env) {
    // ব্রাউজার থেকে ক্রস-অরিজিন রিকোয়েস্টের জন্য CORS preflight হ্যান্ডল করা
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const data = await request.json();
      const { targetUid, senderName, senderPhoto, title, bodyText, appId } = data;

      if (!targetUid || !appId) {
        return jsonResponse({ error: "targetUid বা appId পাওয়া যায়নি" }, 400);
      }
      if (!env.ONESIGNAL_REST_API_KEY) {
        return jsonResponse({ error: "ONESIGNAL_REST_API_KEY সেট করা নেই — Worker-এর Settings -> Variables and Secrets-এ যোগ করো" }, 500);
      }

      // OneSignal-এ ইউজারকে খুঁজে বের করা হচ্ছে external_id দিয়ে —
      // এটা ক্লায়েন্ট-সাইডে OneSignal.login(uid) কল করার সময় সেট হয়েছিল।
      const oneSignalPayload = {
        app_id: appId,
        include_aliases: { external_id: [targetUid] },
        target_channel: "push",
        headings: { en: title || senderName || "New message" },
        contents: { en: bodyText || "You have a new message" }
      };
      if (senderPhoto) oneSignalPayload.large_icon = senderPhoto;

      const oneSignalRes = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": `Key ${env.ONESIGNAL_REST_API_KEY}`
        },
        body: JSON.stringify(oneSignalPayload)
      });

      const result = await oneSignalRes.json();
      return jsonResponse(result, oneSignalRes.status);

    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }
};

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
