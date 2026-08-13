/**
 * Minimal assertion harness.
 *
 * The project already used plain `assert` with hand-rolled runners, so this
 * keeps that dependency-free approach while giving every suite the same
 * grouping, summary and exit-code behaviour.
 */
const assert = require('assert');

const createSuite = (title) => {
  let passed = 0;
  let failed = 0;
  const failures = [];

  const line = (char = '-') => console.log(char.repeat(64));

  console.log('');
  line('=');
  console.log(`  ${title}`);
  line('=');

  const group = (name) => console.log(`\n${name}`);

  const record = (ok, description, error) => {
    if (ok) {
      passed++;
      console.log(`  PASS  ${description}`);
    } else {
      failed++;
      failures.push({ description, error });
      console.log(`  FAIL  ${description}`);
      if (error) console.log(`        ${error.message.split('\n')[0]}`);
    }
  };

  const test = (description, fn) => {
    try {
      fn();
      record(true, description);
    } catch (error) {
      record(false, description, error);
    }
  };

  const testAsync = async (description, fn) => {
    try {
      await fn();
      record(true, description);
    } catch (error) {
      record(false, description, error);
    }
  };

  const summary = () => {
    console.log('');
    line();
    console.log(`  ${title}: ${passed} passed, ${failed} failed`);
    line();
    return { passed, failed, failures };
  };

  return { test, testAsync, group, summary, assert };
};

module.exports = { createSuite, assert };
