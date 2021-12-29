# puppeteer-page

simple wrapper

```javascript
import {puppeteerPage} from 'puppeteer-page';

const page = await puppeteerPage({
  server: 'localhost',
  port: 9222,
});

page.goto('...');
```

[官方文档](https://pptr.dev/#?product=Puppeteer&version=v13.0.1&show=api-class-page)
