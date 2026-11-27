import minimalcss from 'minimalcss';

/** Extract CSS used by the rendered page at the supplied URL. */
export default async function optimizeMinimalCss(url, whitelist = []) {
  const result = await minimalcss.minimize({
    urls: [url],
    whitelist,
    debug: true,
    styletags: true,
    skippable: (request) => {
     

      const url = request.url();
      if (url.includes('fonts.googleapis.com') || url.includes('use.typekit.net')) {
        return true;
      }

      return false;
    },
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
