import fsp from 'fs/promises';
import path from 'path';

// Per-file async lock: every read/update against the same file is chained
// onto the same promise, so two requests handled by this single Node
// process can never interleave their read-modify-write cycles and clobber
// each other. (A single Node process handling all requests is exactly this
// app's deployment model, so this is sufficient without cross-process file
// locks.)
const locks = new Map(); // filePath -> Promise

function withLock(filePath, task) {
  const previous = locks.get(filePath) || Promise.resolve();
  const settled = previous.then(task, task);
  // Keep the chain alive even if `task` rejected, so subsequent callers
  // aren't stuck waiting on a permanently-rejected promise.
  locks.set(
    filePath,
    settled.then(
      () => {},
      () => {}
    )
  );
  return settled;
}

export class JsonStore {
  constructor(filePath, defaultValue) {
    this.filePath = filePath;
    this.defaultValue = defaultValue;
    this._dirEnsured = false;
  }

  async _ensureDir() {
    if (this._dirEnsured) return;
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    this._dirEnsured = true;
  }

  async _readRaw() {
    await this._ensureDir();
    let text;
    try {
      text = await fsp.readFile(this.filePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        return structuredClone(this.defaultValue);
      }
      throw err;
    }

    if (!text.trim()) {
      return structuredClone(this.defaultValue);
    }

    try {
      return JSON.parse(text);
    } catch (parseErr) {
      // Corrupted file: don't crash the app or silently drop data — move
      // the bad file aside and start fresh from the default value.
      const backupPath = `${this.filePath}.corrupted-${Date.now()}`;
      try {
        await fsp.rename(this.filePath, backupPath);
        console.error(
          `[jsonStore] ${this.filePath} contained invalid JSON; backed up to ${backupPath} and reset to default.`
        );
      } catch (renameErr) {
        console.error(
          `[jsonStore] ${this.filePath} contained invalid JSON and could not be backed up:`,
          renameErr
        );
      }
      return structuredClone(this.defaultValue);
    }
  }

  async _writeRaw(data) {
    await this._ensureDir();
    const dir = path.dirname(this.filePath);
    const base = path.basename(this.filePath);
    const tmpPath = path.join(dir, `.${base}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    // Rename is atomic on the same filesystem/volume (true on Windows/NTFS
    // and POSIX filesystems alike), so readers never observe a half-written file.
    await fsp.rename(tmpPath, this.filePath);
  }

  /** Read the whole collection. */
  read() {
    return withLock(this.filePath, () => this._readRaw());
  }

  /**
   * Read-modify-write under the same per-file lock used by read(), so a
   * concurrent read() or update() against this file can't interleave with
   * this one. `mutator(data)` may mutate `data` in place and/or return a
   * value to hand back to the caller; the (possibly mutated) data is always
   * what gets persisted.
   */
  update(mutator) {
    return withLock(this.filePath, async () => {
      const data = await this._readRaw();
      const result = await mutator(data);
      await this._writeRaw(data);
      return result;
    });
  }
}
