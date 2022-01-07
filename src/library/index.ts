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
    'isConnected' in options ? options : await puppeteerBrowser(options);

  return browser.newPage();
}

export interface AutoClosePageOptions extends PuppeteerRemoteOptions {
  /**
   * 执行报错时是否重试
   */
  retry?: boolean;
  /**
   * @deprecated
   * 自动清理选项
   */
  autoClean?: {
    /**
     * 清理打开时间超时的 page
     */
    timeout?: number;
  };
}

export async function autoClosePage(
  fn: (page: Puppeteer.Page) => Promise<void> | void,
  {retry, ...options}: AutoClosePageOptions,
): Promise<void> {
  const browser = await puppeteerBrowser(options);
  const page = await puppeteerPage(browser);

  try {
    await fn(page);
  } catch (error) {
    if (!retry) {
      throw error;
    }
  } finally {
    await page.close();
    await browser.disconnect();

    if (retry) {
      await autoClosePage(fn, options);
    }
  }
}
