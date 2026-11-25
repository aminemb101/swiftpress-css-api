import minimalcss from 'minimalcss';

/** Extract CSS used by the rendered page at the supplied URL. */
export default async function optimizeMinimalCss(url) {
  const result = await minimalcss.minimize({
    urls: [url],
    debug: true,
    styletags: true,
    skippable: (request) => ['image', 'font', 'media'].includes(request.resourceType()),
    puppeteerArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
    ignoreCSSErrors: true,
    ignoreJSErrors: true,
    ignoreRequestErrors: true,
    timeout: 60000,
  });

  if (typeof result?.finalCss !== 'string') {
    throw new Error('minimalcss did not return CSS');
  }

  return result.finalCss;
}
