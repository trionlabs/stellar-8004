// Run with: deno test webapp/supabase/functions/_shared/uri.test.ts
import { assertEquals } from 'jsr:@std/assert';
import { isPrivateOrLoopbackHost } from './uri.ts';

Deno.test('isPrivateOrLoopbackHost - public IPv4 is allowed', () => {
  assertEquals(isPrivateOrLoopbackHost('8.8.8.8'), false);
  assertEquals(isPrivateOrLoopbackHost('1.1.1.1'), false);
  assertEquals(isPrivateOrLoopbackHost('142.250.80.46'), false);
});

Deno.test('isPrivateOrLoopbackHost - public hostnames are allowed', () => {
  assertEquals(isPrivateOrLoopbackHost('ipfs.io'), false);
  assertEquals(isPrivateOrLoopbackHost('gateway.pinata.cloud'), false);
  assertEquals(isPrivateOrLoopbackHost('dweb.link'), false);
});

Deno.test('isPrivateOrLoopbackHost - loopback IPv4 is blocked', () => {
  assertEquals(isPrivateOrLoopbackHost('127.0.0.1'), true);
  assertEquals(isPrivateOrLoopbackHost('127.5.5.5'), true);
  assertEquals(isPrivateOrLoopbackHost('127.255.255.255'), true);
});

Deno.test('isPrivateOrLoopbackHost - RFC1918 IPv4 is blocked', () => {
  // 10.0.0.0/8
  assertEquals(isPrivateOrLoopbackHost('10.0.0.1'), true);
  assertEquals(isPrivateOrLoopbackHost('10.255.255.255'), true);
  // 172.16.0.0/12
  assertEquals(isPrivateOrLoopbackHost('172.16.0.1'), true);
  assertEquals(isPrivateOrLoopbackHost('172.31.255.255'), true);
  // boundary check: 172.32.0.0 is public
  assertEquals(isPrivateOrLoopbackHost('172.32.0.1'), false);
  assertEquals(isPrivateOrLoopbackHost('172.15.0.1'), false);
  // 192.168.0.0/16
  assertEquals(isPrivateOrLoopbackHost('192.168.1.1'), true);
  assertEquals(isPrivateOrLoopbackHost('192.168.255.255'), true);
});

Deno.test('isPrivateOrLoopbackHost - link-local IPv4 is blocked', () => {
  assertEquals(isPrivateOrLoopbackHost('169.254.1.1'), true);
  assertEquals(isPrivateOrLoopbackHost('169.254.169.254'), true); // AWS metadata
});

Deno.test('isPrivateOrLoopbackHost - CGNAT range is blocked', () => {
  assertEquals(isPrivateOrLoopbackHost('100.64.0.1'), true);
  assertEquals(isPrivateOrLoopbackHost('100.127.255.255'), true);
  // boundary
  assertEquals(isPrivateOrLoopbackHost('100.63.0.1'), false);
  assertEquals(isPrivateOrLoopbackHost('100.128.0.1'), false);
});

Deno.test('isPrivateOrLoopbackHost - 0.0.0.0 and multicast blocked', () => {
  assertEquals(isPrivateOrLoopbackHost('0.0.0.0'), true);
  assertEquals(isPrivateOrLoopbackHost('0.1.2.3'), true);
  assertEquals(isPrivateOrLoopbackHost('224.0.0.1'), true); // multicast
  assertEquals(isPrivateOrLoopbackHost('239.255.255.255'), true);
  assertEquals(isPrivateOrLoopbackHost('240.0.0.1'), true); // reserved
});

Deno.test('isPrivateOrLoopbackHost - bare hostnames blocked', () => {
  assertEquals(isPrivateOrLoopbackHost('localhost'), true);
  assertEquals(isPrivateOrLoopbackHost('LOCALHOST'), true);
  assertEquals(isPrivateOrLoopbackHost('foo.localhost'), true);
  assertEquals(isPrivateOrLoopbackHost('foo.local'), true);
  assertEquals(isPrivateOrLoopbackHost('db.internal'), true);
});

Deno.test('isPrivateOrLoopbackHost - empty string blocked', () => {
  assertEquals(isPrivateOrLoopbackHost(''), true);
});

Deno.test('isPrivateOrLoopbackHost - IPv6 loopback blocked', () => {
  assertEquals(isPrivateOrLoopbackHost('::1'), true);
  assertEquals(isPrivateOrLoopbackHost('[::1]'), true);
  assertEquals(isPrivateOrLoopbackHost('::'), true);
});

Deno.test('isPrivateOrLoopbackHost - IPv6 link-local blocked', () => {
  assertEquals(isPrivateOrLoopbackHost('fe80::1'), true);
  assertEquals(isPrivateOrLoopbackHost('[fe80::1]'), true);
  assertEquals(isPrivateOrLoopbackHost('feb0::1'), true);
});

Deno.test('isPrivateOrLoopbackHost - IPv6 unique-local blocked', () => {
  assertEquals(isPrivateOrLoopbackHost('fc00::1'), true);
  assertEquals(isPrivateOrLoopbackHost('fd12:3456::1'), true);
});

Deno.test('isPrivateOrLoopbackHost - IPv6 multicast blocked', () => {
  assertEquals(isPrivateOrLoopbackHost('ff02::1'), true);
});
