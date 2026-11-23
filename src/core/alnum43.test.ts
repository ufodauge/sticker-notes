import { expect, test } from "vite-plus/test";
import { ALNUM43_ALPHABET, decodeAlnum43, encodeAlnum43 } from "./alnum43.ts";
import { rng } from "./testing/fixtures.ts";

test("alphabet is QR alphanumeric minus space and %", () => {
  expect(ALNUM43_ALPHABET).toHaveLength(43);
  expect(ALNUM43_ALPHABET).not.toMatch(/[ %]/);
});

test("round trip including odd lengths", () => {
  const r = rng(3);
  for (let len = 0; len < 80; len++) {
    const b = Uint8Array.from({ length: len }, () => Math.floor(r() * 256));
    const text = encodeAlnum43(b);
    expect(text).toHaveLength(Math.floor(len / 2) * 3 + (len % 2) * 2);
    expect(decodeAlnum43(text)).toEqual(b);
  }
});

test("edge values", () => {
  expect(encodeAlnum43(new Uint8Array([0xff, 0xff]))).toBe("ZJ3");
  expect(encodeAlnum43(new Uint8Array([0xff]))).toBe("5.");
  expect(decodeAlnum43(encodeAlnum43(new Uint8Array([0xff, 0xff, 0xff])))).toEqual(
    new Uint8Array([0xff, 0xff, 0xff]),
  );
  expect(encodeAlnum43(new Uint8Array([0, 0]))).toBe("000");
});

test("rejects non-canonical input", () => {
  expect(decodeAlnum43("0")).toBeUndefined();
  expect(decodeAlnum43("::::")).toBeUndefined();
  expect(decodeAlnum43(":::")).toBeUndefined();
  expect(decodeAlnum43("::")).toBeUndefined();
  expect(decodeAlnum43("ab0")).toBeUndefined();
  expect(decodeAlnum43("0 0")).toBeUndefined();
  expect(decodeAlnum43("0%0")).toBeUndefined();
  expect(decodeAlnum43("０00")).toBeUndefined();
});

test("rejects an invalid character at every position of a group", () => {
  for (const bad of ["a00", "0a0", "00a"]) expect(decodeAlnum43(bad)).toBeUndefined();
  for (const bad of ["a0", "0a", "aa", "0 "]) expect(decodeAlnum43(bad)).toBeUndefined();
  expect(decodeAlnum43("00")).toEqual(new Uint8Array([0]));
  expect(decodeAlnum43("")).toEqual(new Uint8Array(0));
});
