function getCountryCode(request) {
  const header = request.headers.get('cf-ipcountry') || request.headers.get('x-country-code');
  if (!header) return null;
  return header.toUpperCase();
}

function isRequestAllowed(request, env = {}) {
  const allowedCountries = (env.ALLOWED_COUNTRIES || 'CR').split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);

  const url = new URL(request.url);
  const isLocalhost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname);
  if (isLocalhost) return true;

  const countryCode = getCountryCode(request);
  if (!countryCode) {
    return allowedCountries.includes('CR') ? false : true;
  }

  return allowedCountries.includes(countryCode);
}

export { getCountryCode, isRequestAllowed };
