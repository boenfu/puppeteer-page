import fetch from 'node-fetch';
import Puppeteer from 'puppeteer-core';

export interface PuppeteerRemoteOptions {
  server: string;
  port: number;
  auth?: {
    username: string;
    password: string;
  };
}

export async function puppeteerBrowser({
  auth,
  server,
  port,
}: PuppeteerRemoteOptions): Promise<Puppeteer.Browser> {
  const uuid = await fetch(`http://${server}:${port}/json/version`, {
    headers: {
      ...(auth
        ? {
            Authorization: `Basic ${Buffer.from(
              `${auth.username}:${auth.password}`,
            ).toString('base64')}`,
          }
        : {}),
    },
  })
    .then(response => response.json())
    .then(
      ({webSocketDebuggerUrl}) =>
        String(webSocketDebuggerUrl).split('/devtools/browser/')[1],
    );

  return Puppeteer.connect({
    browserWSEndpoint: `ws://${server}:${port}/devtools/browser/${uuid}`,
  });
}

export async function puppeteerPage(
  options: PuppeteerRemoteOptions | Puppeteer.Browser,
): Promise<Puppeteer.Page> {
  const browser =
    // Browser.isConnected
    'isConnected' in options ? options : await puppeteerBrowser(options);

  return browser.newPage();
}

export interface AutoClosePageOptions extends PuppeteerRemoteOptions {
  /**
   * 执行报错时是否重试
   */
  retry?: boolean;
  /**
   * 自动清理选项
   */
  autoClean?: {
    /**
     * 清理打开时间超时的 page (单位秒)
     * default: 300 s
     */
    timeout?: number;
  };
}

export async function autoClosePage<T>(
  fn: (page: Puppeteer.Page) => Promise<T> | T,
  {retry, autoClean: {timeout = 300} = {}, ...options}: AutoClosePageOptions,
): Promise<T> {
  const browser = await puppeteerBrowser(options);
  const page = await puppeteerPage(browser);

  // 监听页面跳转，重新打时间戳
  await page.setRequestInterception(true);

  page.on('request', request => {
    let parentFrame = request.frame()?.parentFrame();

    if (request.isNavigationRequest() && parentFrame === null) {
      page.waitForNavigation().then(
        () => markOpenedTimestamp(page),
        () => {},
      );
    }

    return request.continue();
  });

  await checkPagesTimeout(browser, timeout);

  let ret!: {
    value: T | undefined;
  };

  try {
    ret = {
      value: await fn(page),
    };
  } catch (error) {
    if (!retry) {
      throw error;
    }
  } finally {
    try {
      await page.close();
      await browser.disconnect();
    } catch (error) {
      // 忽略由用户提前 close 触发的错误
    }

    if (retry && !ret) {
      ret = {
        value: await autoClosePage(fn, options),
      };
    }
  }

  return ret.value!;
}

declare global {
  interface Window {
    _puppeteer_page_timestamp: number;
  }
}

async function checkPagesTimeout(
  browser: Puppeteer.Browser,
  timeout: number,
): Promise<void> {
  for (let page of await browser.pages()) {
    let timestamp = await page.evaluate(
      () => window['_puppeteer_page_timestamp'],
    );

    if (!timestamp) {
      await markOpenedTimestamp(page);
      continue;
    }

    if ((Date.now() - +timestamp) / 1000 < timeout) {
      continue;
    }

    await page.close();
  }
}

async function markOpenedTimestamp(page: Puppeteer.Page): Promise<void> {
  await page.addScriptTag({
    content: '_puppeteer_page_timestamp = Date.now()',
  });
}
