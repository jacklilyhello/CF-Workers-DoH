const https = require('https');
const { URL } = require('url');

const endpoint = process.env.DOH_ENDPOINT || 'https://doh.cmliussss.hidns.co/dns-query';
const testDomain = process.env.TEST_DOMAIN || 'google.com';  // 要测试解析的域名

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseDnsMessage(buf) {
  if (buf.length < 12) return { error: 'DNS message too short' };

  const id = buf.readUInt16BE(0);        // 事务ID
  const flags = buf.readUInt16BE(2);      // 标志位
  const qdcount = buf.readUInt16BE(4);    // 问题数量
  const ancount = buf.readUInt16BE(6);    // 答案数量
  const nscount = buf.readUInt16BE(8);    // 权威记录数量
  const arcount = buf.readUInt16BE(10);   // 附加记录数量

  const qr = (flags >> 15) & 1;          // 查询/响应标志
  const opcode = (flags >> 11) & 15;     // 操作码
  const aa = (flags >> 10) & 1;          // 权威答案
  const tc = (flags >> 9) & 1;           // 截断标志
  const rd = (flags >> 8) & 1;           // 期望递归
  const ra = (flags >> 7) & 1;           // 递归可用
  const rcode = flags & 15;              // 响应码

  let offset = 12;
  const questions = [];
  const answers = [];

  // 解析问题部分
  for (let i = 0; i < qdcount; i++) {
    const { name, newOffset } = parseDnsName(buf, offset);
    if (newOffset + 4 > buf.length) break;
    const qtype = buf.readUInt16BE(newOffset);
    const qclass = buf.readUInt16BE(newOffset + 2);
    questions.push({ name, type: qtype, class: qclass });
    offset = newOffset + 4;
  }

  // 解析答案部分
  for (let i = 0; i < ancount && offset < buf.length; i++) {
    const { name, newOffset } = parseDnsName(buf, offset);
    if (newOffset + 10 > buf.length) break;
    const type = buf.readUInt16BE(newOffset);
    const cls = buf.readUInt16BE(newOffset + 2);
    const ttl = buf.readUInt32BE(newOffset + 4);
    const rdlength = buf.readUInt16BE(newOffset + 8);

    let rdata = '';
    const dataStart = newOffset + 10;
    if (dataStart + rdlength <= buf.length) {
      if (type === 1 && rdlength === 4) { // A记录
        const ip = Array.from(buf.slice(dataStart, dataStart + 4)).join('.');
        rdata = ip;
      } else {
        rdata = buf.slice(dataStart, dataStart + rdlength).toString('hex');
      }
    }

    answers.push({ name, type, class: cls, ttl, rdata });
    offset = dataStart + rdlength;
  }

  return {
    id,
    flags: { qr, opcode, aa, tc, rd, ra, rcode },
    questions,
    answers,
    counts: { qdcount, ancount, nscount, arcount }
  };
}

function parseDnsName(buf, offset) {
  let name = '';
  let jumped = false;
  let jumpOffset = 0;

  while (offset < buf.length) {
    const len = buf[offset];
    if (len === 0) {
      offset++;
      break;
    }

    if ((len & 0xc0) === 0xc0) { // 压缩指针
      if (!jumped) {
        jumpOffset = offset + 2;
        jumped = true;
      }
      offset = ((len & 0x3f) << 8) | buf[offset + 1];
      continue;
    }

    if (name) name += '.';
    if (offset + len + 1 > buf.length) break;
    name += buf.slice(offset + 1, offset + len + 1).toString('utf8');
    offset += len + 1;
  }

  return { name, newOffset: jumped ? jumpOffset : offset };
}

// 一个简单的DNS查询 - 动态生成基于testDomain的A记录查询 (二进制DNS消息)
function createDnsQuery(domain) {
  const labels = domain.split('.');
  const questionData = [];

  // 编码域名标签
  for (const label of labels) {
    questionData.push(label.length);
    for (let i = 0; i < label.length; i++) {
      questionData.push(label.charCodeAt(i));
    }
  }
  questionData.push(0);  // 域名结束标记

  const query = Buffer.from([
    0x12,0x34, // ID
    0x01,0x00, // 标志位
    0x00,0x01, // QDCOUNT (问题数)
    0x00,0x00, // ANCOUNT (答案数)
    0x00,0x00, // NSCOUNT (权威记录数)
    0x00,0x00, // ARCOUNT (附加记录数)
    ...questionData,
    0x00,0x01, // QTYPE=A
    0x00,0x01, // QCLASS=IN
  ]);

  return query;
}

