import test from 'node:test';
import assert from 'node:assert/strict';
import { isRequestAllowed, getCountryCode } from '../src/access.js';

test('permits Costa Rica requests', () => {
  const request = new Request('https://example.com/api/users', {
    headers: { 'cf-ipcountry': 'CR' },
  });

  assert.equal(getCountryCode(request), 'CR');
  assert.equal(isRequestAllowed(request, {}), true);
});

test('blocks requests from other countries', () => {
  const request = new Request('https://example.com/api/users', {
    headers: { 'cf-ipcountry': 'US' },
  });

  assert.equal(getCountryCode(request), 'US');
  assert.equal(isRequestAllowed(request, {}), false);
});

test('allows localhost development requests', () => {
  const request = new Request('http://localhost:8787/api/health');
  assert.equal(getCountryCode(request), null);
  assert.equal(isRequestAllowed(request, {}), true);
});
