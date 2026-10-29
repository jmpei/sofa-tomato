// Unit tests for src/localdb.js, the on-device stand-in for the shared store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalDb } from "../src/localdb.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

test("set, get, update (nested merge) and delete", async () => {
  const db = createLocalDb(null);
  const ref = db.doc("nights/a+b");
  assert.equal((await ref.get()).exists, false);
  await assert.rejects(ref.update({ x: 1 }), { code: "invalid_argument" });

  await ref.set({ ready: { a: 1 }, passed: ["X"] });
  await ref.update({ ready: { b: 2 }, passed: ["Y"] });
  assert.deepEqual((await ref.get()).data(), { ready: { a: 1, b: 2 }, passed: ["Y"] });

  await ref.delete();
  assert.equal((await ref.get()).exists, false);
});

test("a collection lists only its direct documents and stays live", async () => {
  const db = createLocalDb(null);
  const seen = [];
  const stop = db.collection("logs/u1/movies").onSnapshot((snap) => seen.push(snap.docs.map((d) => d.id)));
  await tick();
  await db.doc("logs/u1/movies/m1").set({ title: "A" });
  await db.doc("logs/u2/movies/m9").set({ title: "Other person" });
  await tick();
  stop();
  await db.doc("logs/u1/movies/m2").set({ title: "After stop" });
  await tick();
  assert.deepEqual(seen, [[], ["m1"]]);
});

test("survives a storage that throws on write", async () => {
  const broken = { length: 0, key: () => null, getItem: () => null, setItem() { throw new Error("full"); }, removeItem() {} };
  const db = createLocalDb(broken);
  await assert.rejects(db.doc("a/b").set({ x: 1 }), { code: "quota_exceeded" });
});
