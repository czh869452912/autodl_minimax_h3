// Local emulator QA companion for m1-skill-device.jsx; no provider requests.
const http = require('node:http');
let requests = 0;
http.createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({fixture: true, requests}));
    return;
  }
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let input;
    try { input = JSON.parse(body); } catch { res.writeHead(400); res.end(); return; }
    const common = {id: `m1-fixture-${++requests}`, created: Math.floor(Date.now() / 1000), model: 'offline-fixture'};
    const content = '离线测试答复：已收到描述。本轮只验证会话与技能选择，不调用生成服务。';
    if (input.stream) {
      res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache'});
      for (const choice of [{delta: {role: 'assistant', content: ''}, finish_reason: null}, {delta: {content}, finish_reason: null}, {delta: {}, finish_reason: 'stop'}]) {
        res.write(`data: ${JSON.stringify({...common, object: 'chat.completion.chunk', choices: [{index: 0, ...choice}]})}\n\n`);
      }
      res.end('data: [DONE]\n\n');
    } else {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({...common, object: 'chat.completion', choices: [{index: 0, message: {role: 'assistant', content}, finish_reason: 'stop'}]}));
    }
  });
}).listen(8877, '127.0.0.1');
