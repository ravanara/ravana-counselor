export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ثبت‌نام
    if (url.pathname === '/api/register' && request.method === 'POST') {
      try {
        const { name, phone } = await request.json();
        if (!name || !phone) {
          return Response.json({ error: 'نام و شماره تماس الزامی است' }, { status: 400, headers: corsHeaders });
        }
        const sessionId = crypto.randomUUID();
        await env.DB.prepare(
          'INSERT INTO visitors (session_id, name, phone, created_at) VALUES (?, ?, ?, ?)'
        ).bind(sessionId, name, phone, new Date().toISOString());
        return Response.json({ sessionId }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: 'خطا در ثبت‌نام' }, { status: 500, headers: corsHeaders });
      }
    }

    // چت با AI (نسخه‌ی ساده و تست‌شده)
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const { sessionId, message } = await request.json();
        if (!sessionId || !message) {
          return Response.json({ error: 'پارامتر ناقص' }, { status: 400, headers: corsHeaders });
        }

        // ذخیره پیام کاربر
        await env.DB.prepare(
          'INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)'
        ).bind(sessionId, 'user', message, new Date().toISOString());

        // ساخت پیام برای AI
        const messages = [
          {
            role: 'system',
            content: 'تو دستیار هوش مصنوعی دکتر حسین بیدمشکی هستی. تخصص تو روانشناسی کودک، نوجوان و خانواده است. پاسخ‌هایت کوتاه، مفید و فارسی باشند.'
          },
          {
            role: 'user',
            content: message
          }
        ];

        // فراخوانی مدل AI
        const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages });
        const responseText = aiResponse.response || 'متأسفم، در حال حاضر پاسخی دریافت نشد. لطفاً دوباره تلاش کنید.';

        // ذخیره پاسخ ربات
        await env.DB.prepare(
          'INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)'
        ).bind(sessionId, 'assistant', responseText, new Date().toISOString());

        return Response.json({ response: responseText }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: 'خطا در پردازش: ' + e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // فرم تماس
    if (url.pathname === '/api/contact' && request.method === 'POST') {
      try {
        const { name, phone, subject } = await request.json();
        const sessionId = crypto.randomUUID();
        await env.DB.prepare(
          'INSERT INTO visitors (session_id, name, phone, created_at) VALUES (?, ?, ?, ?)'
        ).bind(sessionId, name + ' (فرم تماس)', phone, new Date().toISOString());
        await env.DB.prepare(
          'INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)'
        ).bind(sessionId, 'user', 'درخواست مشاوره: ' + (subject || 'بدون موضوع'), new Date().toISOString());
        return Response.json({ success: true, message: 'درخواست شما ثبت شد. به زودی تماس می‌گیریم.' }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: 'خطا در ثبت درخواست' }, { status: 500, headers: corsHeaders });
      }
    }

    // پنل مدیریت
    if (url.pathname === '/admin') {
      return new Response(generateAdminPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    // API: لیست مراجعین
    if (url.pathname === '/admin/api/visitors' && request.method === 'GET') {
      try {
        const visitors = await env.DB.prepare(
          `SELECT v.*, COUNT(m.id) as msg_count
           FROM visitors v
           LEFT JOIN messages m ON v.session_id = m.session_id
           GROUP BY v.session_id
           ORDER BY v.created_at DESC`
        ).all();
        return Response.json({ visitors: visitors.results }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: 'خطا' }, { status: 500, headers: corsHeaders });
      }
    }

    // API: پیام‌های یک مراجع
    if (url.pathname.startsWith('/admin/api/messages/') && request.method === 'GET') {
      const sessionId = url.pathname.split('/').pop();
      try {
        const messages = await env.DB.prepare(
          'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC'
        ).bind(sessionId).all();
        return Response.json({ messages: messages.results }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: 'خطا' }, { status: 500, headers: corsHeaders });
      }
    }

    return new Response('روان‌آرا — Worker فعال است ✅', {
      status: 200,
      headers: corsHeaders
    });
  }
};

function generateAdminPage() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>پنل مدیریت — روان‌آرا</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Vazirmatn',sans-serif}
body{background:#F4F7FB;padding:1rem}
.header{background:linear-gradient(135deg,#0B1F3A,#1B4F8A);color:#fff;padding:1.5rem;border-radius:12px;margin-bottom:1.5rem}
.header h1{font-size:18px}
.header p{font-size:11px;color:#7EC8E3}
.stats{display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap}
.stat{background:#fff;padding:1rem 1.5rem;border-radius:8px;flex:1;min-width:120px;text-align:center;border:1px solid #DDE6F0}
.stat-n{font-size:28px;font-weight:800;color:#1B4F8A}
.stat-l{font-size:10px;color:#7a8fa6}
.table-wrap{background:#fff;border-radius:8px;overflow:auto;border:1px solid #DDE6F0}
table{width:100%;border-collapse:collapse;min-width:500px}
th{background:#F4F7FB;padding:12px;font-size:11px;text-align:right;font-weight:700}
td{padding:12px;font-size:12px;border-top:1px solid #DDE6F0}
tr:hover{background:#FAFBFD}
.btn{background:#1B4F8A;color:#fff;border:none;padding:5px 14px;border-radius:4px;font-size:10px;cursor:pointer}
.empty{text-align:center;padding:2rem;color:#7a8fa6}
</style>
</head>
<body>
<div class="header">
  <h1>🧑‍⚕️ پنل مدیریت روان‌آرا</h1>
  <p>دکتر حسین بیدمشکی — پرونده‌های مراجعین</p>
</div>
<div class="stats">
  <div class="stat"><div class="stat-n" id="totalV">۰</div><div class="stat-l">کل مراجعین</div></div>
  <div class="stat"><div class="stat-n" id="totalM">۰</div><div class="stat-l">کل پیام‌ها</div></div>
</div>
<div class="table-wrap">
  <table>
    <thead><tr><th>نام</th><th>شماره</th><th>تاریخ</th><th>پیام‌ها</th><th>عملیات</th></tr></thead>
    <tbody id="visitorTable"></tbody>
  </table>
</div>
<script>
function faNum(n){return String(n).replace(/\\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d])}
fetch('/admin/api/visitors').then(r=>r.json()).then(d=>{
  const t=document.getElementById('visitorTable');
  const visitors=d.visitors||[];
  document.getElementById('totalV').textContent=faNum(visitors.length);
  let totalM=0;
  visitors.forEach(v=>{totalM+=v.msg_count;t.innerHTML+='<tr><td>'+v.name+'</td><td>'+v.phone+'</td><td>'+new Date(v.created_at).toLocaleDateString('fa-IR')+'</td><td>'+faNum(v.msg_count)+'</td><td><button class="btn" onclick="alert(\'برای مشاهده گفتگو، به بخش گفتگوها بروید\')">مشاهده</button></td></tr>'});
  document.getElementById('totalM').textContent=faNum(totalM);
}).catch(()=>{document.getElementById('visitorTable').innerHTML='<tr><td colspan="5" class="empty">خطا در بارگذاری</td></tr>'});
</script>
</body>
</html>`;
}