const dnsQuery = createDnsQuery(testDomain);

function doRequest(method, fullUrl, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const startTime = process.hrtime.bigint();  // 开始时间（高精度）
    const u = new URL(fullUrl);
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      headers,
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const endTime = process.hrtime.bigint();  // 结束时间（高精度）
        const responseTime = Number(endTime - startTime) / 1000000;  // 转换为毫秒
        const buf = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: buf,
          responseTime: responseTime  // 添加响应时间
        });
      });
    });
    req.on('error', (err) => {
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000;
      err.responseTime = responseTime;
      reject(err);
    });
    if (body) req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log(`正在测试域名: ${testDomain}`);
  console.log(`DoH 端点: ${endpoint}`);
  console.log('=' .repeat(50));

  const testResults = [];  // 存储所有测试结果

  const tests = [
    {
      name: 'RFC8484 GET',
      fullName: 'RFC8484 GET (dns=base64url)',
      method: 'GET',
      url: `${endpoint}?dns=${base64url(dnsQuery)}`,
      headers: { Accept: 'application/dns-message, application/dns-json, */*' },
    },
    {
      name: 'RFC8484 POST',
      fullName: 'RFC8484 POST (application/dns-message)',
      method: 'POST',
      url: endpoint,
      headers: { 'Content-Type': 'application/dns-message', Accept: '*/*' },
      body: dnsQuery,
    },
    {
      name: 'JSON API',
      fullName: 'JSON API GET (application/dns-json)',
      method: 'GET',
      url: `${endpoint}?name=${testDomain}&type=A`,
      headers: { Accept: 'application/dns-json, application/json, */*' },
    },
  ];

  for (const t of tests) {
    try {
      process.stdout.write(`\n⏳ 正在测试: ${t.fullName}...`);
      const res = await doRequest(t.method, t.url, t.headers, t.body);
      const ct = res.headers['content-type'] || res.headers['Content-Type'] || '';

      // 清除当前行并显示结果
      process.stdout.write(`\r✅ ${t.fullName} - ${res.responseTime.toFixed(1)}ms\n`);
      console.log(`   状态码: ${res.statusCode}`);
      console.log(`   内容类型: ${ct}`);
      console.log(`   响应大小: ${res.body.length} bytes`);

      // 保存测试结果
      testResults.push({
        name: t.name,  // 使用简化的名称用于表格显示
        fullName: t.fullName,  // 保留完整名称用于详细输出
        status: res.statusCode,
        responseTime: res.responseTime,
        success: res.statusCode === 200
      });

      // 显示小的十六进制/utf8预览
      const preview = res.body.slice(0, 256);
      const isText = /json|text|xml|html|javascript/.test(ct);
      const isDnsMessage = ct.includes('application/dns-message');

      if (isDnsMessage) {
        console.log('   DNS解析结果:');
        const parsed = parseDnsMessage(res.body);
        if (parsed.error) {
          console.log(`     ❌ ${parsed.error}`);
        } else {
          console.log(`     🔍 查询: ${parsed.questions[0]?.name || 'N/A'}`);
          console.log(`     📝 答案数量: ${parsed.counts.ancount}`);

          if (parsed.answers.length > 0) {
            console.log('     📋 IP地址:');
            parsed.answers.forEach(a => {
              const typeStr = a.type === 1 ? 'A' : a.type === 28 ? 'AAAA' : `TYPE${a.type}`;
              console.log(`       • ${a.rdata} (TTL: ${a.ttl}s)`);
            });
          }
        }
      } else if (isText) {
        console.log('   响应内容 (文本):', preview.toString('utf8').substring(0, 100) + (preview.length > 100 ? '...' : ''));
      } else {
        console.log('   响应内容 (二进制):', preview.toString('hex').substring(0, 50) + (preview.length > 25 ? '...' : ''));
      }
    } catch (err) {
      process.stdout.write(`\r❌ ${t.fullName} - 失败\n`);
      console.log(`   错误: ${err.message || err}`);
      if (err.responseTime) {
        console.log(`   失败时间: ${err.responseTime.toFixed(1)}ms`);
      }

      // 保存错误结果
      testResults.push({
        name: t.name,  // 使用简化的名称用于表格显示
        fullName: t.fullName,
        status: 'ERROR',
        responseTime: err.responseTime || 0,
        success: false,
        error: err.message || err
      });
    }
  }

  // 显示统计汇总
  console.log('\n' + '='.repeat(80));
  console.log('🔍 DoH 协议测试结果汇总');
  console.log('='.repeat(80));

  // 辅助函数：计算字符串的显示宽度（中文字符占2个宽度）
  function getDisplayWidth(str) {
    let width = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charAt(i);
      // 中文字符、全角符号等占2个宽度
      if (/[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef]/.test(char)) {
        width += 2;
      } else {
        width += 1;
      }
    }
    return width;
  }

  // 辅助函数：填充字符串到指定显示宽度
  function padToWidth(str, targetWidth) {
    const currentWidth = getDisplayWidth(str);
    const spacesToAdd = Math.max(0, targetWidth - currentWidth);
    return str + ' '.repeat(spacesToAdd);
  }

  // 表格标题
  console.log('┌─────────────────────┬──────────┬─────────────┬────────────┐');
  console.log('│ 协议类型            │ 状态     │ 响应时间    │ 支持情况   │');
  console.log('├─────────────────────┼──────────┼─────────────┼────────────┤');

  // 显示每个测试结果
  testResults.forEach(result => {
    const name = padToWidth(result.name, 19);  // 缩小协议类型列宽度
    const status = result.success ? padToWidth('✅ 200', 8) :
                  (result.status === 'ERROR' ? padToWidth('❌ ERR', 8) : padToWidth(`❌ ${result.status}`, 8));
    const time = padToWidth(result.responseTime > 0 ? `${result.responseTime.toFixed(1)}ms` : 'N/A', 11);
    const support = result.success ? padToWidth('✅ 支持', 10) : padToWidth('❌ 不支持', 10);

    console.log(`│ ${name} │ ${status} │ ${time} │ ${support} │`);
  });

  console.log('└─────────────────────┴──────────┴─────────────┴────────────┘');

  // 性能统计
  const successfulTests = testResults.filter(r => r.success);
  if (successfulTests.length > 0) {
    const responseTimes = successfulTests.map(r => r.responseTime);
    const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const minTime = Math.min(...responseTimes);
    const maxTime = Math.max(...responseTimes);

    console.log('\n📊 性能指标:');
    console.log(`   🎯 支持的协议: ${successfulTests.length}/${testResults.length} (${(successfulTests.length/testResults.length*100).toFixed(0)}%)`);
    console.log(`   ⚡ 平均延迟:   ${avgTime.toFixed(1)}ms`);
    console.log(`   🚀 最快延迟:   ${minTime.toFixed(1)}ms`);
    console.log(`   🐌 最慢延迟:   ${maxTime.toFixed(1)}ms`);

    // 性能等级评估
    const performanceLevel = avgTime < 50 ? '🚀 优秀' : avgTime < 100 ? '⚡ 良好' : avgTime < 200 ? '🔄 一般' : '🐌 较慢';
    console.log(`   📈 性能等级:   ${performanceLevel}`);

    // 推荐协议
    if (successfulTests.length > 0) {
      const fastest = successfulTests.reduce((prev, current) =>
        prev.responseTime < current.responseTime ? prev : current
      );
      console.log(`   💡 推荐协议:   ${fastest.name} (${fastest.responseTime.toFixed(1)}ms)`);
    }
  } else {
    console.log('\n❌ 测试结果: 所有协议都不支持');
    console.log('   请检查 DoH 端点地址是否正确');
  }

  console.log('\n' + '='.repeat(80));
}

runTests().catch((e) => { console.error('严重错误', e); process.exit(1); });
