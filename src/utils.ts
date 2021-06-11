import * as fs from 'fs';
import * as path from 'path';
import * as shell from 'child_process';

export function exec(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    shell.exec(cmd, { encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err || stderr) reject({ err, stdout, stderr });
      else resolve(stdout);
    });
  });
}

export function readJsonSync(path: string) {
  return JSON.parse(fs.readFileSync(path, { encoding: 'utf8' }));
}

export function writeJsonSync(path: string, json: Object) {
  return fs.writeFileSync(path, JSON.stringify(json));
}

export function makeSureDir(dir: string) {
  try {
    fs.statSync(dir, { throwIfNoEntry: true });
  } catch (error) {
    fs.mkdirSync(dir);
  }
}

export async function walkDir(
  src: string,
  callback: (file: string, type: boolean) => Promise<void> | void,
) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    await callback(src, true);
    const files = fs.readdirSync(src);
    for (let file of files) {
      await walkDir(path.resolve(src, file), callback);
    }
  } else {
    await callback(src, false);
  }
}

export function sleep(t: number) {
  return new Promise(r => setTimeout(r, t));
}
