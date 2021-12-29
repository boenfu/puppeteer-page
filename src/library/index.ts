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

export async function puppeteerPage({
  auth,
  server,
  port,
}: PuppeteerRemoteOptions): Promise<Puppeteer.Page> {
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

  const browser = await Puppeteer.connect({
    browserWSEndpoint: `ws://${server}:${port}/devtools/browser/${uuid}`,
  });

  return browser.newPage();
}
