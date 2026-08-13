/**
 * Diagnostic: attaches the V8 inspector to a running Node process and captures
 * where the main thread is executing. Used to identify a busy loop that leaves
 * the API unresponsive.
 *
 *   node scratch/attachStack.js <pid>
 *
 * Enables the inspector on the target (process._debugProcess), connects over the
 * DevTools protocol, pauses execution and prints the JavaScript call stack.
 */
const http = require('http');

const pid = Number(process.argv[2]);
if (!Number.isInteger(pid)) {
  console.error('Usage: node scratch/attachStack.js <pid>');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getJson = (path) =>
  new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: 9229, path, timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout contacting inspector')));
  });

const run = async () => {
  console.log(`enabling inspector on pid ${pid}...`);
  process._debugProcess(pid);
  await sleep(1500);

  const targets = await getJson('/json/list');
  if (!targets.length) {
    console.error('no inspector targets found');
    process.exit(1);
  }

  const wsUrl = targets[0].webSocketDebuggerUrl;
  console.log(`connecting to ${wsUrl}`);

  // Minimal DevTools protocol client over a raw WebSocket handshake.
  const { WebSocket } = await import('node:worker_threads').then(() => ({ WebSocket: globalThis.WebSocket }));
  if (!WebSocket) {
    console.error('This Node build has no global WebSocket. Use Node 22+ or attach with chrome://inspect.');
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      id += 1;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  const events = [];

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message.result);
      pending.delete(message.id);
    } else if (message.method) {
      events.push(message);
    }
  });

  await send('Debugger.enable');
  await send('Runtime.enable');

  console.log('requesting pause...');
  await send('Debugger.pause');
  await sleep(2500);

  const paused = events.find((e) => e.method === 'Debugger.paused');

  if (!paused) {
    console.log('The thread did not yield to the debugger within the timeout.');
    console.log('That itself indicates a loop that never reaches a V8 interrupt check.');
  } else {
    console.log('\n=== JavaScript call stack of the blocked main thread ===\n');
    for (const [index, frame] of paused.params.callFrames.entries()) {
      const url = (frame.url || '').replace(/^file:\/\/\//, '');
      const line = frame.location.lineNumber + 1;
      console.log(`  #${index}  ${frame.functionName || '(anonymous)'}`);
      console.log(`        ${url}:${line}`);
      if (index > 25) {
        console.log(`        ... ${paused.params.callFrames.length - index} more frames`);
        break;
      }
    }
  }

  await send('Debugger.resume').catch(() => {});
  ws.close();
  process.exit(0);
};

run().catch((error) => {
  console.error('attach failed:', error.message);
  process.exit(1);
});
