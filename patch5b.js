const fs = require('fs')
const files = ['E:\\note\\quickbrain\\main\\db\\schema.sql', 'E:\\note\\quickbrain\\main\\db\\index.js']
for (const f of files) {
  const b = fs.readFileSync(f)
  const t = b.toString('utf8')
  console.log(f, 'CRLF=' + (t.match(/\r\n/g)||[]).length, 'LF_only=' + ((t.match(/\n/g)||[]).length - (t.match(/\r\n/g)||[]).length))
}