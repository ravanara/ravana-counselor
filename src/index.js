// ====== کد اصلی Worker ======
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

    // ثبت‌نام کاربر
    if (url.pathname === '/api/register' && request.method === 'POST') {
      try {
        const { name, phone } = await request.json();
        if (!name || !phone) return Response.json({ error: 'نام و شماره تماس الزامی است' }, { status: 400, headers: corsHeaders });
        const sessionId = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO visitors (session_id, name, phone, created_at) VALUES (?, ?, ?, ?)')
          .bind(sessionId, name, phone, new Date().toISOString());
        return Response.json({ sessionId }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: 'خطا در ثبت‌نام' }, { status: 500, headers: corsHeaders });
      }
    }

    // چت با AI
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const { sessionId, message } = await request.json();
        if (!sessionId || !message) return Response.json({ error: 'پارامتر ناقص' }, { status: 400, headers: corsHeaders });

        await env.DB.prepare('INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)')
          .bind(sessionId, 'user', message, new Date().toISOString());

        const history = await env.DB.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 10')
          .bind(sessionId).all();

        const messages = [
          { role: 'system', content: `تو دستیار هوش مصنوعی دکتر حسین بیدمشکی هستی، دکترای تخصصی روانشناسی. تخصص تو: روانشناسی کودک، نوجوان، خانواده و سلامت روان است. پاسخ‌هایت باید فارسی، مهربانانه، علمی و مختصر باشند. همیشه یادآوری کن که این مشاوره جایگزین جلسه حضوری نیست. در موارد اضطراری به ۱۲۳ یا اورژانس اجتماعی ۱۴۸۰ ارجاع بده.` },
          ...history.results.reverse().map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
        ];

        const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages });
        const responseText = aiResponse.response || 'متأسفم، در حال حاضر پاسخی دریافت نشد.';

        await env.DB.prepare('INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)')
          .bind(sessionId, 'assistant', responseText, new Date().toISOString());

        return Response.json({ response: responseText }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: 'خطا در پردازش' }, { status: 500, headers: corsHeaders });
      }
    }

    // پنل مدیریت
    if (url.pathname === '/admin') {
      return new Response(generateAdminPage(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }
    if (url.pathname === '/admin/api/visitors' && request.method === 'GET') {
      try {
        const visitors = await env.DB.prepare('SELECT v.*, COUNT(m.id) as msg_count FROM visitors v LEFT JOIN messages m ON v.session_id = m.session_id GROUP BY v.session_id ORDER BY v.created_at DESC').all();
        return Response.json({ visitors: visitors.results }, { headers: corsHeaders });
      } catch (e) { return Response.json({ error: 'خطا' }, { status: 500, headers: corsHeaders }); }
    }
    if (url.pathname.startsWith('/admin/api/messages/') && request.method === 'GET') {
      const sessionId = url.pathname.split('/').pop();
      try {
        const messages = await env.DB.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC').bind(sessionId).all();
        return Response.json({ messages: messages.results }, { headers: corsHeaders });
      } catch (e) { return Response.json({ error: 'خطا' }, { status: 500, headers: corsHeaders }); }
    }

    return new Response('روان‌آرا — Worker فعال است ✅', { status: 200, headers: corsHeaders });
  }
};

// ====== HTML پنل مدیریت (قسمت کوتاه شده) ======
function generateAdminPage() {
  return `<!DOCTYPE html>...`; // برای اختصار، کل کد HTML اینجا قرار می‌گیرد
}